import { describe, expect, test } from "vitest";

import type { ClinicalCase } from "@/cases/schema";
import type { VitalsMeasurement } from "@/lib/contracts/exam";
import type { Turn } from "@/lib/contracts/session";
import {
	assessConversation,
	assessCuff,
	gaugeReading,
	scenarioFor,
} from "@/lib/exam/blood-pressure";
import { evaluate } from "@/lib/scoring/evaluate";

import { goodStudent, lucia } from "./helpers";

function said(...texts: string[]): Turn[] {
	return texts.map((text, i) => ({
		id: `bp${i}`,
		sessionId: "s1",
		speaker: "estudiante",
		text,
		startMs: i * 1000,
		endMs: i * 1000,
		overlap: false,
	}));
}

function measurement(over: Partial<VitalsMeasurement>): VitalsMeasurement {
	return {
		id: "bp1",
		sessionId: "s1",
		stepsCompleted: [],
		techniqueErrors: [],
		cuffSize: "adecuado",
		overClothes: false,
		gauge: { systolic: 112, diastolic: 70 },
		marked: { systolic: 112, diastolic: 70 },
		atMs: 120_000,
		...over,
	};
}

describe("tensiómetro", () => {
	test("el manómetro suma los ajustes de cada error de técnica", () => {
		expect(gaugeReading([112, 70], [])).toEqual({
			systolic: 112,
			diastolic: 70,
		});
		expect(gaugeReading([112, 70], ["piernas-cruzadas", "brazo-bajo"])).toEqual(
			{ systolic: 126, diastolic: 78 },
		);
	});

	test("lo que dice el estudiante corrige la postura", () => {
		const scenario = scenarioFor("garganta-01", 96);
		const none = assessConversation([], scenario);
		expect(none.errors).toEqual(["piernas-cruzadas", "brazo-bajo"]);
		const fixed = assessConversation(
			said(
				"Descruzá las piernas, por favor.",
				"Apoyá el brazo acá, a la altura del corazón.",
				"¿Tomaste café o fumaste en la última media hora?",
			),
			scenario,
		);
		expect(fixed.errors).toEqual([]);
		expect(fixed.steps).toContain("pregunta-sustancias");
		expect(fixed.steps).toContain("descruza-piernas");
	});

	test("caso trampa: sin reposo y hablando da alto", () => {
		const scenario = scenarioFor("hipertension-01", 88);
		const { errors } = assessConversation([], scenario);
		expect(errors).toContain("sin-reposo");
		expect(errors).toContain("hablando");
		const reading = gaugeReading([130, 84], errors);
		expect(reading.systolic).toBeGreaterThan(160);
	});

	test("el manguito tiene que corresponder al brazo y ir sobre la piel", () => {
		expect(assessCuff("adecuado", false, 26).errors).toEqual([]);
		expect(assessCuff("chico", false, 26).errors).toEqual(["manguito-chico"]);
		expect(assessCuff("adecuado", false, 35).errors).toEqual([
			"manguito-chico",
		]);
		expect(assessCuff("grande", true, 26).errors).toEqual([
			"manguito-grande",
			"sobre-ropa",
		]);
	});
});

describe("evaluación de la presión", () => {
	test("buena técnica y buena lectura no restan", () => {
		const input = { ...goodStudent(), vitals: [measurement({})] };
		const report = evaluate(input);
		expect(report.mistakes.some((m) => m.tag.startsWith("tecnica-"))).toBe(
			false,
		);
		expect(report.scores.examen).toBe(evaluate(goodStudent()).scores.examen);
	});

	test("cada error de técnica resta y dice qué hubiera marcado", () => {
		const input = {
			...goodStudent(),
			vitals: [
				measurement({
					techniqueErrors: ["piernas-cruzadas", "sobre-ropa"],
					gauge: { systolic: 123, diastolic: 75 },
					marked: { systolic: 124, diastolic: 76 },
				}),
			],
		};
		const report = evaluate(input);
		const tags = report.mistakes.map((m) => m.tag);
		expect(tags).toContain("tecnica-piernas-cruzadas");
		expect(tags).toContain("tecnica-sobre-ropa");
		const reading = report.mistakes.find((m) => m.tag === "presion-lectura");
		expect(reading?.what).toContain("112/70");
		expect(report.scores.examen).toBe(
			evaluate(goodStudent()).scores.examen - 4,
		);
	});

	test("marcar lejos del primer ruido es un error de lectura", () => {
		const input = {
			...goodStudent(),
			vitals: [measurement({ marked: { systolic: 130, diastolic: 70 } })],
		};
		const tags = evaluate(input).mistakes.map((m) => m.tag);
		expect(tags).toContain("lectura-pas");
		expect(tags).not.toContain("lectura-pad");
	});

	test("medir antes del consentimiento es error crítico", () => {
		const input = {
			...goodStudent(),
			events: [
				{
					id: "c1",
					sessionId: "s1",
					type: "consentimiento" as const,
					atMs: 100_000,
				},
			],
			vitals: [measurement({ atMs: 20_000 })],
		};
		expect(
			evaluate(input).mistakes.some(
				(m) => m.critical && m.tag === "examen-sin-consentimiento",
			),
		).toBe(true);
	});

	test("un caso con el ítem de presión lo juzga con la medición", () => {
		const withItem: ClinicalCase = {
			...lucia,
			expectedChecklist: [
				...lucia.expectedChecklist,
				{
					id: "presion-arterial",
					item: "toma la presión con buena técnica",
					dimension: "examen",
					weight: 3,
					keywords: [],
				},
			],
		};
		const item = (vitals: VitalsMeasurement[]) =>
			evaluate({ ...goodStudent(), clinicalCase: withItem, vitals }).items.find(
				(i) => i.itemId === "presion-arterial",
			)?.status;
		expect(item([])).toBe("no");
		expect(item([measurement({})])).toBe("si");
		expect(item([measurement({ techniqueErrors: ["brazo-bajo"] })])).toBe(
			"parcial",
		);
	});
});
