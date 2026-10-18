import { describe, expect, test } from "vitest";

import { caseBank, findCase } from "@/cases";
import { toSummary } from "@/cases/schema";
import { otoscopyScenario } from "@/lib/exam/otoscope";
import { buildPatientBrief, buildPatientPrompt } from "@/lib/patient/brief";
import { generateCase } from "@/lib/patient/generator";
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
	const c = findCase(id);
	if (!c) throw new Error(`falta ${id}`);
	return c;
};

describe("banco de casos", () => {
	test("solo Lucía, con dos problemas, sin revisar y con sexo para la voz", () => {
		// Diego salió del banco (no hay avatar varón), pero sus casos se siguen
		// encontrando por id para las consultas viejas.
		expect(caseBank.map((c) => c.id)).toEqual(["garganta-02", "garganta-03"]);
		expect(findCase("oido-01")?.patient.name).toBe("Diego");
		for (const [group, name] of [["lucia", "Lucía"]]) {
			const problems = caseBank.filter((c) => c.group === group);
			expect(problems.map((c) => c.problem)).toEqual([
				"Problema 1",
				"Problema 2",
			]);
			expect(new Set(problems.map((c) => c.patient.name))).toEqual(
				new Set([name]),
			);
			expect(new Set(problems.map((c) => c.truth.diagnosis)).size).toBe(2);
		}
		for (const c of caseBank) {
			expect(c.reviewedBy).toBeNull();
			expect(c.patient.sex).toMatch(/^[fm]$/);
			expect(c.relevantExams.length).toBeGreaterThan(0);
		}
	});

	test("lo que ve el navegador para elegir no dice el diagnóstico", () => {
		for (const c of caseBank) {
			const summary = JSON.stringify(toSummary(c)).toLowerCase();
			expect(summary).toContain(c.problem?.toLowerCase());
			for (const word of [c.truth.diagnosis, ...c.truth.acceptable])
				expect(summary).not.toContain(word.toLowerCase());
		}
	});

	test.each(caseBank.map((c) => [c.id] as const))(
		"%s: se puede examinar la garganta, el oído y la presión",
		async (caseId) => {
			const ana = viewer(`gst_cases_todo_${caseId}`);
			const id = await startSession(ana, caseId, "caso");
			const exam = (zona: string) =>
				runTool(ana, id, "examinar", {
					zona,
					claridad: "alta",
					consentimiento: true,
				});
			expect((await exam("garganta")).ui.kind).toBe("exam");
			expect((await exam("oído")).ui.kind).toBe("otoscope");
			const bp = await runTool(ana, id, "medir_presion", {
				pasos_cumplidos: [],
			});
			expect(bp.ui.kind).toBe("vitals");
		},
	);

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

	test("Diego: oído derecho con secreción, izquierdo normal; se califica la otoscopia", () => {
		const diego = byId("oido-01");
		const { appearance } = otoscopyScenario(diego.id, diego.patient.age);
		expect(appearance.derecho.canal).toBe("secrecion");
		expect(appearance.izquierdo.canal).toBe("sano");
		expect(diego.expectedChecklist.some((i) => i.id === "otoscopia")).toBe(
			true,
		);
	});

	test("Diego, problema 2: tímpano derecho abombado, izquierdo normal", () => {
		const ear = (id: string) =>
			otoscopyScenario(id, byId(id).patient.age).appearance;
		expect(ear("oido-02").derecho).toEqual({
			canal: "sano",
			tympanum: "abombado",
		});
		expect(ear("oido-02").izquierdo.tympanum).toBe("nacarado");
	});

	test("por voz: pedir revisar el oído abre el otoscopio (también a Lucía)", async () => {
		const ana = viewer("gst_cases_oido");
		const id = await startSession(ana, "garganta-02", "caso");
		const run = await runTool(ana, id, "examinar", {
			zona: "oído derecho",
			claridad: "alta",
			consentimiento: true,
		});
		expect(run.ui.kind).toBe("otoscope");
		expect(run.output.disponible).toBe(true);
	});

	test("con personalidad hostil, no abre la boca sin permiso", async () => {
		const ana = viewer("gst_cases_hostil");
		const id = await startSession(ana, "garganta-02", "hostil");
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
			otoscopyScenario(
				clinicalCase.templateId ?? clinicalCase.id,
				clinicalCase.patient.age,
			).appearance.derecho.canal,
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
