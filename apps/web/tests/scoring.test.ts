import { describe, expect, test } from "vitest";

import { reportSchema } from "@/lib/contracts/report";
import { dimensionScore, totalScore, verdictFor } from "@/lib/scoring/engine";
import { evaluate } from "@/lib/scoring/evaluate";

import { averageStudent, badStudent, goodStudent } from "./helpers";

describe("motor de puntaje", () => {
	test("ganados ÷ aplicables × 100, parcial vale la mitad", () => {
		const items = [
			{
				itemId: "a",
				item: "a",
				dimension: "anamnesis" as const,
				weight: 3,
				status: "si" as const,
				evidence: [],
			},
			{
				itemId: "b",
				item: "b",
				dimension: "anamnesis" as const,
				weight: 2,
				status: "parcial" as const,
				evidence: [],
			},
			{
				itemId: "c",
				item: "c",
				dimension: "anamnesis" as const,
				weight: 1,
				status: "no" as const,
				evidence: [],
			},
		];
		expect(dimensionScore(items, [])).toBe(67); // (3 + 1) / 6
	});

	test("las penalizaciones tienen tope de 15 por dimensión", () => {
		const items = [
			{
				itemId: "a",
				item: "a",
				dimension: "comunicacion" as const,
				weight: 3,
				status: "si" as const,
				evidence: [],
			},
		];
		const pens = Array.from({ length: 10 }, () => ({
			dimension: "comunicacion" as const,
			points: 3,
			tag: "x",
			what: "x",
		}));
		expect(dimensionScore(items, pens)).toBe(85);
	});

	test("total ponderado 30/25/25/20", () => {
		expect(
			totalScore({
				anamnesis: 100,
				examen: 0,
				razonamiento: 0,
				comunicacion: 0,
			}),
		).toBe(30);
		expect(
			totalScore({
				anamnesis: 100,
				examen: 100,
				razonamiento: 100,
				comunicacion: 100,
			}),
		).toBe(100);
	});

	test("veredicto: 85% sin errores críticos", () => {
		expect(verdictFor(90, 0).verdict).toBe("lo_hiciste_bien");
		expect(verdictFor(90, 1).verdict).toBe("error_critico");
		expect(verdictFor(75, 0).verdict).toBe("casi");
		expect(verdictFor(50, 0).verdict).toBe("a_repasar");
	});
});

describe("evaluador con estudiantes simulados", () => {
	test("ordena bueno > mediocre > malo", () => {
		const good = evaluate(goodStudent());
		const average = evaluate(averageStudent());
		const bad = evaluate(badStudent());
		expect(good.total).toBeGreaterThan(average.total);
		expect(average.total).toBeGreaterThan(bad.total);
		expect(good.verdict).toBe("lo_hiciste_bien");
	});

	test("es determinista: tres corridas dan lo mismo", () => {
		const totals = [1, 2, 3].map(() => evaluate(goodStudent()).total);
		expect(new Set(totals).size).toBe(1);
	});

	test("examinar sin consentimiento es error crítico", () => {
		const report = evaluate(badStudent());
		expect(
			report.mistakes.some(
				(m) => m.critical && m.tag === "examen-sin-consentimiento",
			),
		).toBe(true);
	});

	test("cada ítem cumplido cita su evidencia; sin evidencia no hay sí", () => {
		const report = evaluate(goodStudent());
		for (const item of report.items.filter((i) => i.status === "si")) {
			expect(item.evidence.length).toBeGreaterThan(0);
		}
		expect(() => reportSchema.parse(report)).not.toThrow();
	});
});
