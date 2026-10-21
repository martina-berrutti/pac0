import { describe, expect, it } from "vitest";

import { caseBank } from "@/cases";
import { AVATARS, pickPatient, withPatient } from "@/lib/patient/avatars";
import { buildPatientBrief, buildPatientPrompt } from "@/lib/patient/brief";

const garganta = caseBank.find((c) => c.id === "garganta-02");
const rodilla = caseBank.find((c) => c.id === "rodilla-03");

// Sorteo fijo: devuelve los valores en orden, una y otra vez.
const seq = (...xs: number[]) => {
	let i = 0;
	return () => xs[i++ % xs.length] as number;
};

describe("paciente sorteado", () => {
	it("cada caso del banco tiene avatares que existen y edades que les quedan", () => {
		for (const c of caseBank) {
			expect(c.patients, c.id).toBeDefined();
			for (const id of c.patients?.avatars ?? []) {
				const a = AVATARS.find((x) => x.id === id);
				expect(a, id).toBeDefined();
				const [lo, hi] = c.patients?.age ?? [0, 0];
				expect(Math.max(lo, a?.ages[0] ?? 0)).toBeLessThanOrEqual(
					Math.min(hi, a?.ages[1] ?? 0),
				);
			}
		}
	});

	it("nombre, edad y sexo van con el avatar", () => {
		if (!garganta) throw new Error("falta garganta-02");
		for (let r = 0; r < 1; r += 0.05) {
			const p = pickPatient(garganta, seq(r, 0.5, 0.5));
			expect(garganta.patients?.avatars).toContain(p.avatar);
			const a = AVATARS.find((x) => x.id === p.avatar);
			expect(a?.sex).toBe(p.sex);
			expect(p.age).toBeGreaterThanOrEqual(19);
			expect(p.age).toBeLessThanOrEqual(27);
		}
	});

	it("si viene un varón, habla en masculino y lo clínico no cambia", () => {
		if (!rodilla) throw new Error("falta rodilla-03");
		const c = withPatient(rodilla, {
			avatar: "hombre-adulto",
			name: "Martín",
			age: 33,
			sex: "m",
		});
		expect(c.patient).toMatchObject({ name: "Martín", age: 33, sex: "m" });
		expect(c.profile.edad).toBe("33 años");
		expect(c.profile.ocupacion).toContain("contador,");
		expect(c.hiddenHistory.alergias).toBe("no soy alérgico a nada");
		expect(c.hiddenHistory.mecanismo).toMatch(/^un rival/);
		expect(c.truth).toEqual(rodilla.truth);
		expect(c.painZone).toEqual(rodilla.painZone);
		const prompt = buildPatientPrompt(buildPatientBrief(c, c.personality, ""));
		expect(prompt).toContain("Sos Martín, 33 años");
		expect(prompt).toContain("Sos varón");
		expect(prompt).not.toMatch(/alérgica|contadora|amigas/);
	});

	it("si viene una mujer, quedan los textos del caso", () => {
		if (!garganta) throw new Error("falta garganta-02");
		const c = withPatient(garganta, {
			avatar: "mujer-joven",
			name: "Sofía",
			age: 21,
			sex: "f",
		});
		expect(c.hiddenHistory).toEqual(garganta.hiddenHistory);
		expect(c.profile.estadoCivil).toBe("soltera");
	});

	it("sin sorteo (sesiones viejas), el caso queda igual", () => {
		if (!garganta) throw new Error("falta garganta-02");
		expect(withPatient(garganta, undefined)).toBe(garganta);
	});
});
