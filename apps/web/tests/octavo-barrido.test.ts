import { describe, expect, test } from "vitest";

import {
	asksForBloodPressure,
	asksForTemperature,
	asksToEndExam,
} from "@/lib/exam/end-intent";
import { asksConsent } from "@/lib/patient/exam-instruction";
import { generateCase } from "@/lib/patient/generator";
import { startSession } from "@/server/consultation";
import { store } from "@/server/store";
import type { Viewer } from "@/server/token";
import { runTool } from "@/server/voice";

let n = 0;
function student(): Viewer & { alias: string } {
	n += 1;
	return {
		uid: `gst_octavo_${n}`,
		alias: `Estudiante ${n}`,
		careerYear: "3",
		guest: true,
		exp: Date.now() + 1e6,
	};
}

describe("presión: pedir permiso es consentimiento", () => {
	test.each([
		"¿Te puedo tomar la presión?",
		"¿Me dejás tomarte la presión?",
		"¿Me permitís tomarte la presión?",
		"Con tu permiso, te tomo la presión",
	])("%s", (text) => {
		expect(asksConsent(text)).toBe(true);
	});

	test("por voz, medir_presion con consentimiento lo registra", async () => {
		const ana = student();
		const id = await startSession(ana, "garganta-02", "caso");
		await runTool(ana, id, "medir_presion", {
			pasos_cumplidos: [],
			consentimiento: true,
		});
		expect((await store.getSession(id))?.consentGiven).toBe(true);
	});
});

describe("una instrucción más no cierra el examen", () => {
	test.each([
		["¿Podés volver a abrir la boca?", false],
		["¿Me podés volver a decir aaa?", false],
		["¿Podés bajar la lengua?", false],
		["Listo, ahora sacá la lengua", false],
		["Perfecto, gracias. Ahora decí aaa", false],
		["Bien, ya está casi, abrí un poco más", false],
		["Cuando termine de mirarte te explico", false],
		["Podés bajar la cabeza", true],
		["Listo, gracias", true],
		["Ya está, podés cerrar la boca", true],
	])("%s", (text, expected) => {
		expect(asksToEndExam(text)).toBe(expected);
	});
});

describe("temperatura y presión, frase por frase", () => {
	test.each([
		"Te voy a medir la presión, ¿tenés fiebre?",
		"Te voy a tomar la presión. ¿Tuviste fiebre estos días?",
		"Te tomo el pulso. ¿Tuviste fiebre?",
	])("no abre el termómetro: %s", (text) => {
		expect(asksForTemperature(text)).toBe(false);
	});

	test("'te tomo el pulso. ¿cómo andás de presión?' no abre el tensiómetro", () => {
		expect(
			asksForBloodPressure("Te tomo el pulso. ¿Cómo andás de presión?"),
		).toBe(false);
		expect(
			asksForBloodPressure("Te voy a medir la presión, ¿tenés fiebre?"),
		).toBe(true);
		expect(asksForTemperature("Vamos a medir si tenés fiebre")).toBe(true);
	});
});

test("'que no colabore' en el pedido baja la cooperación", async () => {
	const { clinicalCase } = await generateCase({
		text: "paciente con dolor de garganta que no colabore",
	});
	expect(clinicalCase.personality.cooperacion).toBeLessThan(0.5);
});
