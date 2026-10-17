// Otoscopia (Persona 2). Se guarda como acción de examen: al abrir el
// otoscopio se crea (cuenta para el consentimiento) y al terminar se calculan
// los pasos y errores con lo que hizo el estudiante.
import "server-only";

import {
	type Ear,
	type EarAppearance,
	type ExamAction,
	OTOSCOPY,
	type OtoscopyRecord,
} from "@/lib/contracts/exam";
import { assessOtoscopy, otoscopyScenario } from "@/lib/exam/otoscope";

import { HttpError } from "./auth";
import { newId, store } from "./store";
import type { Viewer } from "./token";
import { activeSession } from "./vitals";

export type OtoscopyStart = { actionId: string; appearance: EarAppearance };

export function startOtoscopy(
	viewer: Viewer,
	sessionId: string,
	ear: Ear,
): OtoscopyStart {
	const { clinicalCase, elapsed } = activeSession(viewer, sessionId);
	const action: ExamAction = {
		id: newId("exam"),
		sessionId,
		zone: `oido-${ear}`,
		maneuver: OTOSCOPY,
		clarity: "alta",
		variant: "completa",
		hotspotTimesMs: {},
		startMs: elapsed,
		endMs: null,
	};
	store.addExamAction(action);
	const scenario = otoscopyScenario(clinicalCase.id, clinicalCase.patient.age);
	// Solo lo que se ve en ese oído; la técnica correcta no sale del servidor.
	return { actionId: action.id, appearance: scenario.appearance[ear] };
}

export function finishOtoscopy(
	viewer: Viewer,
	sessionId: string,
	actionId: string,
	record: OtoscopyRecord,
) {
	const { session, clinicalCase, elapsed } = activeSession(viewer, sessionId);
	const action = store
		.listExamActions(sessionId)
		.find((a) => a.id === actionId && a.maneuver === OTOSCOPY);
	if (!action) throw new HttpError(404, "Otoscopia no encontrada");
	if (action.endMs !== null)
		throw new HttpError(409, "Esta otoscopia ya terminó");
	const ear: Ear = action.zone === "oido-izquierdo" ? "izquierdo" : "derecho";
	const before = store
		.listTurns(session.id)
		.filter((t) => t.speaker === "estudiante" && t.startMs <= action.startMs);
	const technique = assessOtoscopy(
		ear,
		record,
		before,
		otoscopyScenario(clinicalCase.id, clinicalCase.patient.age),
	);
	store.updateExamAction(actionId, {
		hotspotTimesMs: { conducto: record.canalMs, timpano: record.tympanumMs },
		endMs: elapsed,
		technique,
	});
	return { ok: true };
}
