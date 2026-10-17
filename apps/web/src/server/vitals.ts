// Medición de presión (Persona 2). La crea la herramienta medir_presion de la
// voz o el botón del tensiómetro; después el estudiante coloca el manguito (el
// servidor recalcula qué marca el manómetro) y marca PAS y PAD. El valor
// verdadero del caso nunca sale del servidor.
import "server-only";

import type { ClinicalCase } from "@/cases/schema";
import type {
	BpReading,
	CuffSize,
	VitalsMeasurement,
} from "@/lib/contracts/exam";
import {
	armFor,
	measure,
	stepsFromConversation,
} from "@/lib/exam/blood-pressure";

import { HttpError } from "./auth";
import { activeSession } from "./consultation";
import { newId, store } from "./store";
import type { Viewer } from "./token";

export type BpStart = { measurementId: string; armCm: number };
export type BpGauge = { gauge: BpReading; pulse: number };

// Crea la medición con los pasos de preparación que indicó el estudiante.
export function createMeasurement(
	clinicalCase: ClinicalCase,
	sessionId: string,
	steps: readonly string[],
	atMs: number,
): BpStart {
	const armCm = armFor(clinicalCase.id);
	const measurement: VitalsMeasurement = {
		id: newId("vit"),
		sessionId,
		...measure(clinicalCase.vitals.pa, steps, null, armCm),
		marked: null,
		cuff: null,
		atMs,
	};
	store.addVitals(measurement);
	return { measurementId: measurement.id, armCm };
}

// Botón del tensiómetro: los pasos salen de lo que dijo hasta ahora.
export function startMeasurement(viewer: Viewer, sessionId: string): BpStart {
	const { clinicalCase, elapsed } = activeSession(viewer, sessionId);
	const student = store
		.listTurns(sessionId)
		.filter((t) => t.speaker === "estudiante");
	return createMeasurement(
		clinicalCase,
		sessionId,
		stepsFromConversation(student),
		elapsed,
	);
}

function ownMeasurement(sessionId: string, measurementId: string) {
	const m = store.listVitals(sessionId).find((v) => v.id === measurementId);
	if (!m) throw new HttpError(404, "Medición no encontrada");
	return m;
}

export function placeCuff(
	viewer: Viewer,
	sessionId: string,
	measurementId: string,
	size: CuffSize,
	overClothes: boolean,
): BpGauge {
	const { clinicalCase } = activeSession(viewer, sessionId);
	const m = ownMeasurement(sessionId, measurementId);
	if (m.cuff) throw new HttpError(409, "El manguito ya está colocado");
	const cuff = { size, overClothes };
	const reading = measure(
		clinicalCase.vitals.pa,
		m.stepsCompleted,
		cuff,
		armFor(clinicalCase.id),
	);
	store.updateVitals(measurementId, { ...reading, cuff });
	return { gauge: reading.shown, pulse: clinicalCase.vitals.fc };
}

export function markReading(
	viewer: Viewer,
	sessionId: string,
	measurementId: string,
	marked: BpReading,
) {
	activeSession(viewer, sessionId);
	const m = ownMeasurement(sessionId, measurementId);
	if (!m.cuff) throw new HttpError(409, "Primero colocá el manguito");
	store.updateVitals(measurementId, { marked });
	return { ok: true };
}
