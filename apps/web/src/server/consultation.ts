// Lógica de la consulta (Persona 1): sesiones, turnos, examen y cierre.
// Toda función recibe al usuario y verifica que la sesión sea suya.
import "server-only";

import { type CaseSummary, type ClinicalCase, toSummary } from "@/cases/schema";
import {
	type ExamAction,
	type ExamResult,
	type ExamVariant,
	type InstructionClarity,
	OTOSCOPY,
} from "@/lib/contracts/exam";
import type { Report } from "@/lib/contracts/report";
import {
	MAX_SESSION_MS,
	type PatientState,
	type Session,
	type SessionEventType,
	type Turn,
} from "@/lib/contracts/session";
import { cutText } from "@/lib/cut-text";
import { asksForEarExam } from "@/lib/exam/end-intent";
import {
	buildPatientBrief,
	buildPatientPrompt,
	type PatientBrief,
} from "@/lib/patient/brief";
import {
	asksConsent,
	interpretExamInstruction,
	isExamRequest,
	namesOtherZone,
} from "@/lib/patient/exam-instruction";
import { getArchetype, resolvePersonality } from "@/lib/patient/personalities";
import { ruleRespond } from "@/lib/patient/rule-responder";
import { applyDelta, EVENT_DELTAS } from "@/lib/patient/state";
import {
	classifyStudentTurn,
	stateBand,
	type TurnTag,
} from "@/lib/patient/turn-classifier";
import { voiceFor } from "@/lib/patient/voices";
import { evaluateWithAi } from "@/lib/scoring/ai-evaluate";
import { evaluate } from "@/lib/scoring/evaluate";

import { aiEnabled, chat, completeJson } from "./ai";
import { HttpError, roleOf } from "./auth";
import { recordMistakes } from "./mistakes";
import { newId, store } from "./store";
import type { Viewer } from "./token";

// Lo que el navegador ve de una sesión. Lista explícita: NO van la historia
// sorteada (historyOverrides), los datos inventados, la personalidad en
// números ni los contadores internos (AGENTS.md: lo oculto del caso vive en
// el servidor). El ánimo (state) sí: el avatar lo muestra en la cara.
export type PublicSession = Pick<
	Session,
	| "id"
	| "caseId"
	| "alias"
	| "personalityKey"
	| "status"
	| "startedAt"
	| "endedAt"
	| "closing"
	| "consentGiven"
	| "voice"
	| "state"
>;

export function toPublicSession(s: Session): PublicSession {
	return {
		id: s.id,
		caseId: s.caseId,
		alias: s.alias,
		personalityKey: s.personalityKey,
		status: s.status,
		startedAt: s.startedAt,
		endedAt: s.endedAt,
		closing: s.closing,
		consentGiven: s.consentGiven,
		voice: s.voice,
		state: s.state,
	};
}

// Topes de la consulta por texto (cada turno llama a la IA).
const MAX_TEXT_TURNS = 120;
const MAX_CONTEXT_TURNS = 30;

export type SessionView = {
	session: PublicSession;
	case: CaseSummary;
	turns: Turn[];
	examActions: ExamAction[];
	remainingMs: number;
	hasReport: boolean;
	// Un docente puede leer la consulta de otro, pero no hablar ni cerrarla.
	readOnly: boolean;
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

// Para leer (consulta e informe): la dueña o un docente autorizado. Para
// cambiar algo sigue haciendo falta ownSession.
export async function readableSession(viewer: Viewer, sessionId: string) {
	if (roleOf(viewer) !== "docente") return ownSession(viewer, sessionId);
	const session = await store.getSession(sessionId);
	if (!session) throw new HttpError(404, "Sesión no encontrada");
	const clinicalCase = await store.getCase(session.caseId);
	if (!clinicalCase) throw new HttpError(404, "Caso no encontrado");
	return { session, clinicalCase };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function limitFromEnv(name: string, fallback: number) {
	const n = Number(process.env[name]);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Topes diarios para que no se acaben los créditos de la voz (plan.md,
// sección 14). Por usuario y en total, porque un invitado nuevo no cuesta nada.
export function sessionLimits() {
	return {
		perUser: limitFromEnv("MAX_SESSIONS_PER_USER_PER_DAY", 10),
		total: limitFromEnv("MAX_SESSIONS_PER_DAY", 200),
	};
}

async function checkSessionLimits(viewer: Viewer) {
	const { perUser, total } = sessionLimits();
	const since = Date.now() - DAY_MS;
	const mine = (await store.listSessions(viewer.uid)).filter(
		(s) => s.startedAt >= since,
	).length;
	if (mine >= perUser)
		throw new HttpError(
			429,
			`Llegaste al tope de ${perUser} consultas por día. Probá de nuevo mañana.`,
		);
	// Si Convex todavía no tiene la función (falta npx convex deploy), no se
	// frena la consulta: el tope por usuario igual se aplica.
	const today = await store.countSessionsSince(since, total).catch((error) => {
		console.error("No se pudo contar las consultas del día", error);
		return 0;
	});
	if (today >= total)
		throw new HttpError(
			429,
			"Hoy se usaron todas las consultas disponibles. Probá de nuevo mañana.",
		);
}

// Margen para la hipótesis y el informe después de los 8 minutos.
const LOGIN_MARGIN_MS = 5 * 60 * 1000;

export async function startSession(
	viewer: Viewer & { alias: string },
	caseId: string,
	personalityKey: string,
	// Corre con todo validado, justo antes de crear la sesión (la ruta cuenta
	// ahí el límite por IP: así un pedido que igual iba a fallar no gasta el
	// cupo de todo el salón).
	beforeCreate: () => Promise<void> = async () => {},
) {
	// Si la sesión de la cuenta vence antes de que termine la consulta, a
	// mitad de camino todo daría 401 y no se podría cerrar ni ver el informe.
	if (viewer.exp - Date.now() < MAX_SESSION_MS + LOGIN_MARGIN_MS)
		throw new HttpError(
			401,
			"Tu sesión vence en unos minutos. Tocá Salir y entrá de nuevo para empezar una consulta.",
		);
	const visible = await store.listCases(viewer.uid);
	const clinicalCase = visible.find((c) => c.id === caseId);
	if (!clinicalCase) throw new HttpError(404, "Caso no encontrado");
	await checkSessionLimits(viewer);
	await beforeCreate();
	// El chequeo de arriba lee y después se crea: con muchos pedidos a la vez
	// pasaban todos. El contador atómico es la última palabra (si Convex no lo
	// tiene desplegado, queda el chequeo de arriba).
	const { perUser } = sessionLimits();
	const allowed = await store
		.hitRate(`user-sessions:${viewer.uid}`, DAY_MS, perUser)
		.catch(() => true);
	if (!allowed)
		throw new HttpError(
			429,
			`Llegaste al tope de ${perUser} consultas por día. Probá de nuevo mañana.`,
		);
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
		// Voz acorde a la personalidad elegida (enojado, feliz…); con la del caso, al azar.
		voice: voiceFor(getArchetype(key)?.voice, clinicalCase.patient.sex),
		inventedFacts: {},
		voiceUsage: null,
		// Un paciente que ya arranca con confianza la tiene desde el principio.
		trustReached: state.confianza >= 0.5,
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
	const { session, clinicalCase } = await readableSession(viewer, sessionId);
	const [turns, examActions, report] = await Promise.all([
		store.listTurns(sessionId),
		store.listExamActions(sessionId),
		store.getReport(sessionId),
	]);
	return {
		session: toPublicSession(session),
		case: toSummary(clinicalCase),
		turns,
		// Sin la evaluación de técnica (otoscopia): es parte del informe, y verla
		// antes de cerrar dejaba corregir sabiendo qué se iba a puntuar.
		examActions: examActions.map(({ technique: _technique, ...a }) => a),
		remainingMs: Math.max(0, MAX_SESSION_MS - (Date.now() - session.startedAt)),
		hasReport: report !== undefined,
		readOnly: session.userId !== viewer.uid,
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
	const rules = ruleRespond(
		b,
		{ ...session.state, confianza: trustForSensitive(session) },
		studentText,
		studentCount - 1,
	);
	if (!aiEnabled()) return rules;
	try {
		const text = await chat([
			{
				role: "system",
				content: `${buildPatientPrompt(b, { hideSensitive: trustForSensitive(session) < 0.5 })}\nConfianza actual en el estudiante (0 a 1): ${session.state.confianza.toFixed(2)}.`,
			},
			// Solo lo último: el costo no crece sin límite con la charla.
			...turns.slice(-MAX_CONTEXT_TURNS).map((t) => ({
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

// Margen para terminar un examen que se empezó antes de los 8 minutos
// (marcar la presión, cerrar la otoscopia): sin él se pierde la medición.
export const FINISH_EXAM_GRACE_MS = 60_000;

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

// Un evento objetivo (interrupción, silencio, consentimiento) mueve el estado
// del paciente (plan.md, sección 5, versión 1). El cambio queda en events.
export async function nudgeState(
	session: Session,
	type: SessionEventType,
	atMs: number,
	patch: Partial<Session> = {},
) {
	const delta = EVENT_DELTAS[type];
	// Sin cambio de ánimo ni otros campos, no se escribe nada.
	if (!delta)
		return Object.keys(patch).length
			? store.updateSession(session.id, patch)
			: session;
	// El delta se suma sobre el estado actual (atómico): no pisa otros cambios.
	const next =
		(await store.changeSession(session.id, {
			set: patch,
			stateDelta: delta,
		})) ?? session;
	await store.addEvent({
		id: newId("evt"),
		sessionId: session.id,
		type: "cambio_animo",
		atMs,
		delta,
		motivo: type,
	});
	return next;
}

// Registra el consentimiento una sola vez y sube la confianza.
export async function giveConsent(session: Session, atMs: number) {
	if (session.consentGiven) return session;
	// Atómico: con dos pedidos a la vez, solo uno lo da (y sube la confianza).
	const delta = EVENT_DELTAS.consentimiento;
	const next = await store.changeSession(session.id, {
		ifEquals: { consentGiven: false },
		set: { consentGiven: true },
		stateDelta: delta,
	});
	if (!next) return (await store.getSession(session.id)) ?? session;
	await store.addEvent({
		id: newId("evt"),
		sessionId: session.id,
		type: "consentimiento",
		atMs,
	});
	if (delta)
		await store.addEvent({
			id: newId("evt"),
			sessionId: session.id,
			type: "cambio_animo",
			atMs,
			delta,
			motivo: "consentimiento",
		});
	return rememberTrust(next);
}

// Si el estudiante explica o pide permiso, queda registrado el consentimiento.
export async function noteConsent(
	session: Session,
	text: string,
	atMs: number,
) {
	if (session.consentGiven || !asksConsent(text)) return session;
	return giveConsent(session, atMs);
}

// Tope de exámenes y mediciones por consulta: sin él, un script con la
// cookie de la propia consulta podía crear miles de registros en Convex (y
// el evaluador lee hasta 2000).
const MAX_EXAM_RECORDS = 80;

export async function limitExamRecords(sessionId: string) {
	const [exams, vitals] = await Promise.all([
		store.listExamActions(sessionId),
		store.listVitals(sessionId),
	]);
	if (exams.length + vitals.length >= MAX_EXAM_RECORDS)
		throw new HttpError(429, "Demasiados exámenes en esta consulta.");
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
	await limitExamRecords(sessionId);
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
	return examResult(clinicalCase, action);
}

// Lo que ve la pantalla de una acción de examen ya guardada.
function examResult(
	clinicalCase: ClinicalCase,
	action: ExamAction,
): ExamResult {
	const zoneData = clinicalCase.exam[action.zone];
	return {
		action,
		assetKey:
			action.variant === "negado" || !zoneData
				? null
				: zoneData.variants[action.variant],
		hotspots: zoneData?.hotspots ?? [],
		patientReaction:
			action.variant === "negado"
				? "No, pará. No quiero abrir la boca. ¿Para qué es eso?"
				: action.variant === "parcial"
					? "(abre un poco la boca)"
					: "Aaaaaa...",
	};
}

// Clasifica lo que dijo el estudiante (antes de guardar su turno) y
// actualiza el estado del paciente. Si la confianza o la paciencia cambian
// de nivel, devuelve una nota para avisarle al modelo de voz.
export async function classifyStudent(
	session: Session,
	text: string,
	atMs: number,
): Promise<{ session: Session; tags: TurnTag[]; stateNote: string | null }> {
	const turns = await store.listTurns(session.id);
	const previous = turns
		.filter((t) => t.speaker === "estudiante")
		.map((t) => t.text);
	const lastPatient = turns.findLast((t) => t.speaker === "paciente");
	const c = classifyStudentTurn(text, previous, lastPatient?.text);
	if (!c.motivo) return { session, tags: c.tags, stateNote: null };
	const next =
		(await store.changeSession(session.id, { stateDelta: c.delta })) ?? session;
	// El nivel de antes sale del estado nuevo (atómico) menos este cambio, no
	// de una lectura vieja: con otro pedido en el medio, la nota al modelo
	// podía faltar o sobrar.
	const undo = Object.fromEntries(
		Object.entries(c.delta).map(([k, d]) => [k, d === undefined ? d : -d]),
	) as Partial<PatientState>;
	const before = stateBand(applyDelta(next.state, undo));
	await store.addEvent({
		id: newId("evt"),
		sessionId: session.id,
		type: "cambio_animo",
		atMs,
		delta: c.delta,
		motivo: `clasificador: ${c.motivo}`,
	});
	const after = stateBand(next.state);
	return {
		session: await rememberTrust(next),
		tags: c.tags,
		stateNote: after === before ? null : after,
	};
}

// Una vez que tuvo confianza (por voz o por texto), lo sensible queda
// disponible aunque después baje: si no, el paciente esquivaría algo que ya
// contó.
export async function rememberTrust(session: Session): Promise<Session> {
	if (session.trustReached || session.state.confianza < 0.5) return session;
	return (
		(await store.changeSession(session.id, { set: { trustReached: true } })) ??
		session
	);
}

// Confianza con la que se decide si cuenta lo sensible.
function trustForSensitive(session: Session) {
	return session.trustReached
		? Math.max(0.5, session.state.confianza)
		: session.state.confianza;
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
	const clean = cutText(text.trim(), 1000);
	if (!clean) throw new HttpError(400, "Escribí algo");
	const turns = await store.listTurns(sessionId);
	if (turns.length >= MAX_TEXT_TURNS)
		throw new HttpError(429, "Esta consulta ya tiene demasiados turnos.");
	// Contar la lista no alcanza con pedidos en paralelo (todos ven menos de
	// 120): el contador atómico frena antes de llamar a la IA. Si falla el
	// contador, sigue el tope de arriba.
	const allowed = await store
		.hitRate(`turns:${sessionId}`, DAY_MS, MAX_TEXT_TURNS / 2)
		.catch(() => true);
	if (!allowed)
		throw new HttpError(429, "Esta consulta ya tiene demasiados turnos.");

	// Reintento de un turno que falló después de guardarse (mismo texto, sin
	// respuesta): se usa ese turno, no se guarda otro. Si no, el reintento
	// cuenta como pregunta repetida y baja la paciencia.
	const last = turns.at(-1);
	const retry =
		last?.speaker === "estudiante" && last.text === clean ? last : null;
	let studentTurn: Turn;
	let afterStudent: Session;
	if (retry) {
		studentTurn = retry;
		afterStudent = session;
	} else {
		const classified = await classifyStudent(session, clean, elapsed);
		studentTurn = {
			id: newId("turn"),
			sessionId,
			speaker: "estudiante",
			text: clean,
			startMs: elapsed,
			endMs: elapsed,
			overlap: false,
			tags: classified.tags,
		};
		await store.addTurn(studentTurn);
		afterStudent = classified.session;
	}

	const current = await rememberTrust(
		await noteConsent(afterStudent, clean, elapsed),
	);

	let reply: string;
	let exam: ExamResult | null = null;
	const zone = defaultZone(clinicalCase);
	// Con el mismo criterio que la pantalla: "¿tenés vértigo en el oído?" o
	// "¿te revisaron el oído?" son preguntas y las responde el paciente.
	if (asksForEarExam(clean)) {
		// El oído se examina con el otoscopio de la pantalla, como por voz: no es
		// un pedido de garganta (no registra examen ni resta "no indicado").
		reply =
			current.consentGiven || current.personality.cooperacion >= 0.5
				? "Dale, revisame el oído."
				: "Bueno... pero despacito, ¿eh?";
	} else if (zone && isExamRequest(clean) && !namesOtherZone(clean)) {
		const decision = interpretExamInstruction(
			clean,
			current.personality,
			current.consentGiven,
		);
		// En un reintento, el examen que ya se guardó la primera vez se reusa.
		const saved = retry
			? (await store.listExamActions(sessionId)).find(
					(a) => a.zone === zone && a.startMs >= retry.startMs,
				)
			: undefined;
		exam = saved
			? examResult(clinicalCase, saved)
			: await recordExam(clinicalCase, sessionId, zone, decision, elapsed);
		reply = exam.patientReaction;
	} else {
		// El estado ya lo actualizó el clasificador (empatía incluida).
		reply = (await patientReply(current, clinicalCase, clean)).text;
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
	// Consulta activa (con margen para terminar el examen): pasados los 8
	// minutos o durante el cierre ya no se cambia lo que lee el evaluador.
	const { session, clinicalCase } = await activeSession(
		viewer,
		sessionId,
		FINISH_EXAM_GRACE_MS,
	);
	const actions = await store.listExamActions(sessionId);
	// La otoscopia se termina por su propia ruta: tocarla acá la dejaba sin
	// evaluar.
	const action = actions.find(
		(a) => a.id === actionId && a.maneuver !== OTOSCOPY,
	);
	if (!action) throw new HttpError(404, "Acción de examen no encontrada");
	// Solo las zonas que existen en el caso: nada inventado llega al evaluador.
	const known = new Set(clinicalCase.exam[action.zone]?.hotspots ?? []);
	const clean = Object.fromEntries(
		Object.entries(hotspotTimesMs)
			.filter(([k, v]) => known.has(k) && Number.isFinite(v) && v >= 0)
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
	const { session, clinicalCase } = await ownSession(viewer, sessionId);
	const existing = await store.getReport(sessionId);
	if (existing) {
		// Un cierre anterior se cortó después de guardar el informe: se
		// completa lo que faltó (el estado y los errores, una sola vez).
		// También "activa": un cierre retomado puede haber guardado el informe
		// después de que otro devolviera la sesión a activa.
		// Si completar falla (Convex lento), el informe igual se devuelve: el
		// próximo pedido o la lectura del informe lo terminan.
		if (session.status !== "evaluada")
			await completeClosing(sessionId, session.userId, existing).catch(
				(error) => console.error("No se pudo completar el cierre", error),
			);
		return existing;
	}
	const closing = {
		hypothesis: hypothesis.slice(0, 500),
		differentials: differentials.map((d) => d.slice(0, 100)).slice(0, 10),
	};
	// Reclamo atómico del cierre: con dos cierres a la vez, solo uno evalúa y
	// suma los errores. "finalizada" es el paso intermedio: la sesión queda
	// "evaluada" recién con el informe guardado.
	let claimed = await store.changeSession(sessionId, {
		ifStatus: "activa",
		set: { status: "finalizada", endedAt: Date.now(), closing },
	});
	if (!claimed) {
		const current = await store.getSession(sessionId);
		// Un cierre que quedó a medias (por ejemplo, Vercel cortó la función)
		// se retoma pasado un rato; uno en curso, no.
		const stale =
			current?.status === "finalizada" &&
			Date.now() - (current.endedAt ?? 0) > STALE_CLOSING_MS;
		// Con el endedAt leído: si dos pedidos retoman a la vez, uno solo gana.
		if (stale)
			claimed = await store.changeSession(sessionId, {
				ifStatus: "finalizada",
				ifEquals: { endedAt: current.endedAt ?? null },
				set: { endedAt: Date.now(), closing },
			});
		if (!claimed) {
			const report = await store.getReport(sessionId);
			if (report) return report;
			throw new HttpError(
				409,
				"La consulta ya se está cerrando. Si no termina, probá de nuevo en un par de minutos.",
			);
		}
	}
	try {
		const [turns, events, examActions, vitals] = await Promise.all([
			store.listTurns(sessionId),
			store.listEvents(sessionId),
			store.listExamActions(sessionId),
			store.listVitals(sessionId),
		]);
		const input = {
			clinicalCase,
			// El evaluador ve la sesión ya cerrada.
			session: { ...claimed, status: "evaluada" as const },
			turns,
			events,
			examActions,
			vitals,
		};
		// Con clave, evaluador con IA; sin clave o si falla, juez por reglas.
		const report = aiEnabled()
			? await evaluateWithAi(input, completeJson)
			: evaluate(input);
		// El informe va antes que el estado: si se corta en el medio, el
		// próximo intento encuentra el informe y completa el resto.
		await store.saveReport(report);
		await completeClosing(sessionId, session.userId, report);
		return report;
	} catch (error) {
		// Si no se llegó a guardar el informe, la consulta vuelve a estar
		// activa para poder reintentar el cierre.
		if (!(await store.getReport(sessionId)))
			await store
				.changeSession(sessionId, {
					ifStatus: "finalizada",
					set: { status: "activa" },
				})
				.catch(() => {});
		throw error;
	}
}

// Termina un cierre con el informe ya guardado. El paso finalizada → evaluada
// es atómico y solo quien lo gana suma los errores al perfil: con dos cierres
// o reintentos a la vez, se suman como mucho una vez, y la sesión no queda
// trabada en "finalizada". Si sumar los errores falla, se pierde ese conteo
// (queda en el log) pero el informe y el cierre siguen bien.
async function completeClosing(
	sessionId: string,
	userId: string,
	report: Report,
) {
	let won = await store.changeSession(sessionId, {
		ifStatus: "finalizada",
		set: { status: "evaluada", mistakesRecorded: true },
	});
	if (!won)
		won = await store.changeSession(sessionId, {
			ifStatus: "activa",
			set: { status: "evaluada", mistakesRecorded: true },
		});
	if (!won) return;
	await recordMistakes(userId, report).catch((error) =>
		console.error("No se pudo sumar los errores al perfil", error),
	);
}

// Pasado este tiempo, un cierre que no terminó se puede retomar.
const STALE_CLOSING_MS = 2 * 60 * 1000;

export async function getReport(viewer: Viewer, sessionId: string) {
	const { session } = await readableSession(viewer, sessionId);
	const report = await store.getReport(sessionId);
	if (!report) throw new HttpError(404, "Todavía no hay informe");
	// Un cierre que se cortó después de guardar el informe se completa acá:
	// al recargar, la pantalla va directo al informe y nadie vuelve a cerrar.
	// Solo la dueña (un docente puede leer, no cerrar).
	if (session.status !== "evaluada" && session.userId === viewer.uid)
		await completeClosing(sessionId, session.userId, report).catch((error) =>
			console.error("No se pudo completar el cierre", error),
		);
	return report;
}
