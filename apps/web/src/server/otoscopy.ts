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
import { activeSession, FINISH_EXAM_GRACE_MS } from "./consultation";
import { newId, store } from "./store";
import type { Viewer } from "./token";

export type OtoscopyStart = { actionId: string; appearance: EarAppearance };

export async function startOtoscopy(
	viewer: Viewer,
	sessionId: string,
	ear: Ear,
): Promise<OtoscopyStart> {
	// Mismo margen que la herramienta examinar de la voz, que puede abrir el
	// otoscopio justo pasados los 8 minutos.
	const { clinicalCase, elapsed } = await activeSession(
		viewer,
		sessionId,
		FINISH_EXAM_GRACE_MS,
	);
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
	await store.addExamAction(action);
	const scenario = otoscopyScenario(
		clinicalCase.templateId ?? clinicalCase.id,
		clinicalCase.patient.age,
	);
	// Solo lo que se ve en ese oído; la técnica correcta no sale del servidor.
	return { actionId: action.id, appearance: scenario.appearance[ear] };
}

export async function finishOtoscopy(
	viewer: Viewer,
	sessionId: string,
	actionId: string,
	record: OtoscopyRecord,
) {
	const { session, clinicalCase, elapsed } = await activeSession(
		viewer,
		sessionId,
		FINISH_EXAM_GRACE_MS,
	);
	const action = (await store.listExamActions(sessionId)).find(
		(a) => a.id === actionId && a.maneuver === OTOSCOPY,
	);
	if (!action) throw new HttpError(404, "Otoscopia no encontrada");
	if (action.endMs !== null)
		throw new HttpError(409, "Esta otoscopia ya terminó");
	const ear: Ear = action.zone === "oido-izquierdo" ? "izquierdo" : "derecho";
	const before = (await store.listTurns(session.id)).filter(
		(t) => t.speaker === "estudiante" && t.startMs <= action.startMs,
	);
	const technique = assessOtoscopy(
		ear,
		record,
		before,
		otoscopyScenario(
			clinicalCase.templateId ?? clinicalCase.id,
			clinicalCase.patient.age,
		),
	);
	// Atómico: con dos pedidos a la vez, la otoscopia se termina una vez.
	const finished = await store.patchExamActionIf(
		actionId,
		{
			hotspotTimesMs: { conducto: record.canalMs, timpano: record.tympanumMs },
			endMs: elapsed,
			technique,
		},
		{ endMs: null },
	);
	if (!finished) throw new HttpError(409, "Esta otoscopia ya terminó");
	return { ok: true };
}
