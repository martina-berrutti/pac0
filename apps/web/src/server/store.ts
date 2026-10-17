// Almacenamiento detrás de una interfaz. Hoy en memoria; al final se cambia
// por Convex sin tocar las rutas (TODO.md, fase final).
// Ojo: en Vercel cada instancia tiene su propia memoria y se reinicia, así que
// en la URL pública los datos pueden perderse entre pedidos.
import "server-only";

import { caseBank } from "@/cases";
import type { ClinicalCase } from "@/cases/schema";
import type { ExamAction } from "@/lib/contracts/exam";
import type { Report } from "@/lib/contracts/report";
import type { Session, SessionEvent, Turn } from "@/lib/contracts/session";

export interface Store {
	listCases(ownerId: string): ClinicalCase[];
	getCase(id: string): ClinicalCase | undefined;
	// Casos generados: solo los ve quien los pidió.
	addGeneratedCase(ownerId: string, c: ClinicalCase): void;
	createSession(s: Session): void;
	getSession(id: string): Session | undefined;
	updateSession(id: string, patch: Partial<Session>): Session;
	listSessions(userId: string): Session[];
	addTurn(t: Turn): void;
	listTurns(sessionId: string): Turn[];
	addEvent(e: SessionEvent): void;
	listEvents(sessionId: string): SessionEvent[];
	addExamAction(a: ExamAction): void;
	updateExamAction(
		id: string,
		patch: Partial<ExamAction>,
	): ExamAction | undefined;
	listExamActions(sessionId: string): ExamAction[];
	saveReport(r: Report): void;
	getReport(sessionId: string): Report | undefined;
}

class MemoryStore implements Store {
	private generated = new Map<string, { ownerId: string; c: ClinicalCase }>();
	private sessions = new Map<string, Session>();
	private turns = new Map<string, Turn[]>();
	private events = new Map<string, SessionEvent[]>();
	private exams = new Map<string, ExamAction[]>();
	private reports = new Map<string, Report>();

	listCases(ownerId: string) {
		const own = [...this.generated.values()]
			.filter((g) => g.ownerId === ownerId)
			.map((g) => g.c);
		return [...caseBank, ...own.reverse()];
	}
	getCase(id: string) {
		return caseBank.find((c) => c.id === id) ?? this.generated.get(id)?.c;
	}
	addGeneratedCase(ownerId: string, c: ClinicalCase) {
		this.generated.set(c.id, { ownerId, c });
	}
	createSession(s: Session) {
		this.sessions.set(s.id, s);
	}
	getSession(id: string) {
		return this.sessions.get(id);
	}
	updateSession(id: string, patch: Partial<Session>) {
		const current = this.sessions.get(id);
		if (!current) throw new Error(`Sesión ${id} no existe`);
		const next = { ...current, ...patch };
		this.sessions.set(id, next);
		return next;
	}
	listSessions(userId: string) {
		return [...this.sessions.values()]
			.filter((s) => s.userId === userId)
			.sort((a, b) => b.startedAt - a.startedAt);
	}
	addTurn(t: Turn) {
		this.turns.set(t.sessionId, [...(this.turns.get(t.sessionId) ?? []), t]);
	}
	listTurns(sessionId: string) {
		return this.turns.get(sessionId) ?? [];
	}
	addEvent(e: SessionEvent) {
		this.events.set(e.sessionId, [...(this.events.get(e.sessionId) ?? []), e]);
	}
	listEvents(sessionId: string) {
		return this.events.get(sessionId) ?? [];
	}
	addExamAction(a: ExamAction) {
		this.exams.set(a.sessionId, [...(this.exams.get(a.sessionId) ?? []), a]);
	}
	updateExamAction(id: string, patch: Partial<ExamAction>) {
		for (const [sessionId, list] of this.exams) {
			const i = list.findIndex((a) => a.id === id);
			if (i >= 0) {
				const next = { ...(list[i] as ExamAction), ...patch };
				list[i] = next;
				this.exams.set(sessionId, list);
				return next;
			}
		}
		return undefined;
	}
	listExamActions(sessionId: string) {
		return this.exams.get(sessionId) ?? [];
	}
	saveReport(r: Report) {
		this.reports.set(r.sessionId, r);
	}
	getReport(sessionId: string) {
		return this.reports.get(sessionId);
	}
}

// Un solo store por proceso, que sobrevive a la recarga en caliente de dev.
const globalForStore = globalThis as unknown as { __p0Store?: Store };
export const store: Store = globalForStore.__p0Store ?? new MemoryStore();
globalForStore.__p0Store = store;

export function newId(prefix: string) {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
