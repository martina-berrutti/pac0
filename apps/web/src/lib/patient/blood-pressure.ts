// Lectura de presión = valor verdadero del caso + ajustes por errores de
// técnica (afiche HC-01). Las magnitudes en mmHg son valores iniciales de un
// modelo educativo simplificado: las calibra un docente (TODO.md, Persona 2).
import { BP_STEPS } from "./tools";

type Step = (typeof BP_STEPS)[number];

const ADJUSTMENTS: Record<Step, { error: string; pas: number; pad: number }> = {
	descanso: { error: "sin reposo previo", pas: 10, pad: 5 },
	sin_hablar: { error: "habla durante la medición", pas: 10, pad: 7 },
	espalda_apoyada: { error: "espalda sin apoyar", pas: 5, pad: 6 },
	pies_apoyados: { error: "pies sin apoyar", pas: 3, pad: 2 },
	piernas_descruzadas: { error: "piernas cruzadas", pas: 7, pad: 2 },
	brazo_altura_corazon: {
		error: "brazo por debajo del corazón",
		pas: 8,
		pad: 6,
	},
	manguito_sobre_piel: { error: "manguito sobre la ropa", pas: 5, pad: 3 },
};

export function bloodPressureReading(
	truth: [number, number],
	stepsCompleted: readonly string[],
) {
	const missing = BP_STEPS.filter((s) => !stepsCompleted.includes(s));
	const pas = truth[0] + missing.reduce((s, m) => s + ADJUSTMENTS[m].pas, 0);
	const pad = truth[1] + missing.reduce((s, m) => s + ADJUSTMENTS[m].pad, 0);
	return {
		shown: { pas, pad },
		stepsCompleted: BP_STEPS.filter((s) => stepsCompleted.includes(s)),
		techniqueErrors: missing.map((m) => ADJUSTMENTS[m].error),
	};
}
