// Extractor determinista (plan.md, sección 8, paso 2): lo medible sale del
// código, no del modelo. Tiempo sobre cada zona, interrupciones, la medición
// de presión, las otoscopias y si hubo examen antes del consentimiento.
import {
	type ExamAction,
	OTOSCOPY,
	type VitalsMeasurement,
} from "@/lib/contracts/exam";
import type { SessionEvent, Turn } from "@/lib/contracts/session";
import { classifyStudentTurn } from "@/lib/patient/turn-classifier";

import type { EvaluationInput } from "./types";

// Una zona cuenta como vista con medio segundo de luz encima.
export const MIN_HOTSPOT_MS = 500;

// Listas de frases (plan.md, sección 8). Van sin tildes y se buscan al
// principio de una palabra. Valores iniciales, a calibrar con un docente.
// Pistas emocionales o de dolor del paciente que piden una respuesta.
const CUES = [
	"me preocupa",
	"estoy preocupad",
	"tengo miedo",
	"me da miedo",
	"me asusta",
	"estoy asustad",
	"estoy nervios",
	"me angustia",
	"estoy angustiad",
	"me duele mucho",
	"no aguanto",
	"no doy mas",
	"no puedo mas",
];
// Lo que cuenta como recoger esa pista.
const ACKNOWLEDGES = [
	"entiendo",
	"te entiendo",
	"comprendo",
	"claro",
	"ya veo",
	"imagino",
	"debe ser",
	"que feo",
	"lamento",
	"tranqui",
	"no te preocupes",
	"es normal",
	"uy",
];
// El paciente se niega a que lo examinen.
const REFUSALS = [
	"no quiero",
	"prefiero que no",
	"no me toques",
	"no me revises",
	"no me examines",
	"dejame",
	"ni loco",
	"ni loca",
];
// Presionar, ordenar o minimizar ante la negativa.
const PRESSURE = [
	"tenes que",
	"no seas",
	"quieras o no",
	"igual te voy",
	"abri igual",
	"es obligatorio",
	"no tenes opcion",
	"apurate",
	"no me hagas perder",
	"no es para tanto",
];
// Resolver la negativa: explicar, pedir permiso, dar control.
const RESOLVES = [
	"puedo",
	"permiso",
	"te explico",
	"para que",
	"si queres",
	"cuando quieras",
	"entiendo",
	"esta bien",
	"de acuerdo",
	"me avisas",
	"te parece",
];
const DISRESPECT = [
	"callate",
	"boludo",
	"boluda",
	"pelotud",
	"idiota",
	"estupid",
	"tarad",
	"inutil",
	"no me importa",
	"dejate de joder",
	"deja de llorar",
	"no te quejes",
	"estas exagerando",
	"que pesad",
	"me tenes harto",
	"me tenes podrid",
];
// Despedida o cierre amable al final de la consulta.
const KIND_CLOSING = [
	"gracias",
	"que te mejores",
	"que se mejore",
	"cuidate",
	"cuidese",
	"cualquier cosa",
	"cualquier duda",
	"chau",
	"hasta luego",
	"un gusto",
];
// Turnos que describen un hallazgo para el evaluador: la jerga ahí no cuenta.
const FINDING_STARTS = ["veo", "observo", "se ve", "se observa", "noto"];

function words(s: string) {
	return ` ${s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^a-z0-9ñ ]/g, " ")
		.replace(/\s+/g, " ")
		.trim()}`;
}

// Alguna frase de la lista aparece al principio de una palabra del texto.
function says(text: string, list: string[]) {
	const t = words(text);
	return list.some((w) => t.includes(` ${w}`));
}

// Primer momento en que el estudiante insistió contra la negativa: presionó
// con palabras, o volvió a pedir el examen sin explicar ni pedir permiso.
// Una negativa queda resuelta cuando el paciente da el consentimiento.
function findInsistence(
	ordered: Turn[],
	examActions: ExamAction[],
	events: SessionEvent[],
): { turn?: Turn; examActionId?: string } | null {
	const refusals = [
		...ordered
			.filter((t) => t.speaker === "paciente" && says(t.text, REFUSALS))
			.map((t) => t.startMs),
		...examActions.filter((a) => a.variant === "negado").map((a) => a.startMs),
	].sort((a, b) => a - b);
	const consents = events
		.filter((e) => e.type === "consentimiento")
		.map((e) => e.atMs);
	for (const at of refusals) {
		const until = consents.find((c) => c > at) ?? Number.POSITIVE_INFINITY;
		const said = ordered.filter(
			(t) => t.speaker === "estudiante" && t.startMs > at && t.startMs < until,
		);
		const pressed = said.find(
			(t) => says(t.text, PRESSURE) && !says(t.text, RESOLVES),
		);
		if (pressed) return { turn: pressed };
		const again = examActions.find((a) => {
			if (a.variant !== "negado" || a.startMs <= at || a.startMs >= until)
				return false;
			const between = said.filter((t) => t.startMs < a.startMs);
			return between.length > 0 && !between.some((t) => says(t.text, RESOLVES));
		});
		if (again) return { examActionId: again.id };
	}
	return null;
}

export type Extracted = {
	studentTurns: Turn[];
	// Primera apertura completa y primera parcial, si las hubo.
	fullExam: ExamAction | null;
	partialExam: ExamAction | null;
	// Milisegundos por zona, sumando todas las aperturas completas.
	hotspotMs: Record<string, number>;
	zonesSeen: string[];
	// Zonas vistas sobre las zonas del caso, de 0 a 1.
	zoneCoverage: number;
	// Primera boca u otoscopia: desde ahí cuenta describir lo que vio.
	firstExamMs: number | null;
	// Primer examen (boca no negada, otoscopia o presión) antes del
	// consentimiento.
	examWithoutConsent: { id: string; atMs: number } | null;
	// Última medición de presión con PAS y PAD marcadas (si el resultado es
	// inesperado, el afiche pide repetir, y vale la última); si no marcó
	// ninguna, la última que empezó.
	bp: VitalsMeasurement | null;
	// Otoscopias terminadas (con pasos y errores calculados), en orden.
	otoscopies: ExamAction[];
	studentInterruptions: SessionEvent[];
	// Si hubo algún examen o medición que el paciente no negó.
	examined: boolean;
	// Turnos del estudiante con jerga sin explicar.
	jargonTurns: Turn[];
	// Pistas emocionales o de dolor que el estudiante no recogió en su
	// respuesta siguiente, y las que sí recogió.
	ignoredCues: { cue: Turn; reply: Turn }[];
	acknowledgedCues: { cue: Turn; reply: Turn }[];
	// Turnos del estudiante con empatía (clasificador o frases de la lista).
	empathyTurns: Turn[];
	// Turno con el que se despidió con amabilidad (de los dos últimos).
	kindClosing: Turn | null;
	insisted: { turn?: Turn; examActionId?: string } | null;
	disrespectfulTurns: Turn[];
	// Confianza al empezar (sale de la personalidad, como en
	// server/consultation.ts) y al terminar. Difícil: desconfiado o poco
	// cooperador.
	trust: { start: number; end: number; difficult: boolean };
};

export function extract(input: EvaluationInput): Extracted {
	const { clinicalCase, session, examActions, events, turns, vitals } = input;
	// Las acciones de boca; las otoscopias van aparte.
	const mouth = examActions.filter((a) => a.maneuver !== OTOSCOPY);
	const full = mouth.filter((a) => a.variant === "completa");

	const hotspotMs: Record<string, number> = {};
	for (const action of full) {
		for (const [zone, ms] of Object.entries(action.hotspotTimesMs)) {
			hotspotMs[zone] = (hotspotMs[zone] ?? 0) + ms;
		}
	}
	const zonesSeen = Object.entries(hotspotMs)
		.filter(([, ms]) => ms >= MIN_HOTSPOT_MS)
		.map(([zone]) => zone);
	const caseZone = full[0] ? clinicalCase.exam[full[0].zone] : undefined;
	const zoneCoverage = caseZone
		? zonesSeen.filter((z) => caseZone.hotspots.includes(z)).length /
			caseZone.hotspots.length
		: 0;

	// El evento marca cuándo aceptó. Sin evento, vale el dato de la sesión.
	const consentEvent = events.find((e) => e.type === "consentimiento");
	const consentAt = consentEvent
		? consentEvent.atMs
		: session.consentGiven
			? 0
			: null;
	const examined = [
		...examActions
			.filter((a) => a.variant !== "negado")
			.map((a) => ({ id: a.id, atMs: a.startMs })),
		...vitals.map((v) => ({ id: v.id, atMs: v.atMs })),
	].sort((a, b) => a.atMs - b.atMs);
	const measured = vitals.filter((v) => v.marked);
	const otoscopies = examActions
		.filter((a) => a.maneuver === OTOSCOPY && a.technique !== undefined)
		.sort((a, b) => a.startMs - b.startMs);

	const ordered = [...turns].sort((a, b) => a.startMs - b.startMs);
	const studentTurns = ordered.filter((t) => t.speaker === "estudiante");
	// Las etiquetas del clasificador; si la consulta no las guardó, se
	// calculan acá con el mismo clasificador.
	const tags = new Map(
		studentTurns.map((t, i) => [
			t.id,
			t.tags ??
				classifyStudentTurn(
					t.text,
					studentTurns.slice(0, i).map((x) => x.text),
				).tags,
		]),
	);
	const empathic = (t: Turn) =>
		Boolean(tags.get(t.id)?.includes("empatia")) || says(t.text, ACKNOWLEDGES);
	const ignoredCues: Extracted["ignoredCues"] = [];
	const acknowledgedCues: Extracted["acknowledgedCues"] = [];
	ordered.forEach((cue, i) => {
		if (cue.speaker !== "paciente" || !says(cue.text, CUES)) return;
		const reply = ordered.slice(i + 1).find((t) => t.speaker === "estudiante");
		if (!reply) return;
		(empathic(reply) ? acknowledgedCues : ignoredCues).push({ cue, reply });
	});
	const { personality } = session;

	return {
		studentTurns,
		fullExam: full[0] ?? null,
		partialExam: mouth.find((a) => a.variant === "parcial") ?? null,
		hotspotMs,
		zonesSeen,
		zoneCoverage,
		firstExamMs:
			[mouth[0]?.startMs, ...otoscopies.map((a) => a.startMs)]
				.filter((ms): ms is number => ms !== undefined)
				.sort((a, b) => a - b)[0] ?? null,
		examWithoutConsent:
			examined.find((a) => consentAt === null || a.atMs < consentAt) ?? null,
		bp: measured.at(-1) ?? vitals.at(-1) ?? null,
		otoscopies,
		studentInterruptions: events.filter(
			(e) => e.type === "interrupcion_estudiante",
		),
		examined: examined.length > 0,
		jargonTurns: studentTurns.filter(
			(t) => tags.get(t.id)?.includes("jerga") && !says(t.text, FINDING_STARTS),
		),
		ignoredCues,
		acknowledgedCues,
		empathyTurns: studentTurns.filter((t) =>
			tags.get(t.id)?.includes("empatia"),
		),
		kindClosing:
			studentTurns.length > 2
				? (studentTurns.slice(-2).find((t) => says(t.text, KIND_CLOSING)) ??
					null)
				: null,
		insisted: findInsistence(ordered, examActions, events),
		disrespectfulTurns: studentTurns.filter((t) => says(t.text, DISRESPECT)),
		trust: {
			start: 1 - personality.desconfianza,
			end: session.state.confianza,
			difficult:
				personality.desconfianza >= 0.5 || personality.cooperacion < 0.5,
		},
	};
}
