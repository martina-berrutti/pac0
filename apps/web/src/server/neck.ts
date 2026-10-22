// Palpación de los ganglios del cuello (Persona 3, odinofagia). El estudiante
// palpa las cadenas cervicales anteriores; el hallazgo sale del caso. Queda
// como una acción de examen, así que palpar antes del consentimiento cuenta
// como examinar sin permiso.
import "server-only";

import {
	type ExamAction,
	NECK_PALPATION,
	type NeckFinding,
} from "@/lib/contracts/exam";

import {
	activeSession,
	FINISH_EXAM_GRACE_MS,
	limitExamRecords,
} from "./consultation";
import { newId, store } from "./store";
import type { Viewer } from "./token";

// Caso sin dato del cuello: sin hallazgos.
const NORMAL_NECK =
	"No se palpan ganglios cervicales anteriores aumentados ni dolorosos.";

export async function palpateNeck(
	viewer: Viewer,
	sessionId: string,
): Promise<NeckFinding> {
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
		zone: "cuello",
		maneuver: NECK_PALPATION,
		clarity: "alta",
		variant: "completa",
		hotspotTimesMs: {},
		startMs: elapsed,
		endMs: elapsed,
	};
	await store.addExamAction(action);
	const neck = clinicalCase.neck ?? { tender: false, finding: NORMAL_NECK };
	return { actionId: action.id, ...neck };
}
