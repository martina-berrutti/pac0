// Extractor determinista (plan.md, sección 8, paso 2): lo medible sale del
// código, no del modelo. Tiempo sobre cada zona, interrupciones, la medición
// de presión, las otoscopias y si hubo examen antes del consentimiento.
import {
	type ExamAction,
	OTOSCOPY,
	type VitalsMeasurement,
} from "@/lib/contracts/exam";
import type { SessionEvent, Turn } from "@/lib/contracts/session";

import type { EvaluationInput } from "./types";

// Una zona cuenta como vista con medio segundo de luz encima.
export const MIN_HOTSPOT_MS = 500;

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
	firstExamMs: number | null;
	// Primer examen (boca no negada, otoscopia o presión) antes del
	// consentimiento.
	examWithoutConsent: { id: string; atMs: number } | null;
	// Última medición de presión con PAS y PAD marcadas: si el resultado es
	// inesperado, el afiche pide repetir, y vale la última.
	bp: VitalsMeasurement | null;
	// Otoscopias terminadas (con pasos y errores calculados).
	otoscopies: ExamAction[];
	studentInterruptions: SessionEvent[];
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
	const measured = vitals.filter((v) => v.marked && v.gauge);

	return {
		studentTurns: turns.filter((t) => t.speaker === "estudiante"),
		fullExam: full[0] ?? null,
		partialExam: mouth.find((a) => a.variant === "parcial") ?? null,
		hotspotMs,
		zonesSeen,
		zoneCoverage,
		firstExamMs: mouth[0]?.startMs ?? null,
		examWithoutConsent:
			examined.find((a) => consentAt === null || a.atMs < consentAt) ?? null,
		bp: measured.at(-1) ?? null,
		otoscopies: examActions.filter(
			(a) => a.maneuver === OTOSCOPY && a.technique !== undefined,
		),
		studentInterruptions: events.filter(
			(e) => e.type === "interrupcion_estudiante",
		),
	};
}
