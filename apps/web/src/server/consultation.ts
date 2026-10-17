// Lógica de la consulta (Persona 1): sesiones, turnos, examen y cierre.
// Toda función recibe al usuario y verifica que la sesión sea suya.
import "server-only";

import { type CaseSummary, type ClinicalCase, toSummary } from "@/cases/schema";
import type {
	ExamAction,
	ExamResult,
	ExamVariant,
	InstructionClarity,
} from "@/lib/contracts/exam";
import type { Report } from "@/lib/contracts/report";
import {
	MAX_SESSION_MS,
	type PatientState,
	type Session,
	type Turn,
} from "@/lib/contracts/session";
import {
	buildPatientBrief,
	buildPatientPrompt,
	type PatientBrief,
} from "@/lib/patient/brief";
import {
	asksConsent,
	interpretExamInstruction,
	isExamRequest,
} from "@/lib/patient/exam-instruction";
import { resolvePersonality } from "@/lib/patient/personalities";
import { ruleRespond } from "@/lib/patient/rule-responder";
import { evaluate } from "@/lib/scoring/evaluate";

import { aiEnabled, chat } from "./ai";
import { HttpError } from "./auth";
import { newId, store } from "./store";
import type { Viewer } from "./token";

export type SessionView = {
	session: Omit<Session, "userId">;
	case: CaseSummary;
	turns: Turn[];
	examActions: ExamAction[];
	remainingMs: number;
	hasReport: boolean;
};

export function ownSession(viewer: Viewer, sessionId: string) {
	const session = store.getSession(sessionId);
	// Mismo error si no existe o es de otro: no se revela cuál.
	if (!session || session.userId !== viewer.uid)
		throw new HttpError(404, "Sesión no encontrada");
	const clinicalCase = store.getCase(session.caseId);
	if (!clinicalCase) throw new HttpError(404, "Caso no encontrado");
	return { session, clinicalCase };
}

export function startSession(
	viewer: Viewer & { alias: string },
	caseId: string,
	personalityKey: string,
) {
	const clinicalCase = store.getCase(caseId);
	const visible = store.listCases(viewer.uid).some((c) => c.id === caseId);
	if (!clinicalCase || !visible) throw new HttpError(404, "Caso no encontrado");
	const { key, personality } = resolvePersonality(
		personalityKey,
		clinicalCase.personality,
	);
	const state: PatientState = {
		confianza: 1 - personality.desconfianza,
		ansiedad: personality.ansiedad,
		dolor: 0.5,
		paciencia: personality.paciencia,
	};
	const session: Session = {
		id: newId("ses"),
		userId: viewer.uid,
		caseId,
		alias: viewer.alias,
		personalityKey: key,
		personality,
		state,
		status: "activa",
		startedAt: Date.now(),
		endedAt: null,
		closing: null,
		consentGiven: false,
	};
	store.createSession(session);
	return session.id;
}

export function getSessionView(viewer: Viewer, sessionId: string): SessionView {
	const { session, clinicalCase } = ownSession(viewer, sessionId);
	const { userId: _userId, ...publicSession } = session;
	return {
		session: publicSession,
		case: toSummary(clinicalCase),
		turns: store.listTurns(sessionId),
		examActions: store.listExamActions(sessionId),
		remainingMs: Math.max(0, MAX_SESSION_MS - (Date.now() - session.startedAt)),
		hasReport: store.getReport(sessionId) !== undefined,
	};
}

export function brief(session: Session): PatientBrief {
	const clinicalCase = store.getCase(session.caseId);
	if (!clinicalCase) throw new HttpError(404, "Caso no encontrado");
	const { style } = resolvePersonality(
		session.personalityKey,
		clinicalCase.personality,
	);
	return buildPatientBrief(clinicalCase, session.personality, style);
}

async function patientReply(
	session: Session,
	studentText: string,
): Promise<{
	text: string;
	delta: Partial<PatientState> | null;
	motivo?: string;
}> {
	const b = brief(session);
	const turns = store.listTurns(session.id);
	const studentCount = turns.filter((t) => t.speaker === "estudiante").length;
	const rules = ruleRespond(b, session.state, studentText, studentCount - 1);
	if (!aiEnabled()) return rules;
	try {
		const text = await chat([
			{
				role: "system",
				content: `${buildPatientPrompt(b)}\nConfianza actual en el estudiante (0 a 1): ${session.state.confianza.toFixed(2)}.`,
			},
			...turns.map((t) => ({
				role:
					t.speaker === "estudiante"
						? ("user" as const)
						: ("assistant" as const),
				content: t.text,
			})),
		]);
		return { text, delta: rules.delta, motivo: rules.motivo };
	} catch {
		return rules;
	}
}

// Exige una sesión activa y dentro del tope de 8 minutos (más un margen para
// que lleguen las últimas transcripciones de la voz).
export function activeSession(viewer: Viewer, sessionId: string, graceMs = 0) {
	const owned = ownSession(viewer, sessionId);
	if (owned.session.status !== "activa")
		throw new HttpError(409, "La consulta ya terminó");
	const elapsed = Date.now() - owned.session.startedAt;
	if (elapsed > MAX_SESSION_MS + graceMs)
		throw new HttpError(409, "Se terminaron los 8 minutos de la consulta");
	return { ...owned, elapsed };
}

// Si el estudiante explica o pide permiso, queda registrado el consentimiento.
export function noteConsent(session: Session, text: string, atMs: number) {
	if (session.consentGiven || !asksConsent(text)) return session;
	store.addEvent({
		id: newId("evt"),
		sessionId: session.id,
		type: "consentimiento",
		atMs,
	});
	return store.updateSession(session.id, { consentGiven: true });
}

export function defaultZone(clinicalCase: ClinicalCase) {
	return clinicalCase.exam.orofaringe
		? "orofaringe"
		: Object.keys(clinicalCase.exam)[0];
}

// Registra una acción de examen. El caso decide qué se ve: el cliente nunca
// manda la variante ni el hallazgo.
export function recordExam(
	clinicalCase: ClinicalCase,
	sessionId: string,
	zone: string,
	decision: { clarity: InstructionClarity; variant: ExamVariant },
	atMs: number,
): ExamResult {
	const action: ExamAction = {
		id: newId("exam"),
		sessionId,
		zone,
		maneuver: "inspeccion",
		clarity: decision.clarity,
		variant: decision.variant,
		hotspotTimesMs: {},
		startMs: atMs,
		endMs: null,
	};
	store.addExamAction(action);
	const zoneData = clinicalCase.exam[zone];
	return {
		action,
		assetKey:
			decision.variant === "negado" || !zoneData
				? null
				: zoneData.variants[decision.variant],
		hotspots: zoneData?.hotspots ?? [],
		patientReaction:
			decision.variant === "negado"
				? "No, pará. No quiero abrir la boca. ¿Para qué es eso?"
				: decision.variant === "parcial"
					? "(abre un poco la boca)"
					: "Aaaaaa...",
	};
}

export type TurnResult = {
	studentTurn: Turn;
	patientTurn: Turn;
	exam: ExamResult | null;
};

export async function sendTurn(
	viewer: Viewer,
	sessionId: string,
	text: string,
): Promise<TurnResult> {
	const { session, clinicalCase, elapsed } = activeSession(viewer, sessionId);
	const clean = text.trim().slice(0, 1000);
	if (!clean) throw new HttpError(400, "Escribí algo");

	const studentTurn: Turn = {
		id: newId("turn"),
		sessionId,
		speaker: "estudiante",
		text: clean,
		startMs: elapsed,
		endMs: elapsed,
		overlap: false,
	};
	store.addTurn(studentTurn);

	const current = noteConsent(session, clean, elapsed);

	let reply: string;
	let exam: ExamResult | null = null;
	const zone = defaultZone(clinicalCase);
	if (zone && isExamRequest(clean)) {
		const decision = interpretExamInstruction(
			clean,
			current.personality,
			current.consentGiven,
		);
		exam = recordExam(clinicalCase, sessionId, zone, decision, elapsed);
		reply = exam.patientReaction;
	} else {
		const r = await patientReply(current, clean);
		reply = r.text;
		if (r.delta) {
			store.updateSession(sessionId, {
				state: { ...current.state, ...r.delta },
			});
			store.addEvent({
				id: newId("evt"),
				sessionId,
				type: "cambio_animo",
				atMs: elapsed,
				delta: r.delta,
				motivo: r.motivo,
			});
		}
	}

	const end = Date.now() - session.startedAt;
	const patientTurn: Turn = {
		id: newId("turn"),
		sessionId,
		speaker: "paciente",
		text: reply,
		startMs: end,
		endMs: end,
		overlap: false,
	};
	store.addTurn(patientTurn);
	return { studentTurn, patientTurn, exam };
}

export function saveExamTimes(
	viewer: Viewer,
	sessionId: string,
	actionId: string,
	hotspotTimesMs: Record<string, number>,
) {
	ownSession(viewer, sessionId);
	const action = store
		.listExamActions(sessionId)
		.find((a) => a.id === actionId);
	if (!action) throw new HttpError(404, "Acción de examen no encontrada");
	const clean = Object.fromEntries(
		Object.entries(hotspotTimesMs)
			.filter(([, v]) => Number.isFinite(v) && v >= 0)
			.map(([k, v]) => [k, Math.min(v, MAX_SESSION_MS)]),
	);
	return store.updateExamAction(actionId, {
		hotspotTimesMs: clean,
		endMs: Date.now() - (store.getSession(sessionId)?.startedAt ?? Date.now()),
	});
}

export function finishSession(
	viewer: Viewer,
	sessionId: string,
	hypothesis: string,
	differentials: string[],
): Report {
	const { session, clinicalCase } = ownSession(viewer, sessionId);
	const existing = store.getReport(sessionId);
	if (existing) return existing;
	const closed = store.updateSession(sessionId, {
		status: "evaluada",
		endedAt: Date.now(),
		closing: {
			hypothesis: hypothesis.slice(0, 500),
			differentials: differentials.map((d) => d.slice(0, 100)).slice(0, 10),
		},
	});
	const report = evaluate({
		clinicalCase,
		session: closed,
		turns: store.listTurns(sessionId),
		events: store.listEvents(sessionId),
		examActions: store.listExamActions(session.id),
	});
	store.saveReport(report);
	return report;
}

export function getReport(viewer: Viewer, sessionId: string) {
	ownSession(viewer, sessionId);
	const report = store.getReport(sessionId);
	if (!report) throw new HttpError(404, "Todavía no hay informe");
	return report;
}
