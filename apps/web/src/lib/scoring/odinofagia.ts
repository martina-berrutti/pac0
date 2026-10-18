// Informe de odinofagia (Persona 3): la lista de la especificación en
// bloques ✓/✗ (anamnesis, examen físico e indicaciones). Sale de los ítems ya
// juzgados: no vuelve a juzgar nada. Solo en los casos con el ítem de signos
// de alarma.
import type { ItemResult, Odinofagia } from "@/lib/contracts/report";

import type { Extracted } from "./extractor";
import { ALARM_ITEM, ALARM_SIGNS, alarmSignsAsked } from "./rule-judge";
import type { EvaluationInput } from "./types";

type Status = ItemResult["status"];
type Check = Odinofagia["blocks"][number]["checks"][number];

function blockStatus(checks: Check[]): Status {
	if (checks.every((c) => c.status === "si")) return "si";
	if (checks.every((c) => c.status === "no")) return "no";
	return "parcial";
}

export function buildOdinofagia(
	input: EvaluationInput,
	items: ItemResult[],
	extracted: Extracted,
): Odinofagia | undefined {
	if (!items.some((i) => i.itemId === ALARM_ITEM)) return undefined;
	const item = (id: string, label: string): Check[] => {
		const found = items.find((i) => i.itemId === id);
		return found ? [{ label, status: found.status }] : [];
	};

	const asked = alarmSignsAsked(input, extracted).map((a) => a.sign);
	const missing = ALARM_SIGNS.map((a) => a.sign).filter(
		(s) => !asked.includes(s),
	);
	const alarm = item("signos-alarma", "Descartó los signos de alarma").map(
		(c) => ({
			...c,
			detail:
				missing.length === 0
					? "Preguntaste por todos."
					: `Te faltó: ${missing.join(", ")}.`,
		}),
	);

	const all: Omit<Odinofagia["blocks"][number], "status">[] = [
		{
			key: "anamnesis",
			title: "Anamnesis",
			checks: [
				...item("edad", "Preguntó la edad"),
				...item("tos-catarro", "Preguntó por tos"),
				...item("fiebre", "Preguntó por fiebre"),
				...alarm,
			],
		},
		{
			key: "examen",
			title: "Examen físico",
			checks: [
				...item("orofaringe", "Inspeccionó la orofaringe (exudado)"),
				...item("adenopatias", "Palpó o preguntó por los ganglios del cuello"),
			],
		},
		{
			key: "indicaciones",
			title: "Indicaciones al paciente",
			checks: [
				...item("reconsulta", "Explicó cuándo volver a consultar"),
				...item(
					"indica-sintomatico",
					"Indicó tratamiento sintomático (analgésicos, líquidos)",
				),
			],
		},
	];
	const blocks = all
		.filter((b) => b.checks.length > 0)
		.map((b) => ({ ...b, status: blockStatus(b.checks) }));

	return { blocks };
}
