// Juez por reglas: busca las palabras clave de cada ítem en los turnos del
// estudiante y cita el turno. Sin evidencia no hay "sí". Es el respaldo del
// juez con IA (ai-judge.ts), que devuelve lo mismo.
import type { ChecklistItem } from "@/cases/schema";
import type { ItemResult } from "@/lib/contracts/report";
import type { Turn } from "@/lib/contracts/session";
import { MARK_TOLERANCE } from "@/lib/exam/blood-pressure";

import { type Extracted, extract } from "./extractor";
import type { EvaluationInput } from "./types";

// Ítems que se juzgan con las acciones de examen, no con lo que dijo.
export const ACTION_ITEMS = new Set([
	"orofaringe",
	"presion-arterial",
	"otoscopia",
]);

export function normalize(s: string) {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

export function findTurn(turns: Turn[], keywords: string[]) {
	const keys = keywords.map(normalize);
	return turns.find((t) => keys.some((k) => normalize(t.text).includes(k)));
}

// Turnos del estudiante que pueden probar el ítem. Describir el hallazgo solo
// cuenta después de examinar.
export function turnsForItem(item: ChecklistItem, extracted: Extracted) {
	if (item.id !== "describe-hallazgo") return extracted.studentTurns;
	const from = extracted.firstExamMs;
	return from === null
		? []
		: extracted.studentTurns.filter((t) => t.startMs >= from);
}

function judgeExamAction(
	base: Omit<ItemResult, "status" | "evidence">,
	extracted: Extracted,
): ItemResult {
	const { fullExam, partialExam } = extracted;
	if (!fullExam) {
		return partialExam
			? {
					...base,
					status: "parcial",
					evidence: [
						{ examActionId: partialExam.id, quote: "solo apertura parcial" },
					],
				}
			: { ...base, status: "no", evidence: [] };
	}
	return {
		...base,
		status: extracted.zoneCoverage >= 0.66 ? "si" : "parcial",
		evidence: [
			{
				examActionId: fullExam.id,
				quote: `zonas vistas: ${extracted.zonesSeen.join(", ") || "ninguna"}`,
			},
		],
	};
}

// Presión: sí con técnica sin errores y PAS y PAD bien marcadas; parcial si
// midió con errores.
function judgeBloodPressure(
	base: Omit<ItemResult, "status" | "evidence">,
	extracted: Extracted,
): ItemResult {
	const { bp } = extracted;
	if (!bp?.marked || !bp.gauge) return { ...base, status: "no", evidence: [] };
	const wellRead =
		Math.abs(bp.marked.systolic - bp.gauge.systolic) <= MARK_TOLERANCE &&
		Math.abs(bp.marked.diastolic - bp.gauge.diastolic) <= MARK_TOLERANCE;
	const clean = bp.techniqueErrors.length === 0 && wellRead;
	return {
		...base,
		status: clean ? "si" : "parcial",
		evidence: [
			{
				examActionId: bp.id,
				quote: `marcó ${bp.marked.systolic}/${bp.marked.diastolic} con ${bp.techniqueErrors.length} errores de técnica`,
			},
		],
	};
}

// Otoscopia: sí si algún oído se examinó sin errores; parcial si hubo errores.
function judgeOtoscopy(
	base: Omit<ItemResult, "status" | "evidence">,
	extracted: Extracted,
): ItemResult {
	const done = extracted.otoscopies;
	if (done.length === 0) return { ...base, status: "no", evidence: [] };
	const clean = done.find((a) => a.technique?.errors.length === 0);
	const shown = clean ?? done[0];
	return {
		...base,
		status: clean ? "si" : "parcial",
		evidence: shown
			? [
					{
						examActionId: shown.id,
						quote: `${shown.zone}: ${shown.technique?.errors.length ?? 0} errores de técnica`,
					},
				]
			: [],
	};
}

export function judgeItem(
	item: ChecklistItem,
	input: EvaluationInput,
	extracted: Extracted = extract(input),
): ItemResult {
	const base = {
		itemId: item.id,
		item: item.item,
		dimension: item.dimension,
		weight: item.weight,
	};
	if (item.id === "presion-arterial")
		return judgeBloodPressure(base, extracted);
	if (item.id === "otoscopia") return judgeOtoscopy(base, extracted);
	if (ACTION_ITEMS.has(item.id)) return judgeExamAction(base, extracted);

	const turn = findTurn(turnsForItem(item, extracted), item.keywords);
	return turn
		? {
				...base,
				status: "si",
				evidence: [{ turnId: turn.id, quote: turn.text }],
			}
		: { ...base, status: "no", evidence: [] };
}
