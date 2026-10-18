import { describe, expect, test } from "vitest";

import { asksForTemperature } from "@/lib/exam/end-intent";

import {
	audible,
	LEAK_PER_S,
	leak,
	MAX_MMHG,
	NEXT_VALVE,
	needleAngle,
	pump,
} from "@/lib/exam/manometer";

describe("tensiómetro de pera", () => {
	test("cada apretón sube la presión, sin pasar el máximo", () => {
		expect(pump(0, "cerrada")).toBe(18);
		expect(pump(MAX_MMHG - 5, "cerrada")).toBe(MAX_MMHG);
		// Con la válvula abierta del todo, el aire se escapa.
		expect(pump(0, "abierta")).toBeLessThan(pump(0, "cerrada"));
	});

	test("con la válvula cerrada casi no baja; abierta un poco, 2 a 3 mmHg/s", () => {
		expect(leak(180, "cerrada", 1)).toBeGreaterThan(179);
		expect(LEAK_PER_S.poco).toBeGreaterThanOrEqual(2);
		expect(LEAK_PER_S.poco).toBeLessThanOrEqual(3);
		expect(leak(180, "abierta", 10)).toBe(0);
	});

	test("la válvula se gira: cerrada, un poco, abierta y vuelve", () => {
		expect(NEXT_VALVE.cerrada).toBe("poco");
		expect(NEXT_VALVE.poco).toBe("abierta");
		expect(NEXT_VALVE.abierta).toBe("cerrada");
	});

	test("la aguja recorre 300° de 0 a 300 mmHg", () => {
		expect(needleAngle(0)).toBe(-150);
		expect(needleAngle(150)).toBe(0);
		expect(needleAngle(300)).toBe(150);
		expect(needleAngle(400)).toBe(150);
	});

	test("los ruidos suenan entre la PAS y la PAD, no mientras se infla", () => {
		const gauge = { pas: 120, pad: 80 };
		expect(audible(100, gauge, 1000)).toBe(true);
		expect(audible(130, gauge, 1000)).toBe(false);
		expect(audible(70, gauge, 1000)).toBe(false);
		expect(audible(100, gauge, 100)).toBe(false);
	});
});

describe("pedir la temperatura", () => {
	test("abre el termómetro cuando se va a tomar ahora", () => {
		for (const t of [
			"Te voy a tomar la temperatura, ¿puedo?",
			"Ahora te tomo la temperatura",
			"Te pongo el termómetro debajo del brazo",
			"Vamos a medir si tenés fiebre",
		])
			expect(asksForTemperature(t), t).toBe(true);
	});

	test("preguntar por la historia no lo abre", () => {
		for (const t of [
			"¿Te tomaste la temperatura?",
			"¿Tuviste fiebre?",
			"¿Cuánta fiebre tuviste?",
			"¿Tenés termómetro en tu casa?",
		])
			expect(asksForTemperature(t), t).toBe(false);
	});
});
