// Estudiantes simulados para probar el evaluador (plan.md, sección 8).
import { caseBank } from "@/cases";
import type { ClinicalCase } from "@/cases/schema";
import type { ExamAction } from "@/lib/contracts/exam";
import type { Session, Turn } from "@/lib/contracts/session";
import type { EvaluationInput } from "@/lib/scoring/types";

export const lucia = caseBank[0] as ClinicalCase;

let n = 0;
function turn(
	sessionId: string,
	speaker: Turn["speaker"],
	text: string,
	ms: number,
): Turn {
	n += 1;
	return {
		id: `t${n}`,
		sessionId,
		speaker,
		text,
		startMs: ms,
		endMs: ms,
		overlap: false,
	};
}

function session(over: Partial<Session> = {}): Session {
	return {
		id: "s1",
		userId: "u1",
		caseId: lucia.id,
		alias: "Prueba",
		personalityKey: "caso",
		personality: lucia.personality,
		state: { confianza: 0.9, ansiedad: 0.3, dolor: 0.5, paciencia: 0.7 },
		status: "evaluada",
		startedAt: 0,
		endedAt: 1,
		closing: null,
		consentGiven: false,
		historyOverrides: {},
		inventedFacts: {},
		voiceUsage: null,
		...over,
	};
}

function exam(
	variant: ExamAction["variant"],
	times: Record<string, number>,
	startMs: number,
): ExamAction {
	return {
		id: "e1",
		sessionId: "s1",
		zone: "orofaringe",
		maneuver: "inspeccion",
		clarity: "alta",
		variant,
		hotspotTimesMs: times,
		startMs,
		endMs: startMs + 5000,
	};
}

const allSeen = {
	"amigdala-izq": 2000,
	"amigdala-der": 2000,
	uvula: 1000,
	paladar: 900,
	lengua: 800,
	"pared-posterior": 1200,
};

export function goodStudent(): EvaluationInput {
	const lines = [
		"Hola, buen día, me llamo Ana, soy estudiante. ¿Qué te trae por acá?",
		"¿Desde cuándo te duele?",
		"¿Te duele al tragar? ¿Cuánto te duele del 1 al 10?",
		"¿Tuviste fiebre?",
		"¿Tenés tos o mocos?",
		"¿Alguien más cerca tuyo está con algo parecido?",
		"¿Sos alérgica a algún medicamento?",
		"¿Estás tomando alguna medicación?",
		"¿Tenés algún antecedente de enfermedad?",
		"¿Fumás o tomás alcohol?",
		"Te voy a examinar la garganta, ¿puedo? Abrí bien grande y decí aaa.",
		"Veo las amígdalas rojas con exudado.",
		"Entonces, si entendí bien, hace tres días que te duele la garganta. ¿Alguna duda?",
	];
	const turns = lines.map((t, i) => turn("s1", "estudiante", t, i * 10_000));
	return {
		clinicalCase: lucia,
		session: session({
			consentGiven: true,
			closing: {
				hypothesis:
					"Faringoamigdalitis aguda por la fiebre y el exudado; pediría un test rápido",
				differentials: ["estreptocócica", "viral", "mononucleosis"],
			},
		}),
		turns,
		events: [],
		examActions: [exam("completa", allSeen, 105_000)],
	};
}

export function averageStudent(): EvaluationInput {
	const lines = [
		"Hola, ¿qué te pasa?",
		"¿Desde cuándo?",
		"¿Tuviste fiebre, no?",
		"¿Puedo revisarte? Abrí la boca.",
	];
	return {
		clinicalCase: lucia,
		session: session({
			consentGiven: true,
			closing: { hypothesis: "faringitis", differentials: ["viral"] },
		}),
		turns: lines.map((t, i) => turn("s1", "estudiante", t, i * 10_000)),
		events: [],
		examActions: [exam("parcial", { lengua: 800 }, 35_000)],
	};
}

export function badStudent(): EvaluationInput {
	return {
		clinicalCase: lucia,
		session: session({
			consentGiven: false,
			closing: { hypothesis: "gripe", differentials: [] },
		}),
		turns: [turn("s1", "estudiante", "Abrí la boca.", 0)],
		events: [
			{
				id: "ev1",
				sessionId: "s1",
				type: "interrupcion_estudiante",
				atMs: 1000,
			},
			{
				id: "ev2",
				sessionId: "s1",
				type: "interrupcion_estudiante",
				atMs: 2000,
			},
			{
				id: "ev3",
				sessionId: "s1",
				type: "interrupcion_estudiante",
				atMs: 3000,
			},
		],
		examActions: [exam("parcial", {}, 500)],
	};
}
