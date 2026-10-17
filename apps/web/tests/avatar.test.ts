import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/avatar/commands";
import { moodFor } from "@/lib/avatar/mood";

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
