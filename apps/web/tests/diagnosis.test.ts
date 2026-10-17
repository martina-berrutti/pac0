// Devolución del diagnóstico y puntos a mejorar (lib/scoring/diagnosis.ts).
import { describe, expect, test } from "vitest";

import { caseBank } from "@/cases";
import type { ItemResult, Mistake } from "@/lib/contracts/report";
import type { Turn } from "@/lib/contracts/session";
import {
	diagnosisFeedback,
	improvementsFor,
	toldPatientMistake,
} from "@/lib/scoring/diagnosis";
import { reasoningScore } from "@/lib/scoring/evaluate";
import type { EvaluationInput } from "@/lib/scoring/types";

const byId = (id: string) => {
	const c = caseBank.find((x) => x.id === id);
	if (!c) throw new Error(`falta ${id}`);
	return c;
};
const media = byId("oido-02");
const mono = byId("garganta-03");

// Lista de cotejo con los ítems dados cumplidos y el resto no.
function items(caseId: string, done: string[]): ItemResult[] {
	return byId(caseId).expectedChecklist.map((i) => ({
		itemId: i.id,
		item: i.item,
		dimension: i.dimension,
		weight: i.weight,
		status: done.includes(i.id) ? "si" : "no",
		evidence: done.includes(i.id) ? [{ turnId: `t-${i.id}` }] : [],
	}));
}

const close = (hypothesis: string, differentials: string[] = []) => ({
	hypothesis,
	differentials,
});

function said(text: string): Turn {
	return {
		id: "t-dijo",
		sessionId: "s",
		speaker: "estudiante",
		text,
		startMs: 0,
		endMs: 0,
		overlap: false,
	};
}

describe("¿encontró el problema?", () => {
	test.each([
		["otitis media aguda derecha", "acertaste"],
		["Otitis media por el resfrío y la fiebre", "acertaste"],
		["otitis", "cerca"],
		["otitis externa", "otro_diagnostico"],
		["otitis media con efusión", "otro_diagnostico"],
		["gripe", "otro_diagnostico"],
		["", "sin_hipotesis"],
	])("Diego (otitis media): «%s» → %s", (hypothesis, result) => {
		const d = diagnosisFeedback(
			media,
			items("oido-02", []),
			hypothesis ? close(hypothesis) : null,
			[],
		);
		expect(d.result).toBe(result);
		expect(d.message).toContain(media.truth.diagnosis);
	});

	test("si plantea un diferencial, le dice qué los distingue", () => {
		const d = diagnosisFeedback(
			media,
			items("oido-02", []),
			close("otitis externa"),
			[],
		);
		expect(d.confusedWith?.differential).toBe("otitis externa");
		expect(d.message).toContain("duele al tocar la oreja");
	});

	test("la palabra principal de un diferencial alcanza («faringoamigdalitis»)", () => {
		const d = diagnosisFeedback(
			mono,
			items("garganta-03", []),
			close("faringoamigdalitis"),
			[],
		);
		expect(d.confusedWith?.differential).toBe(
			"faringoamigdalitis estreptocócica",
		);
	});

	test("lo que decide el juez con IA manda sobre el texto", () => {
		const d = diagnosisFeedback(
			mono,
			items("garganta-03", []),
			close("enfermedad por Epstein-Barr"),
			[],
			true,
		);
		expect(d.result).toBe("acertaste");
	});
});

describe("datos clave y diferenciales", () => {
	test("separa los datos que encontró de los que no, con evidencia", () => {
		const d = diagnosisFeedback(
			mono,
			items("garganta-03", ["cansancio", "medicacion"]),
			close("Mononucleosis por el cansancio de diez días", [
				"faringoamigdalitis estreptocócica",
			]),
			[],
		);
		expect(d.result).toBe("acertaste");
		expect(d.message).toContain("2 de 5 datos clave");
		const cansancio = d.cluesFound.find((k) => k.clue.includes("Cansancio"));
		expect(cansancio?.usedInClosing).toBe(true);
		expect(cansancio?.evidence).toEqual([{ turnId: "t-cansancio" }]);
		expect(
			d.cluesFound.find((k) => k.clue.includes("amoxicilina"))?.usedInClosing,
		).toBe(false);
		expect(d.cluesMissed.map((k) => k.clue)).toContain(
			"Ganglios dolorosos en el cuello",
		);
		expect(d.differentialsHit).toEqual(["faringoamigdalitis estreptocócica"]);
		expect(d.differentialsMissed).toEqual([
			{
				differential: "citomegalovirus",
				hint: mono.truth.differentialHints.citomegalovirus,
			},
		]);
	});
});

describe("lo que le dijo al paciente", () => {
	test("un diagnóstico equivocado es un error sin puntos", () => {
		const d = diagnosisFeedback(
			media,
			items("oido-02", []),
			close("otitis media aguda"),
			[said("Creo que tenés una otitis externa, te voy a dar gotas.")],
		);
		expect(d.toldPatient?.correct).toBe(false);
		const m = toldPatientMistake(media, d);
		expect(m?.tag).toBe("le-dijo-otro-diagnostico");
		expect(m?.critical).toBe(false);
		expect(m?.evidence[0]?.turnId).toBe("t-dijo");
	});

	test("decirlo bien no es error; preguntar o descartar no cuenta", () => {
		const ok = diagnosisFeedback(media, items("oido-02", []), null, [
			said("Lo que tenés es una otitis media, por eso la fiebre."),
		]);
		expect(ok.toldPatient?.correct).toBe(true);
		expect(toldPatientMistake(media, ok)).toBeNull();
		for (const text of [
			"¿Alguna vez te dijeron que tenías otitis externa?",
			"No es una otitis externa, porque el conducto está sano.",
		]) {
			const d = diagnosisFeedback(media, items("oido-02", []), null, [
				said(text),
			]);
			expect(d.toldPatient).toBeUndefined();
		}
	});
});

describe("puntos a mejorar", () => {
	const critical: Mistake = {
		tag: "examen-sin-consentimiento",
		what: "Examinaste sin pedir permiso.",
		why: "x",
		nextTime: "Pedí permiso antes de examinar.",
		critical: true,
		evidence: [],
	};

	test("primero lo crítico, después qué distingue el diagnóstico", () => {
		const d = diagnosisFeedback(
			media,
			items("oido-02", ["fiebre"]),
			close("otitis externa"),
			[],
		);
		const out = improvementsFor(media, d, [critical]);
		expect(out[0]).toBe("Pedí permiso antes de examinar.");
		expect(out[1]).toContain(
			"Repasá qué distingue otitis media aguda derecha de otitis externa",
		);
		expect(out.join(" ")).toContain("tímpano rojo y abombado");
		expect(out.length).toBeLessThanOrEqual(5);
	});

	test("si acertó, igual le marca lo que no buscó y que justifique", () => {
		const d = diagnosisFeedback(
			mono,
			items("garganta-03", ["cansancio"]),
			close("mononucleosis"),
			[],
		);
		const out = improvementsFor(mono, d, []);
		expect(out.some((x) => x.startsWith("Aunque acertaste"))).toBe(true);
		expect(out.some((x) => x.startsWith("Justificá"))).toBe(true);
	});
});

describe("razonamiento por caso", () => {
	const input = (hypothesis: string) =>
		({
			clinicalCase: media,
			session: { closing: close(hypothesis, []) },
		}) as unknown as EvaluationInput;

	test("en el oído, la conducta y la justificación son las del caso", () => {
		const good = reasoningScore(
			input(
				"Otitis media aguda por el tímpano abombado; antibiótico sin penicilina porque es alérgico",
			),
		);
		expect(good.parts?.justified).toBe(true);
		expect(good.parts?.studies).toBe(true);
		const bare = reasoningScore(input("otitis media"));
		expect(bare.parts?.studies).toBe(false);
		expect(good.score - bare.score).toBe(35);
	});
});
