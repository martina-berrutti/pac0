// Estado dinámico del paciente (plan.md, sección 5, versión 1): cambia con
// los eventos objetivos de la consulta y con actualizar_estado.
import type { PatientState, SessionEventType } from "@/lib/contracts/session";

// Cuánto mueve cada evento objetivo. Valores iniciales, a calibrar.
export const EVENT_DELTAS: Partial<
	Record<SessionEventType, Partial<PatientState>>
> = {
	interrupcion_estudiante: { paciencia: -0.1, confianza: -0.05 },
	silencio_largo: { paciencia: -0.05 },
	consentimiento: { confianza: 0.1 },
};

// Suma el cambio y deja cada valor entre 0 y 1.
export function applyDelta(
	state: PatientState,
	delta: Partial<PatientState>,
): PatientState {
	const next = { ...state };
	for (const [k, d] of Object.entries(delta) as [
		keyof PatientState,
		number | undefined,
	][]) {
		if (d !== undefined) next[k] = Math.min(1, Math.max(0, next[k] + d));
	}
	return next;
}
