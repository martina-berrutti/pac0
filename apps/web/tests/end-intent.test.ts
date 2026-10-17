import { describe, expect, test } from "vitest";

import { asksToEndExam } from "@/lib/exam/end-intent";

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
