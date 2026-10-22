// Errores críticos que no tienen que aparecer con frases comunes de una
// consulta (lib/scoring/extractor.ts). Bloquean el "Lo hiciste bien", así que
// un falso positivo le baja el veredicto a un estudiante que lo hizo bien.
import { describe, expect, test } from "vitest";

import type { Turn } from "@/lib/contracts/session";
import { evaluate } from "@/lib/scoring/evaluate";
import type { EvaluationInput } from "@/lib/scoring/types";

import { goodStudent } from "./helpers";

let n = 0;
// La consulta del buen estudiante más estas frases al final.
function plus(lines: [Turn["speaker"], string][]): EvaluationInput {
	const input = goodStudent();
	const last = Math.max(...input.turns.map((t) => t.startMs));
	const extra = lines.map(([speaker, text], i) => {
		n += 1;
		return {
			id: `fp${n}`,
			sessionId: input.session.id,
			speaker,
			text,
			startMs: last + (i + 1) * 5000,
			endMs: last + (i + 1) * 5000,
			overlap: false,
		};
	});
	return { ...input, turns: [...input.turns, ...extra] };
}

const critical = (input: EvaluationInput) =>
	evaluate(input)
		.mistakes.filter((m) => m.critical)
		.map((m) => m.tag);

describe("errores críticos sin falsos positivos", () => {
	test("el buen estudiante no tiene errores críticos", () => {
		expect(critical(goodStudent())).toEqual([]);
	});

	test.each([
		[
			"Me preocupa, no quiero que sea algo grave.",
			"Tranquila. Tenés que tomar mucho líquido y descansar.",
		],
		[
			"No quiero tomar antibióticos, me caen mal.",
			"Tenés que tomar ibuprofeno cada ocho horas.",
		],
		[
			"Dejame pensar... hace tres días.",
			"Bien. Y no seas tímida, ¿tenés fiebre?",
		],
	])(
		"dar indicaciones no es insistir contra una negativa: «%s» → «%s»",
		(patient, student) => {
			expect(
				critical(
					plus([
						["paciente", patient],
						["estudiante", student],
					]),
				),
			).not.toContain("insiste-contra-negativa");
		},
	);

	test("insistir de verdad contra la negativa al examen sigue siendo crítico", () => {
		expect(
			critical(
				plus([
					["paciente", "No, no quiero que me revises la garganta."],
					["estudiante", "Tenés que abrir la boca igual, no seas exagerada."],
				]),
			),
		).toContain("insiste-contra-negativa");
	});

	test.each([
		"Los antibióticos son inútiles contra un virus, así que no hacen falta.",
		"A mí no me importa el tiempo, contame tranquila.",
	])("una explicación clínica no es trato irrespetuoso: «%s»", (student) => {
		expect(critical(plus([["estudiante", student]]))).not.toContain(
			"trato-irrespetuoso",
		);
	});

	test.each([
		"Sos un inútil, no entendés nada.",
		"No me importa lo que sientas, contestá.",
		"Callate y abrí la boca.",
	])("el trato irrespetuoso sigue siendo crítico: «%s»", (student) => {
		expect(critical(plus([["estudiante", student]]))).toContain(
			"trato-irrespetuoso",
		);
	});
});
