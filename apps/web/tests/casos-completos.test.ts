// Una consulta completa por caso, de la primera pregunta al informe, con la
// herramienta propia de cada uno (plan.md, puerta 2). Corre sin clave: paciente
// y juez por reglas.
import { describe, expect, test, vi } from "vitest";

vi.mock("@google/genai", () => ({
	Modality: { AUDIO: "AUDIO" },
	GoogleGenAI: class {},
}));

import { caseBank } from "@/cases";
import { type Report, reportSchema } from "@/lib/contracts/report";
import { BP_STEPS } from "@/lib/patient/tools";
import { finishSession, sendTurn, startSession } from "@/server/consultation";
import { finishOtoscopy, startOtoscopy } from "@/server/otoscopy";
import { store } from "@/server/store";
import type { Viewer } from "@/server/token";
import { markReading, placeCuff } from "@/server/vitals";
import { runTool } from "@/server/voice";

let n = 0;
function student(): Viewer & { alias: string } {
	n += 1;
	return {
		uid: `gst_completa_${n}`,
		alias: `Estudiante ${n}`,
		careerYear: "3",
		guest: true,
		exp: Date.now() + 1e6,
	};
}

const byId = (id: string) => {
	const c = caseBank.find((x) => x.id === id);
	if (!c) throw new Error(`falta ${id}`);
	return c;
};

async function talk(viewer: Viewer, id: string, lines: string[]) {
	for (const line of lines) await sendTurn(viewer, id, line);
}

// Lo que tiene que cumplir cualquier informe: valida contra el contrato,
// trae la verdad del caso y cada ítem cumplido cita su evidencia.
function checkReport(report: Report, caseId: string) {
	expect(() => reportSchema.parse(report)).not.toThrow();
	expect(report.truth.diagnosis).toBe(byId(caseId).truth.diagnosis);
	expect(report.total).toBeGreaterThanOrEqual(0);
	expect(report.total).toBeLessThanOrEqual(100);
	for (const item of report.items.filter((i) => i.status === "si"))
		expect(item.evidence.length, item.itemId).toBeGreaterThan(0);
}

const status = (report: Report, itemId: string) =>
	report.items.find((i) => i.itemId === itemId)?.status;
const criticalTags = (report: Report) =>
	report.mistakes.filter((m) => m.critical).map((m) => m.tag);

describe("consulta completa por caso", () => {
	test("Lucía (garganta-03): anamnesis, orofaringe con permiso e informe", async () => {
		const ana = student();
		const id = await startSession(ana, "garganta-03", "caso");
		await talk(ana, id, [
			"Hola, soy Ana, estudiante de medicina. ¿Qué te trae por acá?",
			"¿Desde cuándo te duele?",
			"¿Tuviste fiebre?",
			"¿Sos alérgica a algún medicamento?",
		]);
		const { exam } = await sendTurn(
			ana,
			id,
			"Te voy a revisar la garganta, ¿puedo? Abrí bien grande y decí aaa.",
		);
		expect(exam?.action.variant).toBe("completa");

		const report = await finishSession(
			ana,
			id,
			"Mononucleosis infecciosa por el cansancio y los ganglios",
			["faringoamigdalitis estreptocócica"],
		);
		checkReport(report, "garganta-03");
		// Devolución del diagnóstico y puntos a mejorar.
		expect(report.diagnosis?.result).toBe("acertaste");
		expect(report.diagnosis?.cluesMissed.length).toBeGreaterThan(0);
		expect(report.improvements?.length).toBeGreaterThan(0);
		expect(status(report, "alergias")).toBe("si");
		expect(criticalTags(report)).toEqual([]);
	});

	test("Lucía (garganta-02): puede medir la presión y mirar el oído, y cada uno resta un punto", async () => {
		const ana = student();
		const id = await startSession(ana, "garganta-02", "caso");
		await talk(ana, id, [
			"Hola, soy Ana, estudiante de medicina. ¿Qué te trae por acá?",
			"¿Desde cuándo te duele? ¿Tuviste fiebre?",
		]);
		const throat = await runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "alta",
			consentimiento: true,
		});
		expect(throat.ui.kind).toBe("exam");

		// La presión: el tensiómetro abre igual y la lectura es la del caso.
		const bp = await runTool(ana, id, "medir_presion", {
			pasos_cumplidos: [...BP_STEPS],
		});
		if (bp.ui.kind !== "vitals") throw new Error("no abrió el tensiómetro");
		const reading = await placeCuff(
			ana,
			id,
			bp.ui.measurementId,
			"adecuado",
			false,
		);
		expect(reading.gauge).toEqual({ pas: 110, pad: 70 });
		await markReading(ana, id, bp.ui.measurementId, { pas: 110, pad: 70 });

		// El oído: el otoscopio abre y los dos oídos son normales.
		const ear = await runTool(ana, id, "examinar", {
			zona: "oído",
			claridad: "alta",
			consentimiento: true,
		});
		expect(ear.ui.kind).toBe("otoscope");
		const { actionId, appearance } = await startOtoscopy(ana, id, "derecho");
		expect(appearance).toEqual({ canal: "sano", tympanum: "nacarado" });
		await finishOtoscopy(ana, id, actionId, {
			hand: "derecha",
			prep: ["higiene", "inspeccion-externa", "verificar-luz"],
			speculum: "adulto",
			traction: "arriba-atras",
			roughInsertions: 0,
			maxDepth: 0.5,
			canalMs: 3000,
			tympanumMs: 2000,
		});

		const report = await finishSession(ana, id, "faringitis viral", []);
		checkReport(report, "garganta-02");
		expect(report.diagnosis?.result).toBe("acertaste");
		expect(report.diagnosis?.differentialsMissed.length).toBe(3);
		const tags = report.mistakes.map((m) => m.tag);
		expect(tags).toContain("examen-no-indicado-presion");
		expect(tags).toContain("examen-no-indicado-oido");
		expect(tags).not.toContain("examen-no-indicado-orofaringe");
	});

	test("Diego (oido-01): pedir permiso por voz abre el otoscopio y la otoscopia entra al informe", async () => {
		const ana = student();
		const id = await startSession(ana, "oido-01", "caso");
		await talk(ana, id, [
			"Hola Diego, soy Ana, estudiante. ¿Qué te pasa?",
			"¿Desde cuándo te duele el oído? ¿Te metiste al agua?",
			"¿Te sale algo del oído? ¿Tuviste fiebre?",
		]);
		const before = (await store.getSession(id))?.state.confianza ?? 0;
		const run = await runTool(ana, id, "examinar", {
			zona: "oído derecho",
			claridad: "alta",
			consentimiento: true,
		});
		expect(run.ui.kind).toBe("otoscope");
		// El permiso cuenta igual que en la garganta: queda registrado y sube la confianza.
		const after = await store.getSession(id);
		expect(after?.consentGiven).toBe(true);
		expect(after?.state.confianza).toBeGreaterThan(before);
		expect(
			(await store.listEvents(id)).filter((e) => e.type === "consentimiento"),
		).toHaveLength(1);

		const { actionId, appearance } = await startOtoscopy(ana, id, "derecho");
		expect(appearance.canal).toBe("secrecion");
		await finishOtoscopy(ana, id, actionId, {
			hand: "derecha",
			prep: ["higiene", "inspeccion-externa", "verificar-luz"],
			speculum: "adulto",
			traction: "arriba-atras",
			roughInsertions: 0,
			maxDepth: 0.5,
			canalMs: 3000,
			tympanumMs: 2000,
		});

		const report = await finishSession(ana, id, "otitis externa", [
			"otitis media aguda",
		]);
		checkReport(report, "oido-01");
		expect(status(report, "otoscopia")).not.toBe("no");
		expect(criticalTags(report)).toEqual([]);
	});

	test("Lucía hostil (garganta-02): se niega sin permiso; explicando y pidiendo permiso, abre", async () => {
		const ana = student();
		const id = await startSession(ana, "garganta-02", "hostil");
		await talk(ana, id, [
			"Buenas, soy Ana, estudiante. ¿Qué te trae?",
			"Entiendo que estés molesta por la espera. ¿Desde cuándo te duele la garganta?",
		]);
		const refused = await runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "alta",
			consentimiento: false,
		});
		expect(refused.output.variante).toBe("negado");

		const { exam } = await sendTurn(
			ana,
			id,
			"Te explico: quiero mirarte la garganta con una luz para ver si está inflamada. ¿Me das permiso? Abrí bien grande y decí aaa.",
		);
		expect(exam).not.toBeNull();
		expect(exam?.action.variant).not.toBe("negado");

		const report = await finishSession(ana, id, "faringitis viral", [
			"faringoamigdalitis estreptocócica",
		]);
		checkReport(report, "garganta-02");
		expect(criticalTags(report)).not.toContain("examen-sin-consentimiento");
		expect(
			report.mistakes.some((m) => m.tag.startsWith("examen-no-indicado")),
		).toBe(false);
	});
});
