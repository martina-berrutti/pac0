// Ciclo de validación del evaluador con el modelo real (plan.md, sección 8).
// Solo corre con GEMINI_API_KEY u OPENAI_API_KEY en el entorno (la misma
// elección que server/ai.ts); gasta tokens.
import { describe, expect, test } from "vitest";
import type { z } from "zod";

import { evaluateWithAi } from "@/lib/scoring/ai-evaluate";
import type { JsonLlm } from "@/lib/scoring/ai-judge";
import { evaluate } from "@/lib/scoring/evaluate";
import type { EvaluationInput } from "@/lib/scoring/types";
import { aiEnabled, completeJson } from "@/server/ai";

import { averageStudent, badStudent, goodStudent } from "./helpers";

// Variación máxima del total entre corridas (plan.md: por ejemplo 5 puntos).
const MAX_SPREAD = 5;

// La cuota gratuita de Gemini es de 15 pedidos por minuto por modelo. Al
// pasarla, server/ai.ts salta a otro modelo y mezcla resultados, o el
// evaluador cae al juez por reglas. Se espacian los pedidos para no llegar.
const MIN_GAP_MS = 5_000;
let nextSlot = 0;
const paced: JsonLlm = async <T>(prompt: string, schema: z.ZodType<T>) => {
	const now = Date.now();
	const wait = Math.max(0, nextSlot - now);
	nextSlot = Math.max(nextSlot, now) + MIN_GAP_MS;
	await new Promise((r) => setTimeout(r, wait));
	return completeJson(prompt, schema);
};

// Si el modelo falla, evaluateWithAi vuelve al juez por reglas sin avisar;
// acá eso tiene que fallar, porque lo que se prueba es la IA.
async function withAi(input: EvaluationInput) {
	const report = await evaluateWithAi(input, paced);
	expect(report.judge, "el evaluador cayó al juez por reglas").toBe("ia");
	return report;
}

describe.skipIf(!aiEnabled())("evaluador con IA real", () => {
	test("ordena bueno > mediocre > malo", { timeout: 180_000 }, async () => {
		const [good, average, bad] = await Promise.all(
			[goodStudent(), averageStudent(), badStudent()].map(withAi),
		);
		console.info("totales:", good?.total, average?.total, bad?.total);
		expect(good?.total).toBeGreaterThan(average?.total ?? 0);
		expect(average?.total).toBeGreaterThan(bad?.total ?? 0);
	});

	test(`la misma transcripción 3 veces varía menos de ${MAX_SPREAD} puntos`, {
		timeout: 180_000,
	}, async () => {
		const input = averageStudent();
		const totals = await Promise.all(
			[1, 2, 3].map(async () => (await withAi(input)).total),
		);
		console.info("corridas:", totals);
		expect(Math.max(...totals) - Math.min(...totals)).toBeLessThan(MAX_SPREAD);
	});

	test("cero omisiones inventadas", { timeout: 180_000 }, async () => {
		// En el buen estudiante, todo lo que las reglas encuentran con su cita no
		// puede quedar como omisión.
		const input = goodStudent();
		const report = await withAi(input);
		const found = new Set(
			evaluate(input)
				.items.filter((i) => i.status === "si")
				.map((i) => i.itemId),
		);
		const invented = report.items.filter(
			(i) => i.status === "no" && found.has(i.itemId),
		);
		expect(invented.map((i) => i.itemId)).toEqual([]);
	});
});
