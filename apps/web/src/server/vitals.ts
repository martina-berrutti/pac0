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
export async function createMeasurement(
	clinicalCase: ClinicalCase,
	sessionId: string,
	steps: readonly string[],
	atMs: number,
): Promise<BpStart> {
	const armCm = armFor(clinicalCase.id);
	const measurement: VitalsMeasurement = {
		id: newId("vit"),
		sessionId,
		...measure(clinicalCase.vitals.pa, steps, null, armCm),
		marked: null,
		cuff: null,
		atMs,
	};
	await store.addVitals(measurement);
	return { measurementId: measurement.id, armCm };
}

// Botón del tensiómetro: los pasos salen de lo que dijo hasta ahora.
export async function startMeasurement(
	viewer: Viewer,
	sessionId: string,
): Promise<BpStart> {
	const { clinicalCase, elapsed } = await activeSession(viewer, sessionId);
	const student = (await store.listTurns(sessionId)).filter(
		(t) => t.speaker === "estudiante",
	);
	return createMeasurement(
		clinicalCase,
		sessionId,
		stepsFromConversation(student),
		elapsed,
	);
}

async function ownMeasurement(sessionId: string, measurementId: string) {
	const m = (await store.listVitals(sessionId)).find(
		(v) => v.id === measurementId,
	);
	if (!m) throw new HttpError(404, "Medición no encontrada");
	return m;
}

export async function placeCuff(
	viewer: Viewer,
	sessionId: string,
	measurementId: string,
	size: CuffSize,
	overClothes: boolean,
): Promise<BpGauge> {
	const { clinicalCase } = await activeSession(viewer, sessionId);
	const m = await ownMeasurement(sessionId, measurementId);
	if (m.cuff) throw new HttpError(409, "El manguito ya está colocado");
	const cuff = { size, overClothes };
	const reading = measure(
		clinicalCase.vitals.pa,
		m.stepsCompleted,
		cuff,
		armFor(clinicalCase.id),
	);
	await store.updateVitals(measurementId, { ...reading, cuff });
	return { gauge: reading.shown, pulse: clinicalCase.vitals.fc };
}

export async function markReading(
	viewer: Viewer,
	sessionId: string,
	measurementId: string,
	marked: BpReading,
) {
	await activeSession(viewer, sessionId);
	const m = await ownMeasurement(sessionId, measurementId);
	if (!m.cuff) throw new HttpError(409, "Primero colocá el manguito");
	await store.updateVitals(measurementId, { marked });
	return { ok: true };
}
