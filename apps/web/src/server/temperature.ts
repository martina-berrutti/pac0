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

import { activeSession, limitExamRecords } from "./consultation";
import { newId, store } from "./store";
import type { Viewer } from "./token";

export async function takeTemperature(
	viewer: Viewer,
	sessionId: string,
): Promise<TemperatureReading> {
	const { clinicalCase, elapsed } = await activeSession(viewer, sessionId);
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
