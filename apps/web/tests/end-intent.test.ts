import { describe, expect, test } from "vitest";

import {
	asksForBloodPressure,
	asksForEarExam,
	asksToEndExam,
	earIn,
} from "@/lib/exam/end-intent";

describe("pedir el oído o la presión por texto", () => {
	test.each([
		["Te voy a revisar el oído, ¿puedo?", true],
		["Mostrame el oído izquierdo", true],
		["¿Te duele el oído?", false],
		["Te miro las orejas con el otoscopio", true],
		["¿Tenés vértigo o zumbido en el oído?", false],
		["Te duele el oído, ¿verdad?", false],
		["¿Alguna vez te revisaron el oído?", false],
		["¿Te fijaste si te sale algo del oído?", false],
		["¿Puedo revisarte el oído?", true],
		["Dejame ver el oído", true],
		["¿Alguien te revisó el oído?", false],
		["¿Un médico te miró el oído?", false],
		["A ver, ¿desde cuándo te duele el oído?", false],
		["¿El dolor de oído es fijo o va y viene?", false],
		["¿Te mostraron cómo limpiarte el oído?", false],
		["¿Te hicieron un chequeo del oído?", false],
		["A ver el oído", true],
		["Mostrame la oreja", true],
		["Te reviso el oído", true],
		["Veamos ese oído", true],
		["Ahora vemos el oído", true],
		["¿Me mostrás la oreja?", true],
		["Veo que te duele mucho el oído", false],
		["Vamos a tomar una muestra del oído", false],
		["¿Alguien te revisó el oído?".normalize("NFD"), false],
	])("oído: %s", (text, expected) => {
		expect(asksForEarExam(text)).toBe(expected);
	});

	test.each([
		["Te voy a tomar la presión", true],
		["¿Sos hipertensa? ¿Tenés la presión alta?", false],
		["Te mido la tensión arterial", true],
	])("presión: %s", (text, expected) => {
		expect(asksForBloodPressure(text)).toBe(expected);
	});

	test("qué oído", () => {
		expect(earIn("Mostrame el oído izquierdo")).toBe("izquierdo");
		expect(earIn("Te reviso el oído")).toBe("derecho");
	});
});

describe("terminar el examen hablando", () => {
	test.each([
		"Ya podés cerrar la boca",
		"Cerrá la boca, gracias",
		"Listo, gracias",
		"Ya está",
		"Ya te revisé, podés volver",
		"Eso es todo",
		"No me muestres más el oído",
		"No hace falta ver más",
		"Terminé de revisarte",
		"Podés bajar la cabeza",
		"Dejá de mostrarme el oído",
		"Ya no me lo muestres",
		"Ya vi, gracias",
		"Basta, ya está bien",
		"Saco el otoscopio",
		"Perfecto, gracias",
		"Ya fue, volvé a como estabas",
	])("%s → termina", (text) => {
		expect(asksToEndExam(text)).toBe(true);
	});

	test.each([
		"No cierres la boca todavía",
		"Todavía no terminé",
		"Abrí un poco más la boca",
		"Decí aaa",
		"¿Te duele cuando trago?",
		"Mostrame el otro oído",
		"No está listo todavía",
	])("%s → sigue", (text) => {
		expect(asksToEndExam(text)).toBe(false);
	});
});
