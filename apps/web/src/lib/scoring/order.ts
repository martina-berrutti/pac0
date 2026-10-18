// Orden de la consulta (Persona 3). La consulta se puede hacer en cualquier
// orden; el informe destaca si siguió el habitual: primero preguntar, después
// examinar y al final dar las indicaciones. No resta puntos.
import type { ConsultationOrder, ItemResult } from "@/lib/contracts/report";

import type { EvaluationInput } from "./types";

// Ítems que son indicaciones al paciente (van al final).
export const INDICATION_ITEMS = new Set(["reconsulta", "indica-sintomatico"]);

type Key = ConsultationOrder["steps"][number]["key"];

const TITLES: Record<Key, string> = {
	anamnesis: "Anamnesis",
	examen: "Examen físico",
	indicaciones: "Indicaciones al paciente",
};

export function buildOrder(
	input: EvaluationInput,
	items: ItemResult[],
): ConsultationOrder {
	const turnAt = new Map(input.turns.map((t) => [t.id, t.startMs]));
	// Cuándo cumplió cada ítem: su primera evidencia en la consulta.
	const itemAt = (i: ItemResult) =>
		i.evidence
			.map((e) => (e.turnId ? turnAt.get(e.turnId) : undefined))
			.filter((ms): ms is number => ms !== undefined)
			.sort((a, b) => a - b)[0];

	const anamnesis = items
		.filter((i) => i.dimension === "anamnesis" && i.status !== "no")
		.map((i) => ({ item: i, at: itemAt(i) }))
		.filter((x): x is { item: ItemResult; at: number } => x.at !== undefined);
	const indications = items
		.filter((i) => INDICATION_ITEMS.has(i.itemId) && i.status !== "no")
		.map(itemAt)
		.filter((ms): ms is number => ms !== undefined);
	const exams = [
		...input.examActions
			.filter((a) => a.variant !== "negado")
			.map((a) => a.startMs),
		...input.vitals.map((v) => v.atMs),
	];

	const first = (list: number[]) => (list.length ? Math.min(...list) : null);
	const firstAnamnesis = first(anamnesis.map((x) => x.at));
	const firstExam = first(exams);
	const lastExam = exams.length ? Math.max(...exams) : null;
	const firstIndication = first(indications);

	const notes: string[] = [];
	if (firstExam !== null && firstAnamnesis !== null) {
		const after = anamnesis.filter((x) => x.at > firstExam);
		if (firstExam < firstAnamnesis)
			notes.push(
				"Empezaste a examinar antes de preguntar. Lo habitual es preguntar primero: lo que cuenta el paciente orienta el examen.",
			);
		else if (after.length * 2 > anamnesis.length)
			notes.push(
				"La mayor parte de las preguntas las hiciste después de examinar. Conviene completar la anamnesis antes del examen.",
			);
	}
	if (firstIndication !== null) {
		if (lastExam !== null && firstIndication < lastExam)
			notes.push(
				"Diste indicaciones antes de terminar de examinar. Las indicaciones van al final, cuando ya tenés todos los datos.",
			);
		const essentialAfter = anamnesis.filter(
			(x) => x.item.weight === 3 && x.at > firstIndication,
		);
		if (essentialAfter.length > 0)
			notes.push(
				`Después de dar indicaciones seguiste preguntando datos importantes (${essentialAfter
					.map((x) => x.item.item)
					.join("; ")}).`,
			);
	}

	const steps = (
		[
			["anamnesis", firstAnamnesis],
			["examen", firstExam],
			["indicaciones", firstIndication],
		] as [Key, number | null][]
	)
		// Las que no hizo van al final; las demás, en el orden en que empezó.
		.sort(
			([, a], [, b]) =>
				(a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY),
		)
		.map(([key, atMs]) => ({ key, title: TITLES[key], atMs }));
	// Sin indicaciones en la lista del caso, ese paso no se muestra.
	const hasIndications = items.some((i) => INDICATION_ITEMS.has(i.itemId));
	return {
		ok: notes.length === 0,
		steps: steps.filter((s) => s.key !== "indicaciones" || hasIndications),
		notes,
	};
}
