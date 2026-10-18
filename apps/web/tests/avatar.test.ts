import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/avatar/commands";
import { moodFor } from "@/lib/avatar/mood";
import { ARCHETYPES, getArchetype } from "@/lib/patient/personalities";
import { PERSONALITY_VOICES, VOICES, voiceFor } from "@/lib/patient/voices";

const calm = { confianza: 0.5, ansiedad: 0.3, dolor: 0.5, paciencia: 0.8 };

describe("cara según el estado del paciente", () => {
	test.each([
		["tranquila", calm, "neutral"],
		["sin paciencia", { ...calm, paciencia: 0.2 }, "angry"],
		["desconfiada", { ...calm, confianza: 0.2 }, "angry"],
		["ansiosa", { ...calm, ansiedad: 0.7 }, "fear"],
		["con mucho dolor", { ...calm, dolor: 0.8 }, "sad"],
		["con confianza", { ...calm, confianza: 0.8 }, "happy"],
		// El enojo pesa más que la ansiedad.
		[
			"ansiosa y sin paciencia",
			{ ...calm, ansiedad: 0.7, paciencia: 0.1 },
			"angry",
		],
	] as const)("%s", (_name, state, mood) => {
		expect(moodFor(state)).toBe(mood);
	});
});

// El estado con el que arranca cada personalidad (server/consultation.ts).
function startState(key: string) {
	const p = getArchetype(key)?.personality;
	if (!p) throw new Error(key);
	return {
		confianza: 1 - p.desconfianza,
		ansiedad: p.ansiedad,
		dolor: 0.5,
		paciencia: p.paciencia,
	};
}

describe("cara y voz coherentes con la personalidad elegida", () => {
	test.each([
		["directo", "neutral"],
		["ansioso", "fear"],
		["enojado", "angry"],
		["feliz", "happy"],
		["triste", "sad"],
		["hostil", "disgust"],
	])("%s arranca con cara %s", (key, mood) => {
		const a = getArchetype(key);
		expect(a?.mood).toBe(mood);
		expect(moodFor(startState(key), a?.mood)).toBe(mood);
	});

	test("cada personalidad tiene voz de mujer y de varón de la lista", () => {
		for (const a of ARCHETYPES) {
			expect(PERSONALITY_VOICES.f as readonly string[]).toContain(a.voice.f);
			expect(PERSONALITY_VOICES.m as readonly string[]).toContain(a.voice.m);
			expect(voiceFor(a.voice, "f")).toBe(a.voice.f);
			expect(voiceFor(a.voice, "m")).toBe(a.voice.m);
		}
		// Con la personalidad del caso, al azar entre las del sexo.
		expect(VOICES.f as readonly string[]).toContain(voiceFor(undefined, "f"));
	});

	test("el enojado se calma si lo tratan bien", () => {
		const s = startState("enojado");
		expect(moodFor(s, "angry")).toBe("angry");
		expect(moodFor({ ...s, confianza: 0.8, paciencia: 0.5 }, "angry")).toBe(
			"neutral",
		);
	});

	test("el feliz se enoja si lo maltratan o le agotan la paciencia", () => {
		const s = startState("feliz");
		expect(moodFor({ ...s, confianza: 0.2 }, "happy")).toBe("angry");
		expect(moodFor({ ...s, paciencia: 0.1 }, "happy")).toBe("angry");
	});

	test("el ansioso se tranquiliza y el desconfiado afloja", () => {
		expect(moodFor({ ...startState("ansioso"), ansiedad: 0.3 }, "fear")).toBe(
			"neutral",
		);
		expect(
			moodFor({ ...startState("hostil"), confianza: 0.8 }, "disgust"),
		).toBe("neutral");
	});
});

describe("órdenes al avatar", () => {
	test.each([
		["Abrí la boca", { kind: "mouth", tongue: false }],
		["abrí la boca y sacá la lengua", { kind: "mouth", tongue: true }],
		["decí aaa", { kind: "mouth", tongue: true }],
		["¡Levantá la mano!", { kind: "gesture", gesture: "handup" }],
		["encogete de hombros", { kind: "gesture", gesture: "shrug" }],
		["poné cara de dolor", { kind: "face", face: "dolor" }],
		["ponete triste", { kind: "mood", mood: "sad" }],
		["estás enojado", { kind: "mood", mood: "angry" }],
		["mirá a la cámara", { kind: "eyes" }],
		["decí que no", { kind: "face", face: "no" }],
		["acercate", { kind: "view", view: "head" }],
	])("%s", (text, expected) => {
		expect(parseCommand(text)).toEqual(expected);
	});

	test("lo que no entiende devuelve null", () => {
		expect(parseCommand("calculá la raíz cuadrada")).toBeNull();
		expect(parseCommand("   ")).toBeNull();
	});
});
