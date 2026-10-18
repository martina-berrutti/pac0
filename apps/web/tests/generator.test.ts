import { describe, expect, test, vi } from "vitest";

// Sin IA: el generador usa la persona al azar.
vi.mock("@/server/ai", () => ({
	completeJson: vi.fn().mockRejectedValue(new Error("sin IA")),
}));

import { generateCase } from "@/lib/patient/generator";

describe("generador de pacientes", () => {
	test("siempre mujer, aunque el pedido diga hombre", async () => {
		for (const text of [
			"un hombre con dolor de garganta",
			"un señor con dolor de oído",
			"dolor de garganta",
		]) {
			const { clinicalCase } = await generateCase({ text });
			expect(clinicalCase.patient.sex).toBe("f");
			expect(clinicalCase.patient.name).toMatch(
				/^(Valentina|Camila|Florencia|Sofía|Lucía|Martina|Carmen|Graciela|Rosa|Ana|Julieta|Micaela|Agustina|Antonella|Bianca|Noelia|Romina|Paula|Lorena|Marina|Natalia|Rocío)$/,
			);
		}
	});

	test("si el pedido nombra una personalidad, queda elegida", async () => {
		const ansiosa = await generateCase({ text: "garganta, que sea ansiosa" });
		expect(ansiosa.personalityKey).toBe("ansioso");
		const sin = await generateCase({ text: "dolor de garganta" });
		expect(sin.personalityKey).toBe("caso");
	});

	test("un pedido de traumatología sale de una plantilla de rodilla, con zona", async () => {
		for (const text of [
			"dame un caso de traumatología",
			"algo de rodilla",
			"me duele la rodilla",
		]) {
			const { clinicalCase } = await generateCase({ text });
			expect(clinicalCase.painZone?.side).toMatch(/^(izquierda|derecha)$/);
			expect(clinicalCase.painZone?.spot).toMatch(
				/^(interlinea-interna|centro|colateral-interno)$/,
			);
			expect(clinicalCase.templateId).toMatch(
				/^(lesion-menisco|lesion-lca|esguince-colateral)$/,
			);
		}
		const lca = await generateCase({
			text: "rodilla, ligamento cruzado izquierda",
		});
		expect(lca.clinicalCase.templateId).toBe("lesion-lca");
		expect(lca.clinicalCase.painZone).toEqual({
			side: "izquierda",
			spot: "centro",
		});
	});
});

describe("traumatología", () => {
	test("inventa pacientes de rodilla nuevas, mujeres, sin Valeria", async () => {
		let n = 0;
		const rand = () => {
			n = (n * 7 + 3) % 11;
			return (n + 0.5) / 11;
		};
		for (let i = 0; i < 3; i++) {
			const { clinicalCase: c } = await generateCase(
				{ text: "dame un caso de traumatología" },
				rand,
			);
			expect(c.patient.sex).toBe("f");
			expect(c.patient.age).toBeGreaterThanOrEqual(24);
			expect(c.patient.age).toBeLessThanOrEqual(38);
			expect(c.patient.name).not.toBe("Valeria");
			expect(c.painZone?.side).toMatch(/izquierda|derecha/);
			expect(c.painZone?.spot).toBeTruthy();
			expect(JSON.stringify(c)).not.toContain("Valeria");
			expect(JSON.stringify(c)).not.toContain("fútbol 5 con");
		}
	});
});
