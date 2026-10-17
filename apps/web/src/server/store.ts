// Almacenamiento detrás de una interfaz. Con CONVEX_URL y STORE_SECRET usa
// Convex (producción: los datos sobreviven entre instancias de Vercel); sin
// ellas, memoria del proceso (desarrollo local y tests).
import "server-only";

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

import { caseBank } from "@/cases";
import type { ClinicalCase } from "@/cases/schema";
import type { ExamAction, VitalsMeasurement } from "@/lib/contracts/exam";
import type { Report } from "@/lib/contracts/report";
import type { Session, SessionEvent, Turn } from "@/lib/contracts/session";

export interface Store {
	listCases(ownerId: string): Promise<ClinicalCase[]>;
	getCase(id: string): Promise<ClinicalCase | undefined>;
	// Casos generados: solo los ve quien los pidió.
	addGeneratedCase(ownerId: string, c: ClinicalCase): Promise<void>;
	createSession(s: Session): Promise<void>;
	getSession(id: string): Promise<Session | undefined>;
	updateSession(id: string, patch: Partial<Session>): Promise<Session>;
	listSessions(userId: string): Promise<Session[]>;
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

	async listCases(ownerId: string) {
		const own = [...this.generated.values()]
			.filter((g) => g.ownerId === ownerId)
			.map((g) => g.c);
		return [...caseBank, ...own.reverse()];
	}
	async getCase(id: string) {
		return caseBank.find((c) => c.id === id) ?? this.generated.get(id)?.c;
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
		const current = this.sessions.get(id);
		if (!current) throw new Error(`Sesión ${id} no existe`);
		const next = { ...current, ...patch };
		this.sessions.set(id, next);
		return next;
	}
	async listSessions(userId: string) {
		return [...this.sessions.values()]
			.filter((s) => s.userId === userId)
			.sort((a, b) => b.startedAt - a.startedAt);
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

type Kind =
	| "case"
	| "session"
	| "turn"
	| "event"
	| "exam"
	| "vitals"
	| "report";

// Convex: cada objeto se guarda entero en la tabla records (packages/backend/convex/records.ts).
class ConvexStore implements Store {
	private client: ConvexHttpClient;
	constructor(
		url: string,
		private secret: string,
	) {
		this.client = new ConvexHttpClient(url);
	}
	private put(
		kind: Kind,
		appId: string,
		data: unknown,
		keys: { sessionId?: string; ownerId?: string } = {},
	) {
		return this.client.mutation(anyApi.records.put, {
			secret: this.secret,
			kind,
			appId,
			data,
			...keys,
		});
	}
	private async get<T>(kind: Kind, appId: string): Promise<T | undefined> {
		return (
			((await this.client.query(anyApi.records.get, {
				secret: this.secret,
				kind,
				appId,
			})) as T | null) ?? undefined
		);
	}
	private bySession<T>(kind: Kind, sessionId: string): Promise<T[]> {
		return this.client.query(anyApi.records.listBySession, {
			secret: this.secret,
			kind,
			sessionId,
		});
	}
	private byOwner<T>(kind: Kind, ownerId: string): Promise<T[]> {
		return this.client.query(anyApi.records.listByOwner, {
			secret: this.secret,
			kind,
			ownerId,
		});
	}

	async listCases(ownerId: string) {
		return [
			...caseBank,
			...(await this.byOwner<ClinicalCase>("case", ownerId)),
		];
	}
	async getCase(id: string) {
		return (
			caseBank.find((c) => c.id === id) ??
			(await this.get<ClinicalCase>("case", id))
		);
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
		const current = await this.getSession(id);
		if (!current) throw new Error(`Sesión ${id} no existe`);
		const next = { ...current, ...patch };
		await this.put("session", id, next, { ownerId: next.userId });
		return next;
	}
	listSessions(userId: string) {
		return this.byOwner<Session>("session", userId);
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
