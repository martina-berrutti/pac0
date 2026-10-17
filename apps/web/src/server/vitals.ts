// Medición de presión (Persona 2). Tres pasos: abrir el tensiómetro (se
// evalúa la preparación con lo que dijo el estudiante hasta ahí), colocar el
// manguito (el servidor calcula qué marca el manómetro) y marcar PAS y PAD.
// El valor verdadero del caso nunca sale del servidor.
import "server-only";

import type {
	BpReading,
	CuffSize,
	VitalsMeasurement,
} from "@/lib/contracts/exam";
import { MAX_SESSION_MS } from "@/lib/contracts/session";
import {
	assessConversation,
	assessCuff,
	gaugeReading,
	scenarioFor,
} from "@/lib/exam/blood-pressure";

import { HttpError } from "./auth";
import { ownSession } from "./consultation";
import { newId, store } from "./store";
import type { Viewer } from "./token";

export type BpStart = { measurementId: string; armCm: number };
export type BpGauge = { gauge: BpReading; pulse: number };

// Sesión propia, activa y dentro de los 8 minutos.
export function activeSession(viewer: Viewer, sessionId: string) {
	const found = ownSession(viewer, sessionId);
	if (found.session.status !== "activa")
		throw new HttpError(409, "La consulta ya terminó");
	const elapsed = Date.now() - found.session.startedAt;
	if (elapsed > MAX_SESSION_MS)
		throw new HttpError(409, "Se terminaron los 8 minutos de la consulta");
	return { ...found, elapsed };
}

function ownMeasurement(sessionId: string, measurementId: string) {
	const m = store.listVitals(sessionId).find((v) => v.id === measurementId);
	if (!m) throw new HttpError(404, "Medición no encontrada");
	return m;
}

export function startMeasurement(viewer: Viewer, sessionId: string): BpStart {
	const { clinicalCase, elapsed } = activeSession(viewer, sessionId);
	const scenario = scenarioFor(clinicalCase.id, clinicalCase.vitals.fc);
	const student = store
		.listTurns(sessionId)
		.filter((t) => t.speaker === "estudiante");
	const { steps, errors } = assessConversation(student, scenario);
	const measurement: VitalsMeasurement = {
		id: newId("bp"),
		sessionId,
		stepsCompleted: steps,
		techniqueErrors: errors,
		cuffSize: null,
		overClothes: null,
		gauge: null,
		marked: null,
		atMs: elapsed,
	};
	store.addVitals(measurement);
	return { measurementId: measurement.id, armCm: scenario.armCm };
}

export function placeCuff(
	viewer: Viewer,
	sessionId: string,
	measurementId: string,
	cuffSize: CuffSize,
	overClothes: boolean,
): BpGauge {
	const { clinicalCase } = activeSession(viewer, sessionId);
	const m = ownMeasurement(sessionId, measurementId);
	if (m.gauge) throw new HttpError(409, "El manguito ya está colocado");
	const scenario = scenarioFor(clinicalCase.id, clinicalCase.vitals.fc);
	const cuff = assessCuff(cuffSize, overClothes, scenario.armCm);
	const techniqueErrors = [...m.techniqueErrors, ...cuff.errors];
	const gauge = gaugeReading(clinicalCase.vitals.pa, techniqueErrors);
	store.updateVitals(measurementId, {
		cuffSize,
		overClothes,
		stepsCompleted: [...m.stepsCompleted, ...cuff.steps],
		techniqueErrors,
		gauge,
	});
	return { gauge, pulse: scenario.pulse };
}

export function markReading(
	viewer: Viewer,
	sessionId: string,
	measurementId: string,
	marked: BpReading,
) {
	activeSession(viewer, sessionId);
	const m = ownMeasurement(sessionId, measurementId);
	if (!m.gauge) throw new HttpError(409, "Primero colocá el manguito");
	store.updateVitals(measurementId, { marked });
	return { ok: true };
}
