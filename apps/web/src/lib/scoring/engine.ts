// Motor de puntaje determinista (plan.md, sección 8). El porcentaje y las
// penalizaciones los calcula este código, no el modelo. Pesos y valores
// iniciales, a calibrar con un docente.
import type { Dimension } from "@/cases/schema";
import type { ItemResult, Verdict } from "@/lib/contracts/report";

import type { Penalty } from "./types";

export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
	anamnesis: 0.3,
	examen: 0.25,
	razonamiento: 0.25,
	comunicacion: 0.2,
};

export const PASS_THRESHOLD = 85;
export const ALMOST_THRESHOLD = 70;
export const PENALTY_CAP = 15;

const CREDIT = { si: 1, parcial: 0.5, no: 0 } as const;

// Puntaje de la dimensión = ganados ÷ aplicables × 100, menos penalizaciones
// con tope de 15. Sin ítems aplicables, la dimensión vale 100.
export function dimensionScore(items: ItemResult[], penalties: Penalty[]) {
	const applicable = items.reduce((s, i) => s + i.weight, 0);
	const earned = items.reduce((s, i) => s + i.weight * CREDIT[i.status], 0);
	const base = applicable === 0 ? 100 : (earned / applicable) * 100;
	const penalty = Math.min(
		PENALTY_CAP,
		penalties.reduce((s, p) => s + p.points, 0),
	);
	return Math.max(0, Math.round(base - penalty));
}

export function totalScore(scores: Record<Dimension, number>) {
	const total = (Object.keys(DIMENSION_WEIGHTS) as Dimension[]).reduce(
		(s, d) => s + scores[d] * DIMENSION_WEIGHTS[d],
		0,
	);
	return Math.round(total);
}

export function verdictFor(
	total: number,
	criticalErrors: number,
): { verdict: Verdict; message: string } {
	if (total >= PASS_THRESHOLD && criticalErrors === 0) {
		return { verdict: "lo_hiciste_bien", message: "Lo hiciste bien" };
	}
	if (total >= PASS_THRESHOLD) {
		return {
			verdict: "error_critico",
			message: "Buen trabajo, con un error que no se puede pasar por alto",
		};
	}
	if (total >= ALMOST_THRESHOLD) {
		return { verdict: "casi", message: "Casi: repasá estos puntos" };
	}
	return {
		verdict: "a_repasar",
		message: "A repasar: empezá por estos errores",
	};
}
