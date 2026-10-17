import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/avatar/commands";

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
