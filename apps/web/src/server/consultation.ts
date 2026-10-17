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

export async function ownSession(viewer: Viewer, sessionId: string) {
	const session = await store.getSession(sessionId);
	// Mismo error si no existe o es de otro: no se revela cuál.
	if (!session || session.userId !== viewer.uid)
		throw new HttpError(404, "Sesión no encontrada");
	const clinicalCase = await store.getCase(session.caseId);
	if (!clinicalCase) throw new HttpError(404, "Caso no encontrado");
	return { session, clinicalCase };
}

export async function startSession(
	viewer: Viewer & { alias: string },
	caseId: string,
	personalityKey: string,
) {
	const visible = await store.listCases(viewer.uid);
	const clinicalCase = visible.find((c) => c.id === caseId);
	if (!clinicalCase) throw new HttpError(404, "Caso no encontrado");
	const { key, personality } = resolvePersonality(
		personalityKey,
		clinicalCase.personality,
		clinicalCase.personalityStyle,
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
		historyOverrides: pickVariations(clinicalCase),
		inventedFacts: {},
		voiceUsage: null,
	};
	await store.createSession(session);
	return session.id;
}

// Variación controlada: una opción al azar por clave, sin cambiar el
// diagnóstico (las opciones las define el docente en el caso).
export function pickVariations(
	clinicalCase: ClinicalCase,
	rand: () => number = Math.random,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(clinicalCase.variations ?? {}).map(([k, options]) => [
			k,
			options[Math.floor(rand() * options.length)] as string,
		]),
	);
}

export async function getSessionView(
	viewer: Viewer,
	sessionId: string,
): Promise<SessionView> {
	const { session, clinicalCase } = await ownSession(viewer, sessionId);
	const { userId: _userId, ...publicSession } = session;
	const [turns, examActions, report] = await Promise.all([
		store.listTurns(sessionId),
		store.listExamActions(sessionId),
		store.getReport(sessionId),
	]);
	return {
		session: publicSession,
		case: toSummary(clinicalCase),
		turns,
		examActions,
		remainingMs: Math.max(0, MAX_SESSION_MS - (Date.now() - session.startedAt)),
		hasReport: report !== undefined,
	};
}

export function brief(
	session: Session,
	clinicalCase: ClinicalCase,
): PatientBrief {
	const { style } = resolvePersonality(
		session.personalityKey,
		clinicalCase.personality,
		clinicalCase.personalityStyle,
	);
	return buildPatientBrief(clinicalCase, session.personality, style, session);
}

async function patientReply(
	session: Session,
	clinicalCase: ClinicalCase,
	studentText: string,
): Promise<{
	text: string;
	delta: Partial<PatientState> | null;
	motivo?: string;
}> {
	const b = brief(session, clinicalCase);
	const turns = await store.listTurns(session.id);
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
export async function activeSession(
	viewer: Viewer,
	sessionId: string,
	graceMs = 0,
) {
	const owned = await ownSession(viewer, sessionId);
	if (owned.session.status !== "activa")
		throw new HttpError(409, "La consulta ya terminó");
	const elapsed = Date.now() - owned.session.startedAt;
	if (elapsed > MAX_SESSION_MS + graceMs)
		throw new HttpError(409, "Se terminaron los 8 minutos de la consulta");
	return { ...owned, elapsed };
}

// Si el estudiante explica o pide permiso, queda registrado el consentimiento.
export async function noteConsent(
	session: Session,
	text: string,
	atMs: number,
) {
	if (session.consentGiven || !asksConsent(text)) return session;
	await store.addEvent({
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
export async function recordExam(
	clinicalCase: ClinicalCase,
	sessionId: string,
	zone: string,
	decision: { clarity: InstructionClarity; variant: ExamVariant },
	atMs: number,
): Promise<ExamResult> {
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
	await store.addExamAction(action);
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

// Turno por texto. Sin pantalla: lo usan los tests y scripts/probar-personaje.mjs.
export async function sendTurn(
	viewer: Viewer,
	sessionId: string,
	text: string,
): Promise<TurnResult> {
	const { session, clinicalCase, elapsed } = await activeSession(
		viewer,
		sessionId,
	);
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
	await store.addTurn(studentTurn);

	const current = await noteConsent(session, clean, elapsed);

	let reply: string;
	let exam: ExamResult | null = null;
	const zone = defaultZone(clinicalCase);
	if (zone && isExamRequest(clean)) {
		const decision = interpretExamInstruction(
			clean,
			current.personality,
			current.consentGiven,
		);
		exam = await recordExam(clinicalCase, sessionId, zone, decision, elapsed);
		reply = exam.patientReaction;
	} else {
		const r = await patientReply(current, clinicalCase, clean);
		reply = r.text;
		if (r.delta) {
			await store.updateSession(sessionId, {
				state: { ...current.state, ...r.delta },
			});
			await store.addEvent({
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
	await store.addTurn(patientTurn);
	return { studentTurn, patientTurn, exam };
}

export async function saveExamTimes(
	viewer: Viewer,
	sessionId: string,
	actionId: string,
	hotspotTimesMs: Record<string, number>,
) {
	const { session } = await ownSession(viewer, sessionId);
	const actions = await store.listExamActions(sessionId);
	if (!actions.some((a) => a.id === actionId))
		throw new HttpError(404, "Acción de examen no encontrada");
	const clean = Object.fromEntries(
		Object.entries(hotspotTimesMs)
			.filter(([, v]) => Number.isFinite(v) && v >= 0)
			.map(([k, v]) => [k, Math.min(v, MAX_SESSION_MS)]),
	);
	return store.updateExamAction(actionId, {
		hotspotTimesMs: clean,
		endMs: Date.now() - session.startedAt,
	});
}

export async function finishSession(
	viewer: Viewer,
	sessionId: string,
	hypothesis: string,
	differentials: string[],
): Promise<Report> {
	const { clinicalCase } = await ownSession(viewer, sessionId);
	const existing = await store.getReport(sessionId);
	if (existing) return existing;
	const closed = await store.updateSession(sessionId, {
		status: "evaluada",
		endedAt: Date.now(),
		closing: {
			hypothesis: hypothesis.slice(0, 500),
			differentials: differentials.map((d) => d.slice(0, 100)).slice(0, 10),
		},
	});
	const [turns, events, examActions] = await Promise.all([
		store.listTurns(sessionId),
		store.listEvents(sessionId),
		store.listExamActions(sessionId),
	]);
	const report = evaluate({
		clinicalCase,
		session: closed,
		turns,
		events,
		examActions,
	});
	await store.saveReport(report);
	return report;
}

export async function getReport(viewer: Viewer, sessionId: string) {
	await ownSession(viewer, sessionId);
	const report = await store.getReport(sessionId);
	if (!report) throw new HttpError(404, "Todavía no hay informe");
	return report;
}
