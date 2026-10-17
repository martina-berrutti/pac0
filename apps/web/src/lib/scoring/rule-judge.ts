// Juez por reglas: busca las palabras clave de cada ítem en los turnos del
// estudiante y cita el turno. Sin evidencia no hay "sí". Lo reemplaza el juez
// con IA (TODO.md, Persona 2), que tiene que devolver lo mismo.
import type { ChecklistItem } from "@/cases/schema";
import type { ItemResult } from "@/lib/contracts/report";
import type { Turn } from "@/lib/contracts/session";

import type { EvaluationInput } from "./types";

function normalize(s: string) {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

function findTurn(turns: Turn[], keywords: string[]) {
	const keys = keywords.map(normalize);
	return turns.find((t) => keys.some((k) => normalize(t.text).includes(k)));
}

export function judgeItem(
	item: ChecklistItem,
	input: EvaluationInput,
): ItemResult {
	const student = input.turns.filter((t) => t.speaker === "estudiante");
	const base = {
		itemId: item.id,
		item: item.item,
		dimension: item.dimension,
		weight: item.weight,
	};

	// Ítems de examen: salen de las acciones registradas, no de lo que dijo.
	if (item.id === "orofaringe") {
		const full = input.examActions.find((a) => a.variant === "completa");
		if (!full) {
			const partial = input.examActions.find((a) => a.variant === "parcial");
			return partial
				? {
						...base,
						status: "parcial",
						evidence: [
							{ examActionId: partial.id, quote: "solo apertura parcial" },
						],
					}
				: { ...base, status: "no", evidence: [] };
		}
		const zone = input.clinicalCase.exam[full.zone];
		const seen = Object.entries(full.hotspotTimesMs)
			.filter(([, ms]) => ms >= 500)
			.map(([h]) => h);
		const coverage = zone ? seen.length / zone.hotspots.length : 0;
		return {
			...base,
			status: coverage >= 0.66 ? "si" : "parcial",
			evidence: [
				{
					examActionId: full.id,
					quote: `zonas vistas: ${seen.join(", ") || "ninguna"}`,
				},
			],
		};
	}
	if (item.id === "describe-hallazgo") {
		const firstExam = input.examActions[0];
		const after = firstExam
			? student.filter((t) => t.startMs >= firstExam.startMs)
			: [];
		const turn = findTurn(after, item.keywords);
		return turn
			? {
					...base,
					status: "si",
					evidence: [{ turnId: turn.id, quote: turn.text }],
				}
			: { ...base, status: "no", evidence: [] };
	}

	const turn = findTurn(student, item.keywords);
	if (turn)
		return {
			...base,
			status: "si",
			evidence: [{ turnId: turn.id, quote: turn.text }],
		};
	return { ...base, status: "no", evidence: [] };
}
