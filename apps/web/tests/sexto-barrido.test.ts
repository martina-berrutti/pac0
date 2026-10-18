import { describe, expect, test } from "vitest";

import { findCase } from "@/cases";
import { toSummary } from "@/cases/schema";
import { asksForTemperature, asksWherePain } from "@/lib/exam/end-intent";
import { buildPatientBrief } from "@/lib/patient/brief";
import { asksConsent, namesOtherZone } from "@/lib/patient/exam-instruction";
import { generateCase } from "@/lib/patient/generator";
import { ruleRespond } from "@/lib/patient/rule-responder";
import { startSession } from "@/server/consultation";
import { locatePain } from "@/server/pain";
import type { Viewer } from "@/server/token";
import { runTool } from "@/server/voice";

let n = 0;
function student(): Viewer & { alias: string } {
	n += 1;
	return {
		uid: `gst_sexto_${n}`,
		alias: `Estudiante ${n}`,
		careerYear: "3",
		guest: true,
		exp: Date.now() + 1e6,
	};
}

const valeria = findCase("rodilla-01");
if (!valeria) throw new Error("falta rodilla-01");

describe("rodilla: la zona del dolor no viaja al navegador", () => {
	test("el resumen del caso no trae la zona, solo que se puede localizar", () => {
		const summary = toSummary(valeria);
		expect(summary.hasPainZone).toBe(true);
		expect(JSON.stringify(summary)).not.toContain("interlinea");
	});

	test("la pista la da el servidor", async () => {
		const ana = student();
		const id = await startSession(ana, "rodilla-01", "caso");
		const miss = await locatePain(ana, id, "izquierda", "rotula");
		expect(miss.found).toBe(false);
		expect(miss.hint).toContain("otra rodilla");
		const hit = await locatePain(ana, id, "derecha", "interlinea-interna");
		expect(hit.found).toBe(true);
	});

	test("examinar la rodilla por voz abre el panel, no 'no se puede'", async () => {
		const ana = student();
		const id = await startSession(ana, "rodilla-01", "caso");
		const r = await runTool(ana, id, "examinar", {
			zona: "rodilla",
			claridad: "media",
			consentimiento: true,
		});
		expect(r.ui).toMatchObject({ kind: "region", available: true });
		expect(r.output.disponible).toBe(true);
	});
});

describe("paciente sin IA: historia de la rodilla", () => {
	const brief = buildPatientBrief(valeria, valeria.personality, "");
	const state = { confianza: 0.9, ansiedad: 0.3, dolor: 0.5, paciencia: 0.7 };
	test.each([
		["¿Cómo te lastimaste?", "mecanismo"],
		["¿Se te hinchó?", "hinchazon"],
		["¿Se te traba la rodilla?", "bloqueo"],
		["¿Podés apoyar el pie y caminar?", "apoyo"],
		["¿Hacés algún deporte?", "deporte"],
		["¿De qué trabajás?", "ocupacion"],
	])("%s responde desde %s", (q, key) => {
		const fact = brief.history[key] ?? brief.profile[key];
		expect(ruleRespond(brief, state, q, 2).text).toContain(fact);
	});
});

describe("generador de rodilla", () => {
	test("con ajustes que alejan del arquetipo, la sesión usa la del caso", async () => {
		const r = await generateCase({
			text: "paciente enojada con dolor de rodilla que no hable mucho",
		});
		expect(r.personalityKey).toBe("caso");
		expect(r.clinicalCase.personality.locuacidad).toBeLessThan(0.3);
	});

	test("el colateral (un golpe) no sale corriendo", async () => {
		for (let i = 0; i < 40; i++) {
			const seed = i / 40;
			const { clinicalCase } = await generateCase(
				{ text: "esguince de rodilla, colateral" },
				() => seed,
			);
			expect(JSON.stringify(clinicalCase.hiddenHistory)).not.toContain(
				"corriendo",
			);
		}
	});
});

describe("temperatura por texto", () => {
	test.each([
		["¿Llegaste a medir la fiebre en tu casa?", false],
		["¿Pudiste medirte la fiebre?", false],
		["¿Llegaste a tomar algo para la fiebre?", false],
		["Podés tomar paracetamol si tenés fiebre", false],
		["Te tomo la temperatura", true],
		["¿Querés que te tome la temperatura?", true],
		["¿Te puedo tomar la temperatura?", true],
		["¿Me dejás ponerte el termómetro?", true],
		["¿Me dejás tomarte la temperatura?", true],
		["Vamos a controlar la fiebre con paracetamol", false],
		["Quiero controlar la fiebre con ibuprofeno", false],
	])("%s", (text, expected) => {
		expect(asksForTemperature(text)).toBe(expected);
	});

	test.each([
		"¿Te puedo tomar la temperatura?",
		"¿Me dejás ponerte el termómetro?",
	])("pedir permiso para la temperatura es consentimiento: %s", (text) => {
		expect(asksConsent(text)).toBe(true);
	});
});

describe("otros detectores", () => {
	test("'¿dónde vivís? ¿te duele mucho?' no abre el panel del dolor", () => {
		expect(asksWherePain("¿Dónde vivís? ¿Te duele mucho?")).toBe(false);
		expect(asksWherePain("¿Dónde te duele?")).toBe(true);
	});

	test("'te reviso la rodilla' no es un examen de garganta", () => {
		expect(namesOtherZone("Te reviso la rodilla")).toBe(true);
	});
});
