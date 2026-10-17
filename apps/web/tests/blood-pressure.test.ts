import { describe, expect, test } from "vitest";

import type { ClinicalCase } from "@/cases/schema";
import type { VitalsMeasurement } from "@/lib/contracts/exam";
import type { Turn } from "@/lib/contracts/session";
import {
	armFor,
	measure,
	stepsFromConversation,
} from "@/lib/exam/blood-pressure";
import { BP_STEPS } from "@/lib/patient/tools";
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

const PREP = BP_STEPS.filter((s) => s !== "manguito_sobre_piel");
const goodCuff = { size: "adecuado" as const, overClothes: false };

function measurement(over: Partial<VitalsMeasurement>): VitalsMeasurement {
	return {
		id: "bp1",
		sessionId: "s1",
		stepsCompleted: [...BP_STEPS],
		techniqueErrors: [],
		shown: { pas: 112, pad: 70 },
		marked: { pas: 112, pad: 70 },
		cuff: goodCuff,
		atMs: 120_000,
		...over,
	};
}

describe("tensiómetro", () => {
	test("con todos los pasos y buen manguito marca el valor verdadero", () => {
		const r = measure([112, 70], PREP, goodCuff, 26);
		expect(r.techniqueErrors).toEqual([]);
		expect(r.shown).toEqual({ pas: 112, pad: 70 });
	});

	test("cada paso que falta suma su ajuste", () => {
		const r = measure(
			[112, 70],
			PREP.filter((s) => s !== "piernas_descruzadas"),
			goodCuff,
			26,
		);
		expect(r.techniqueErrors).toEqual(["piernas-cruzadas"]);
		expect(r.shown).toEqual({ pas: 119, pad: 72 });
	});

	test("lo que dice el estudiante cuenta como pasos (sin la voz)", () => {
		const steps = stepsFromConversation(
			said(
				"Sentate y descansá 5 minutos, sin hablar.",
				"Apoyá la espalda, los pies en el piso y descruzá las piernas.",
				"Apoyá el brazo acá, a la altura del corazón.",
				"¿Tomaste café o fumaste en la última media hora?",
			),
		);
		expect(measure([112, 70], steps, goodCuff, 26).techniqueErrors).toEqual([]);
		expect(steps).toContain("pregunta-sustancias");
	});

	test("caso trampa: sin reposo y hablando da alto", () => {
		const r = measure([130, 84], [], null, armFor("hipertension-01"));
		expect(r.techniqueErrors).toContain("sin-reposo");
		expect(r.techniqueErrors).toContain("hablando");
		expect(r.shown.pas).toBeGreaterThan(160);
	});

	test("el manguito de la vista manda sobre lo que dijo de la ropa", () => {
		const said = [...PREP, "manguito_sobre_piel"];
		expect(measure([112, 70], said, null, 26).techniqueErrors).toEqual([]);
		expect(
			measure([112, 70], said, { size: "adecuado", overClothes: true }, 26)
				.techniqueErrors,
		).toEqual(["sobre-ropa"]);
	});

	test("el manguito tiene que corresponder al brazo", () => {
		const errors = (size: "chico" | "adecuado" | "grande", arm: number) =>
			measure([112, 70], PREP, { size, overClothes: false }, arm)
				.techniqueErrors;
		expect(errors("chico", 26)).toEqual(["manguito-chico"]);
		expect(errors("adecuado", armFor("hipertension-01"))).toEqual([
			"manguito-chico",
		]);
		expect(errors("grande", 26)).toEqual(["manguito-grande"]);
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
					shown: { pas: 124, pad: 75 },
					marked: { pas: 124, pad: 76 },
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

	test("la técnica cuenta aunque no haya marcado", () => {
		const input = {
			...goodStudent(),
			vitals: [
				measurement({
					techniqueErrors: ["hablando"],
					marked: null,
					cuff: null,
				}),
			],
		};
		const tags = evaluate(input).mistakes.map((m) => m.tag);
		expect(tags).toContain("tecnica-hablando");
		expect(tags.some((t) => t.startsWith("lectura-"))).toBe(false);
	});

	test("marcar lejos del primer ruido es un error de lectura", () => {
		const input = {
			...goodStudent(),
			vitals: [measurement({ marked: { pas: 130, pad: 70 } })],
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
