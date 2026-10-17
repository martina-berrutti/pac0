import { describe, expect, test } from "vitest";

import { HIDDEN_RATE, lightRate } from "@/lib/exam/oropharynx";

describe("abatelenguas", () => {
	test("sin abatelenguas, las amígdalas y la pared posterior cuentan la mitad", () => {
		for (const zone of ["amigdala-izq", "amigdala-der", "pared-posterior"]) {
			expect(lightRate(zone, false)).toBe(HIDDEN_RATE);
			expect(lightRate(zone, true)).toBe(1);
		}
	});

	test("el resto de las zonas no cambia", () => {
		for (const zone of ["uvula", "paladar", "lengua"]) {
			expect(lightRate(zone, false)).toBe(1);
			expect(lightRate(zone, true)).toBe(1);
		}
	});
});
