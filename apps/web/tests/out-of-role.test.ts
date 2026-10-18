// El paciente no habla como médico ni como asistente (Persona 3).
import { describe, expect, test } from "vitest";

import { buildPatientBrief, buildPatientPrompt } from "@/lib/patient/brief";
import { soundsLikeDoctor } from "@/lib/patient/out-of-role";
import { ruleRespond } from "@/lib/patient/rule-responder";

import { lucia } from "./helpers";

describe("respuestas fuera del papel de paciente", () => {
	test.each([
		"La faringitis es una inflamación de la garganta. Deberías consultar con un especialista.",
		"Te recomiendo que tomes ibuprofeno.",
		"Como asistente, no puedo dar diagnósticos.",
		"Lo mejor es que consultes con un médico.",
		"Se trata con antibióticos si es bacteriana.",
	])("descarta: %s", (text) => {
		expect(soundsLikeDoctor(text)).toBe(true);
	});

	test.each([
		"Me duele al tragar, como un 4 de 10.",
		"¿Faringitis? ¿Y eso es grave?",
		"No sé, para eso vine.",
		"Sí, tomé un antigripal ayer.",
		"Mi compañera está resfriada.",
	])("deja pasar: %s", (text) => {
		expect(soundsLikeDoctor(text)).toBe(false);
	});
});

describe("cuando le dicen qué tiene", () => {
	const brief = buildPatientBrief(lucia, lucia.personality, "");
	const state = { confianza: 0.9, ansiedad: 0.3, dolor: 0.4, paciencia: 0.7 };

	test("las instrucciones le prohíben explicar o derivar", () => {
		const prompt = buildPatientPrompt(brief);
		expect(prompt).toContain("no un médico ni un asistente");
		expect(prompt).toContain("especialista");
	});

	test.each([
		"Creo que tenés una faringitis viral.",
		"Lo que tenés es un resfrío.",
		"Es un virus, no te preocupes.",
	])("sin IA pregunta, no explica: %s", (text) => {
		expect(ruleRespond(brief, state, text, 5).text).toContain("¿Es grave?");
	});

	test("preguntar si tiene gripe no es decirle qué tiene", () => {
		expect(ruleRespond(brief, state, "¿Tenés gripe?", 5).text).not.toContain(
			"¿Es grave?",
		);
	});
});
