import { describe, expect, test } from "vitest";

import { caseBank } from "@/cases";
import { armFor, measure } from "@/lib/exam/blood-pressure";
import { otoscopyScenario } from "@/lib/exam/otoscope";
import { buildPatientBrief, buildPatientPrompt } from "@/lib/patient/brief";
import { generateCase } from "@/lib/patient/generator";
import { BP_STEPS } from "@/lib/patient/tools";
import { startSession } from "@/server/consultation";
import type { Viewer } from "@/server/token";
import { runTool } from "@/server/voice";

const viewer = (uid: string): Viewer & { alias: string } => ({
	uid,
	alias: "Ana",
	careerYear: "3",
	guest: true,
	exp: Date.now() + 1e6,
});
const byId = (id: string) => {
	const c = caseBank.find((x) => x.id === id);
	if (!c) throw new Error(`falta ${id}`);
	return c;
};

describe("banco de casos", () => {
	test("hay cuatro casos, todos sin revisar y con sexo para la voz", () => {
		expect(caseBank.map((c) => c.id)).toEqual([
			"garganta-01",
			"hipertension-01",
			"oido-01",
			"garganta-02",
		]);
		for (const c of caseBank) {
			expect(c.reviewedBy).toBeNull();
			expect(c.patient.sex).toMatch(/^[fm]$/);
		}
	});

	test.each(caseBank.map((c) => [c.id, c] as const))(
		"%s: el paciente no recibe el diagnóstico",
		(_, c) => {
			const prompt = buildPatientPrompt(
				buildPatientBrief(c, c.personality, c.personalityStyle ?? ""),
			);
			expect(prompt).not.toContain(c.truth.diagnosis);
			for (const d of c.truth.differentials) expect(prompt).not.toContain(d);
		},
	);

	test("Rosa: sin reposo ni silencio, la presión da más alta que la real", () => {
		const rosa = byId("hipertension-01");
		const arm = armFor(rosa.id);
		const sinPreparar = measure(rosa.vitals.pa, [], null, arm);
		const bienPreparada = measure(
			rosa.vitals.pa,
			[...BP_STEPS],
			{ size: "grande", overClothes: false },
			arm,
		);
		// Brazo grande (35 cm): con el manguito grande y bien preparada, el valor real.
		expect(bienPreparada.shown).toEqual({ pas: 136, pad: 86 });
		expect(sinPreparar.shown.pas).toBeGreaterThan(150);
		// Con el manguito común le queda chico: da más alto.
		const chico = measure(
			rosa.vitals.pa,
			[...BP_STEPS],
			{ size: "adecuado", overClothes: false },
			arm,
		);
		expect(chico.techniqueErrors).toContain("manguito-chico");
		expect(
			rosa.expectedChecklist.some((i) => i.id === "presion-arterial"),
		).toBe(true);
	});

	test("Diego: oído derecho con secreción, izquierdo normal; se califica la otoscopia", () => {
		const diego = byId("oido-01");
		const { appearance } = otoscopyScenario(diego.id, diego.patient.age);
		expect(appearance.derecho.canal).toBe("secrecion");
		expect(appearance.izquierdo.canal).toBe("sano");
		expect(diego.expectedChecklist.some((i) => i.id === "otoscopia")).toBe(
			true,
		);
	});

	test("Diego por voz: pedir revisar el oído abre el otoscopio", async () => {
		const ana = viewer("gst_cases_diego");
		const id = await startSession(ana, "oido-01", "caso");
		const run = await runTool(ana, id, "examinar", {
			zona: "oído derecho",
			claridad: "alta",
			consentimiento: true,
		});
		expect(run.ui.kind).toBe("otoscope");
		expect(run.output.disponible).toBe(true);
	});

	test("Jorge: hostil, no abre la boca sin permiso", async () => {
		const ana = viewer("gst_cases_jorge");
		const id = await startSession(ana, "garganta-02", "caso");
		const run = await runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "alta",
			consentimiento: false,
		});
		expect(run.output.variante).toBe("negado");
	});
});

describe("generador con las plantillas nuevas", () => {
	test("dolor de oído: otitis externa, con otoscopio y lista propia", async () => {
		const { clinicalCase } = await generateCase({
			text: "dame un paciente con dolor de oído",
		});
		expect(clinicalCase.truth.diagnosis).toBe("otitis externa aguda derecha");
		expect(
			clinicalCase.expectedChecklist.some((i) => i.id === "otoscopia"),
		).toBe(true);
		expect(
			otoscopyScenario(clinicalCase.id, clinicalCase.patient.age).appearance
				.derecho.canal,
		).toBe("secrecion");
	});

	test("presión: hipertensión con 45 años o más", async () => {
		for (let i = 0; i < 5; i++) {
			const { clinicalCase } = await generateCase({
				text: "un paciente para control de presión",
			});
			expect(clinicalCase.truth.diagnosis).toContain("hipertensión");
			expect(clinicalCase.patient.age).toBeGreaterThanOrEqual(45);
		}
	});
});
