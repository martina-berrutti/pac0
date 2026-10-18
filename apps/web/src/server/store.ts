// Almacenamiento detrás de una interfaz. Con CONVEX_URL y STORE_SECRET usa
// Convex (producción: los datos sobreviven entre instancias de Vercel); sin
// ellas, memoria del proceso (desarrollo local y tests).
import "server-only";

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

import { caseBank, findCase } from "@/cases";
import type { ClinicalCase } from "@/cases/schema";
import type { ExamAction, VitalsMeasurement } from "@/lib/contracts/exam";
import type { MistakeEntry } from "@/lib/contracts/mistakes";
import type { Report } from "@/lib/contracts/report";
import type { Session, SessionEvent, Turn } from "@/lib/contracts/session";
import {
	applySessionChange,
	type SessionChange,
} from "@/lib/contracts/session-change";

// Perfil de un usuario con cuenta (Google): solo alias y año de carrera.
export type Profile = { alias: string; careerYear: string };

// Los campos de `want` siguen valiendo eso (un campo que falta cuenta como
// null). Misma regla que patchIf en packages/backend/convex/records.ts.
function fieldsMatch(value: object, want: object) {
	return Object.entries(want).every(
		([k, v]) =>
			JSON.stringify((value as Record<string, unknown>)[k] ?? null) ===
			JSON.stringify(v ?? null),
	);
}

// Convex solo acepta nombres de campo ASCII que no empiecen con "$". Los
// datos de los casos tienen claves con tilde ("tapón de cerumen" en las
// pistas del diagnóstico): se guardan codificadas y se decodifican al leer.
// Las claves comunes no cambian, así que los datos viejos se leen igual.
const ENCODED_KEY = "~k~";

function needsEncoding(key: string) {
	return (
		key.startsWith("$") ||
		key.startsWith(ENCODED_KEY) ||
		/[^\x20-\x7e]/.test(key)
	);
}

export function encodeKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(encodeKeys);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value).map(([k, v]) => [
			needsEncoding(k) ? `${ENCODED_KEY}${encodeURIComponent(k)}` : k,
			encodeKeys(v),
		]),
	);
}

export function decodeKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(decodeKeys);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value).map(([k, v]) => [
			k.startsWith(ENCODED_KEY)
				? decodeURIComponent(k.slice(ENCODED_KEY.length))
				: k,
			decodeKeys(v),
		]),
	);
}

// Una función de Convex que todavía no está desplegada.
function missingFunction(error: unknown) {
	return /Could not find (public )?function/i.test(String(error));
}

export interface Store {
	getProfile(uid: string): Promise<Profile | undefined>;
	saveProfile(uid: string, profile: Profile): Promise<void>;
	// Perfil de errores entre consultas (server/mistakes.ts).
	getMistakes(uid: string): Promise<MistakeEntry[]>;
	saveMistakes(uid: string, entries: MistakeEntry[]): Promise<void>;
	// Guarda el perfil solo si sigue igual a `expected` (atómico; si no existe
	// cuenta como []); false si otro pedido lo cambió en el medio.
	replaceMistakesIf(
		uid: string,
		expected: MistakeEntry[],
		next: MistakeEntry[],
	): Promise<boolean>;
	// Actualiza solo si los campos de ifEquals siguen valiendo eso (atómico);
	// null si no.
	patchExamActionIf(
		id: string,
		patch: Partial<ExamAction>,
		ifEquals: Partial<ExamAction>,
	): Promise<ExamAction | null>;
	patchVitalsIf(
		id: string,
		patch: Partial<VitalsMeasurement>,
		ifEquals: Partial<VitalsMeasurement>,
	): Promise<VitalsMeasurement | null>;
	listCases(ownerId: string): Promise<ClinicalCase[]>;
	getCase(id: string): Promise<ClinicalCase | undefined>;
	// Casos generados: solo los ve quien los pidió.
	addGeneratedCase(ownerId: string, c: ClinicalCase): Promise<void>;
	createSession(s: Session): Promise<void>;
	getSession(id: string): Promise<Session | undefined>;
	// Reemplaza campos (también atómico, pero para valores que dependen del
	// actual —estado, uso, datos inventados— usar changeSession).
	updateSession(id: string, patch: Partial<Session>): Promise<Session>;
	// Cambio atómico (lib/contracts/session-change.ts). null si la sesión no
	// existe o no se cumple ifStatus.
	changeSession(id: string, change: SessionChange): Promise<Session | null>;
	listSessions(userId: string): Promise<Session[]>;
	// Últimas sesiones de todos, para los docentes.
	listRecentSessions(limit: number): Promise<Session[]>;
	// Sesiones creadas desde `since` por todos, contando hasta `max`.
	countSessionsSince(since: number, max: number): Promise<number>;
	// Suma un pedido a la clave en su ventana; false si ya llegó a max.
	hitRate(key: string, windowMs: number, max: number): Promise<boolean>;
	addTurn(t: Turn): Promise<void>;
	listTurns(sessionId: string): Promise<Turn[]>;
	addEvent(e: SessionEvent): Promise<void>;
	listEvents(sessionId: string): Promise<SessionEvent[]>;
	addExamAction(a: ExamAction): Promise<void>;
	updateExamAction(
		id: string,
		patch: Partial<ExamAction>,
	): Promise<ExamAction | undefined>;
	listExamActions(sessionId: string): Promise<ExamAction[]>;
	addVitals(v: VitalsMeasurement): Promise<void>;
	updateVitals(
		id: string,
		patch: Partial<VitalsMeasurement>,
	): Promise<VitalsMeasurement | undefined>;
	listVitals(sessionId: string): Promise<VitalsMeasurement[]>;
	saveReport(r: Report): Promise<void>;
	getReport(sessionId: string): Promise<Report | undefined>;
}

class MemoryStore implements Store {
	private generated = new Map<string, { ownerId: string; c: ClinicalCase }>();
	private sessions = new Map<string, Session>();
	private turns = new Map<string, Turn[]>();
	private events = new Map<string, SessionEvent[]>();
	private exams = new Map<string, ExamAction>();
	private vitals = new Map<string, VitalsMeasurement[]>();
	private reports = new Map<string, Report>();
	private profiles = new Map<string, Profile>();
	private mistakes = new Map<string, MistakeEntry[]>();
	private rates = new Map<string, { start: number; count: number }>();

	async getProfile(uid: string) {
		return this.profiles.get(uid);
	}
	async saveProfile(uid: string, profile: Profile) {
		this.profiles.set(uid, profile);
	}
	async getMistakes(uid: string) {
		return this.mistakes.get(uid) ?? [];
	}
	async saveMistakes(uid: string, entries: MistakeEntry[]) {
		this.mistakes.set(uid, entries);
	}
	async replaceMistakesIf(
		uid: string,
		expected: MistakeEntry[],
		next: MistakeEntry[],
	) {
		const current = this.mistakes.get(uid) ?? [];
		if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
		this.mistakes.set(uid, next);
		return true;
	}
	async patchExamActionIf(
		id: string,
		patch: Partial<ExamAction>,
		ifEquals: Partial<ExamAction>,
	) {
		const current = this.exams.get(id);
		if (!current || !fieldsMatch(current, ifEquals)) return null;
		const next = { ...current, ...patch };
		this.exams.set(id, next);
		return next;
	}
	async patchVitalsIf(
		id: string,
		patch: Partial<VitalsMeasurement>,
		ifEquals: Partial<VitalsMeasurement>,
	) {
		for (const list of this.vitals.values()) {
			const i = list.findIndex((v) => v.id === id);
			if (i < 0) continue;
			const current = list[i] as VitalsMeasurement;
			if (!fieldsMatch(current, ifEquals)) return null;
			const next = { ...current, ...patch };
			list[i] = next;
			return next;
		}
		return null;
	}
	async listCases(ownerId: string) {
		const own = [...this.generated.values()]
			.filter((g) => g.ownerId === ownerId)
			.map((g) => g.c);
		return [...caseBank, ...own.reverse()];
	}
	async getCase(id: string) {
		return findCase(id) ?? this.generated.get(id)?.c;
	}
	async addGeneratedCase(ownerId: string, c: ClinicalCase) {
		this.generated.set(c.id, { ownerId, c });
	}
	async createSession(s: Session) {
		this.sessions.set(s.id, s);
	}
	async getSession(id: string) {
		return this.sessions.get(id);
	}
	async updateSession(id: string, patch: Partial<Session>) {
		const next = await this.changeSession(id, { set: patch });
		if (!next) throw new Error(`Sesión ${id} no existe`);
		return next;
	}
	// Un solo proceso: aplicar sobre el valor actual ya es atómico.
	async changeSession(id: string, change: SessionChange) {
		const current = this.sessions.get(id);
		if (!current) return null;
		const next = applySessionChange(current, change);
		if (next) this.sessions.set(id, next);
		return next;
	}
	async listSessions(userId: string) {
		return [...this.sessions.values()]
			.filter((s) => s.userId === userId)
			.sort((a, b) => b.startedAt - a.startedAt);
	}
	async listRecentSessions(limit: number) {
		return [...this.sessions.values()]
			.sort((a, b) => b.startedAt - a.startedAt)
			.slice(0, limit);
	}
	async countSessionsSince(since: number, max: number) {
		let count = 0;
		for (const s of this.sessions.values()) if (s.startedAt >= since) count++;
		return Math.min(count, max);
	}
	async hitRate(key: string, windowMs: number, max: number) {
		const now = Date.now();
		const r = this.rates.get(key);
		if (!r || now - r.start >= windowMs) {
			this.rates.set(key, { start: now, count: 1 });
			return true;
		}
		if (r.count >= max) return false;
		r.count += 1;
		return true;
	}
	async addTurn(t: Turn) {
		this.turns.set(t.sessionId, [...(this.turns.get(t.sessionId) ?? []), t]);
	}
	async listTurns(sessionId: string) {
		return this.turns.get(sessionId) ?? [];
	}
	async addEvent(e: SessionEvent) {
		this.events.set(e.sessionId, [...(this.events.get(e.sessionId) ?? []), e]);
	}
	async listEvents(sessionId: string) {
		return this.events.get(sessionId) ?? [];
	}
	async addExamAction(a: ExamAction) {
		this.exams.set(a.id, a);
	}
	async updateExamAction(id: string, patch: Partial<ExamAction>) {
		const current = this.exams.get(id);
		if (!current) return undefined;
		const next = { ...current, ...patch };
		this.exams.set(id, next);
		return next;
	}
	async listExamActions(sessionId: string) {
		return [...this.exams.values()].filter((a) => a.sessionId === sessionId);
	}
	async addVitals(v: VitalsMeasurement) {
		this.vitals.set(v.sessionId, [...(this.vitals.get(v.sessionId) ?? []), v]);
	}
	async updateVitals(id: string, patch: Partial<VitalsMeasurement>) {
		for (const list of this.vitals.values()) {
			const i = list.findIndex((v) => v.id === id);
			if (i >= 0) {
				const next = { ...(list[i] as VitalsMeasurement), ...patch };
				list[i] = next;
				return next;
			}
		}
		return undefined;
	}
	async listVitals(sessionId: string) {
		return this.vitals.get(sessionId) ?? [];
	}
	async saveReport(r: Report) {
		this.reports.set(r.sessionId, r);
	}
	async getReport(sessionId: string) {
		return this.reports.get(sessionId);
	}
}

// Prefijo del id de los invitados (app/api/auth/guest).
export const GUEST_PREFIX = "gst_";

type Kind =
	| "user"
	| "mistakes"
	| "case"
	| "session"
	| "turn"
	| "event"
	| "exam"
	| "vitals"
	| "report";

// Tope de cada pedido a Convex.
const STORE_TIMEOUT_MS = 10_000;

// Convex: cada objeto se guarda entero en la tabla records (packages/backend/convex/records.ts).
class ConvexStore implements Store {
	private client: ConvexHttpClient;
	constructor(
		url: string,
		private secret: string,
	) {
		// Con tope por pedido: si Convex no responde, la ruta contesta con error
		// en vez de quedar esperando hasta que Vercel la corte.
		this.client = new ConvexHttpClient(url, {
			fetch: (input, init) =>
				fetch(input, {
					...init,
					signal: init?.signal
						? AbortSignal.any([
								init.signal,
								AbortSignal.timeout(STORE_TIMEOUT_MS),
							])
						: AbortSignal.timeout(STORE_TIMEOUT_MS),
				}),
		});
	}
	// Toda llamada a Convex pasa por acá: codifica las claves que Convex no
	// acepta al mandar y las decodifica al recibir.
	private async call<R>(
		type: "query" | "mutation",
		// biome-ignore lint/suspicious/noExplicitAny: referencias de anyApi.
		fn: any,
		args: Record<string, unknown>,
	): Promise<R> {
		const encoded = encodeKeys(args) as Record<string, unknown>;
		const result =
			type === "query"
				? await this.client.query(fn, encoded)
				: await this.client.mutation(fn, encoded);
		return decodeKeys(result) as R;
	}
	private put(
		kind: Kind,
		appId: string,
		data: unknown,
		keys: { sessionId?: string; ownerId?: string } = {},
	) {
		return this.call("mutation", anyApi.records.put, {
			secret: this.secret,
			kind,
			appId,
			data,
			...keys,
			// Los invitados se borran a las 24 horas (convex/records.ts).
			guest: keys.ownerId?.startsWith(GUEST_PREFIX) ?? undefined,
		});
	}
	private async get<T>(kind: Kind, appId: string): Promise<T | undefined> {
		return (
			((await this.call("query", anyApi.records.get, {
				secret: this.secret,
				kind,
				appId,
			})) as T | null) ?? undefined
		);
	}
	private bySession<T>(kind: Kind, sessionId: string): Promise<T[]> {
		return this.call("query", anyApi.records.listBySession, {
			secret: this.secret,
			kind,
			sessionId,
		});
	}
	private byOwner<T>(kind: Kind, ownerId: string): Promise<T[]> {
		return this.call("query", anyApi.records.listByOwner, {
			secret: this.secret,
			kind,
			ownerId,
		});
	}

	getProfile(uid: string) {
		return this.get<Profile>("user", uid);
	}
	async saveProfile(uid: string, profile: Profile) {
		await this.put("user", uid, profile, { ownerId: uid });
	}
	async getMistakes(uid: string) {
		return (await this.get<MistakeEntry[]>("mistakes", uid)) ?? [];
	}
	async saveMistakes(uid: string, entries: MistakeEntry[]) {
		await this.put("mistakes", uid, entries, { ownerId: uid });
	}
	async replaceMistakesIf(
		uid: string,
		expected: MistakeEntry[],
		next: MistakeEntry[],
	) {
		try {
			return (await this.call("mutation", anyApi.records.replaceIf, {
				secret: this.secret,
				kind: "mistakes",
				appId: uid,
				ownerId: uid,
				expected,
				data: next,
			})) as boolean;
		} catch (error) {
			// Convex sin desplegar: se guarda como antes (sin atomicidad).
			if (!missingFunction(error)) throw error;
			await this.saveMistakes(uid, next);
			return true;
		}
	}
	async patchExamActionIf(
		id: string,
		patch: Partial<ExamAction>,
		ifEquals: Partial<ExamAction>,
	) {
		return this.patchIf<ExamAction>("exam", id, patch, ifEquals);
	}
	async patchVitalsIf(
		id: string,
		patch: Partial<VitalsMeasurement>,
		ifEquals: Partial<VitalsMeasurement>,
	) {
		return this.patchIf<VitalsMeasurement>("vitals", id, patch, ifEquals);
	}
	private async patchIf<T extends { sessionId: string }>(
		kind: Kind,
		id: string,
		patch: Partial<T>,
		ifEquals: Partial<T>,
	): Promise<T | null> {
		// null en vez de undefined: Convex descarta los undefined al enviar.
		const want = Object.fromEntries(
			Object.entries(ifEquals).map(([k, v]) => [k, v ?? null]),
		);
		try {
			return (await this.call("mutation", anyApi.records.patchIf, {
				secret: this.secret,
				kind,
				appId: id,
				patch,
				ifEquals: want,
			})) as T | null;
		} catch (error) {
			// Convex sin desplegar: leer, chequear y escribir (como antes).
			if (!missingFunction(error)) throw error;
			const current = await this.get<T>(kind, id);
			if (!current || !fieldsMatch(current, ifEquals)) return null;
			const next = { ...current, ...patch };
			await this.put(kind, id, next, { sessionId: next.sessionId });
			return next;
		}
	}
	async listCases(ownerId: string) {
		return [
			...caseBank,
			...(await this.byOwner<ClinicalCase>("case", ownerId)),
		];
	}
	async getCase(id: string) {
		return findCase(id) ?? (await this.get<ClinicalCase>("case", id));
	}
	async addGeneratedCase(ownerId: string, c: ClinicalCase) {
		await this.put("case", c.id, c, { ownerId });
	}
	async createSession(s: Session) {
		await this.put("session", s.id, s, { ownerId: s.userId });
	}
	getSession(id: string) {
		return this.get<Session>("session", id);
	}
	async updateSession(id: string, patch: Partial<Session>) {
		const next = await this.changeSession(id, { set: patch });
		if (!next) throw new Error(`Sesión ${id} no existe`);
		return next;
	}
	// Mutación de Convex: lee y escribe en una transacción.
	async changeSession(id: string, change: SessionChange) {
		return (await this.call("mutation", anyApi.records.changeSession, {
			secret: this.secret,
			appId: id,
			change,
		})) as Session | null;
	}
	listSessions(userId: string) {
		return this.byOwner<Session>("session", userId);
	}
	listRecentSessions(limit: number): Promise<Session[]> {
		return this.call("query", anyApi.records.listRecentSessions, {
			secret: this.secret,
			limit,
		});
	}
	countSessionsSince(since: number, max: number): Promise<number> {
		return this.call("query", anyApi.records.countSessionsSince, {
			secret: this.secret,
			since,
			max,
		});
	}
	// Mutación de Convex: cuenta y decide en una transacción.
	hitRate(key: string, windowMs: number, max: number): Promise<boolean> {
		return this.call("mutation", anyApi.records.hitRate, {
			secret: this.secret,
			key,
			windowMs,
			max,
		});
	}
	async addTurn(t: Turn) {
		await this.put("turn", t.id, t, { sessionId: t.sessionId });
	}
	listTurns(sessionId: string) {
		return this.bySession<Turn>("turn", sessionId);
	}
	async addEvent(e: SessionEvent) {
		await this.put("event", e.id, e, { sessionId: e.sessionId });
	}
	listEvents(sessionId: string) {
		return this.bySession<SessionEvent>("event", sessionId);
	}
	async addExamAction(a: ExamAction) {
		await this.put("exam", a.id, a, { sessionId: a.sessionId });
	}
	async updateExamAction(id: string, patch: Partial<ExamAction>) {
		const current = await this.get<ExamAction>("exam", id);
		if (!current) return undefined;
		const next = { ...current, ...patch };
		await this.put("exam", id, next, { sessionId: next.sessionId });
		return next;
	}
	listExamActions(sessionId: string) {
		return this.bySession<ExamAction>("exam", sessionId);
	}
	async addVitals(v: VitalsMeasurement) {
		await this.put("vitals", v.id, v, { sessionId: v.sessionId });
	}
	async updateVitals(id: string, patch: Partial<VitalsMeasurement>) {
		const current = await this.get<VitalsMeasurement>("vitals", id);
		if (!current) return undefined;
		const next = { ...current, ...patch };
		await this.put("vitals", id, next, { sessionId: next.sessionId });
		return next;
	}
	listVitals(sessionId: string) {
		return this.bySession<VitalsMeasurement>("vitals", sessionId);
	}
	async saveReport(r: Report) {
		await this.put("report", r.sessionId, r, { sessionId: r.sessionId });
	}
	getReport(sessionId: string) {
		return this.get<Report>("report", sessionId);
	}
}

function createStore(): Store {
	const url = process.env.CONVEX_URL;
	const secret = process.env.STORE_SECRET;
	if (url && secret) return new ConvexStore(url, secret);
	if (process.env.VERCEL) {
		// En Vercel la memoria se pierde entre instancias: hace falta Convex.
		console.error(
			"Falta CONVEX_URL o STORE_SECRET: los datos se guardan en memoria y se pueden perder.",
		);
	}
	return new MemoryStore();
}

// Un solo store por proceso, que sobrevive a la recarga en caliente de dev.
const globalForStore = globalThis as unknown as { __p0Store?: Store };
export const store: Store = globalForStore.__p0Store ?? createStore();
export const storeKind: "convex" | "memoria" =
	store instanceof ConvexStore ? "convex" : "memoria";
globalForStore.__p0Store = store;

export function newId(prefix: string) {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
