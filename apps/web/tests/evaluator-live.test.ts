// Ciclo de validación del evaluador con el modelo real (plan.md, sección 8).
// Solo corre con OPENAI_API_KEY en el entorno; gasta tokens.
import { describe, expect, test } from "vitest";

import { evaluateWithAi } from "@/lib/scoring/ai-evaluate";
import { evaluate } from "@/lib/scoring/evaluate";
import { completeJson } from "@/server/ai";

import { averageStudent, badStudent, goodStudent } from "./helpers";

// Variación máxima del total entre corridas (plan.md: por ejemplo 5 puntos).
const MAX_SPREAD = 5;

describe.skipIf(!process.env.OPENAI_API_KEY)("evaluador con IA real", () => {
	test("ordena bueno > mediocre > malo", { timeout: 180_000 }, async () => {
		const [good, average, bad] = await Promise.all(
			[goodStudent(), averageStudent(), badStudent()].map((input) =>
				evaluateWithAi(input, completeJson),
			),
		);
		console.info("totales:", good?.total, average?.total, bad?.total);
		expect(good?.judge).toBe("ia");
		expect(good?.total).toBeGreaterThan(average?.total ?? 0);
		expect(average?.total).toBeGreaterThan(bad?.total ?? 0);
	});

	test(`la misma transcripción 3 veces varía menos de ${MAX_SPREAD} puntos`, {
		timeout: 180_000,
	}, async () => {
		const input = averageStudent();
		const totals = await Promise.all(
			[1, 2, 3].map(
				async () => (await evaluateWithAi(input, completeJson)).total,
			),
		);
		console.info("corridas:", totals);
		expect(Math.max(...totals) - Math.min(...totals)).toBeLessThan(MAX_SPREAD);
	});

	test("cero omisiones inventadas", { timeout: 180_000 }, async () => {
		// En el buen estudiante, todo lo que las reglas encuentran con su cita no
		// puede quedar como omisión.
		const input = goodStudent();
		const report = await evaluateWithAi(input, completeJson);
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
