// Temperatura axilar (Persona 2). El estudiante pone el termómetro en la
// axila del paciente; al sonar, lee la temperatura del caso. Queda como una
// acción de examen, así que tomarla antes del consentimiento cuenta como
// examinar sin permiso.
import "server-only";

import {
	type ExamAction,
	type TemperatureReading,
	THERMOMETRY,
} from "@/lib/contracts/exam";

import {
	activeSession,
	FINISH_EXAM_GRACE_MS,
	limitExamRecords,
} from "./consultation";
import { newId, store } from "./store";
import type { Viewer } from "./token";

export async function takeTemperature(
	viewer: Viewer,
	sessionId: string,
): Promise<TemperatureReading> {
	// Mismo margen que la presión y el otoscopio: el panel se pudo abrir antes
	// de los 8 minutos (o la voz lo abrió justo después) y sin margen se
	// perdería el hallazgo.
	const { clinicalCase, elapsed } = await activeSession(
		viewer,
		sessionId,
		FINISH_EXAM_GRACE_MS,
	);
	await limitExamRecords(sessionId);
	const action: ExamAction = {
		id: newId("exam"),
		sessionId,
		zone: "axila",
		maneuver: THERMOMETRY,
		clarity: "alta",
		variant: "completa",
		hotspotTimesMs: {},
		startMs: elapsed,
		endMs: elapsed,
	};
	await store.addExamAction(action);
	return { actionId: action.id, celsius: clinicalCase.vitals.tax };
}
