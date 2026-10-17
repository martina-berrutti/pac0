// Penalizaciones, errores críticos y confianza (plan.md, sección 8).
import { describe, expect, test } from "vitest";

import { caseBank } from "@/cases";
import type { ClinicalCase } from "@/cases/schema";
import type { Turn } from "@/lib/contracts/session";
import { evaluate } from "@/lib/scoring/evaluate";
import type { EvaluationInput } from "@/lib/scoring/types";

import { averageStudent, badStudent, goodStudent } from "./helpers";

const jorge = caseBank.find((c) => c.id === "garganta-02") as ClinicalCase;

function say(
	id: string,
	speaker: Turn["speaker"],
	text: string,
	startMs: number,
): Turn {
	return {
		id,
		sessionId: "s1",
		speaker,
		text,
		startMs,
		endMs: startMs,
		overlap: false,
	};
}

// El buen estudiante con turnos agregados.
function goodWith(...extra: Turn[]): EvaluationInput {
	const input = goodStudent();
	return { ...input, turns: [...input.turns, ...extra] };
}

const tags = (input: EvaluationInput) =>
	evaluate(input).mistakes.map((m) => m.tag);

describe("penalizaciones", () => {
	test("jerga sin explicar resta 1 de comunicación", () => {
		const base = evaluate(goodStudent());
		const report = evaluate(
			goodWith(say("j1", "estudiante", "¿Tenés odinofagia?", 125_000)),
		);
		expect(report.mistakes.find((m) => m.tag === "jerga")?.evidence).toEqual([
			{ turnId: "j1", quote: "¿Tenés odinofagia?" },
		]);
		expect(report.scores.comunicacion).toBe(base.scores.comunicacion - 1);
	});

	test("jerga explicada o al describir un hallazgo no resta", () => {
		expect(
			tags(
				goodWith(
					say(
						"j1",
						"estudiante",
						"¿Tenés odinofagia, o sea, dolor al tragar?",
						125_000,
					),
				),
			),
		).not.toContain("jerga");
		// "Veo las amígdalas rojas con exudado" ya está en el buen estudiante.
		expect(tags(goodStudent())).not.toContain("jerga");
	});

	test("ignorar una pista emocional resta 3 de comunicación", () => {
		const base = evaluate(goodStudent());
		const report = evaluate(
			goodWith(
				say("p1", "paciente", "Tengo miedo de que sea algo grave.", 125_000),
				say("e1", "estudiante", "¿Tomás algún remedio?", 126_000),
			),
		);
		const m = report.mistakes.find((x) => x.tag === "ignora-pista");
		expect(m?.evidence[0]?.turnId).toBe("e1");
		expect(report.scores.comunicacion).toBe(base.scores.comunicacion - 3);
	});

	test("recoger la pista no resta", () => {
		expect(
			tags(
				goodWith(
					say("p1", "paciente", "Tengo miedo de que sea algo grave.", 125_000),
					say("e1", "estudiante", "Entiendo, vamos a ver qué es.", 126_000),
				),
			),
		).not.toContain("ignora-pista");
	});

	test("saltar al diagnóstico sin examinar resta 5 de razonamiento", () => {
		const input = { ...goodStudent(), examActions: [] };
		const report = evaluate(input);
		const m = report.mistakes.find((x) => x.tag === "salta-al-diagnostico");
		expect(m?.what).toContain("sin examinar");
		expect(tags(goodStudent())).not.toContain("salta-al-diagnostico");
	});

	test("saltar al diagnóstico con poca anamnesis", () => {
		const input = goodStudent();
		const report = evaluate({ ...input, turns: input.turns.slice(10) });
		expect(
			report.mistakes.find((x) => x.tag === "salta-al-diagnostico")?.what,
		).toContain("con poca anamnesis");
	});
});

describe("errores críticos", () => {
	test("presionar después de una negativa", () => {
		const report = evaluate(
			goodWith(
				say("p1", "paciente", "No quiero que me mires la garganta.", 125_000),
				say("e1", "estudiante", "Tenés que abrir la boca, dale.", 126_000),
			),
		);
		const m = report.mistakes.find((x) => x.tag === "insiste-contra-negativa");
		expect(m?.critical).toBe(true);
		expect(m?.evidence[0]?.turnId).toBe("e1");
		expect(report.verdict).not.toBe("lo_hiciste_bien");
	});

	test("explicar y pedir permiso después de la negativa no es insistir", () => {
		expect(
			tags(
				goodWith(
					say("p1", "paciente", "No quiero que me mires la garganta.", 125_000),
					say(
						"e1",
						"estudiante",
						"Entiendo. Es para ver las amígdalas, ¿puedo?",
						126_000,
					),
				),
			),
		).not.toContain("insiste-contra-negativa");
	});

	test("volver a pedir el examen sin resolver la negativa", () => {
		const input = goodStudent();
		const negado = {
			id: "n1",
			sessionId: "s1",
			zone: "orofaringe",
			maneuver: "inspeccion",
			clarity: "alta" as const,
			variant: "negado" as const,
			hotspotTimesMs: {},
			startMs: 125_000,
			endMs: 125_000,
		};
		const report = evaluate({
			...input,
			turns: [
				...input.turns,
				say("e1", "estudiante", "Abrí la boca.", 126_000),
			],
			examActions: [
				...input.examActions,
				negado,
				{ ...negado, id: "n2", startMs: 127_000, endMs: 127_000 },
			],
		});
		const m = report.mistakes.find((x) => x.tag === "insiste-contra-negativa");
		expect(m?.evidence).toEqual([{ examActionId: "n2" }]);
	});

	test("omitir los signos de alarma del caso", () => {
		const input = goodStudent();
		const withAlarm: ClinicalCase = {
			...input.clinicalCase,
			expectedChecklist: [
				...input.clinicalCase.expectedChecklist,
				{
					id: "sintomas-alarma",
					item: "pregunta por signos de alarma (falta de aire, babeo)",
					dimension: "anamnesis",
					weight: 3,
					keywords: ["falta de aire", "respirar"],
				},
			],
		};
		const report = evaluate({ ...input, clinicalCase: withAlarm });
		const alarm = report.mistakes.filter((m) => m.tag.includes("alarma"));
		expect(alarm).toHaveLength(1);
		expect(alarm[0]?.critical).toBe(true);
		expect(report.verdict).not.toBe("lo_hiciste_bien");

		const asked = evaluate({
			...input,
			clinicalCase: withAlarm,
			turns: [
				...input.turns,
				say("e1", "estudiante", "¿Te cuesta respirar?", 125_000),
			],
		});
		expect(asked.mistakes.some((m) => m.tag.includes("alarma"))).toBe(false);
	});

	test("trato irrespetuoso", () => {
		const report = evaluate(
			goodWith(say("e1", "estudiante", "Dejá de llorar, no es nada.", 125_000)),
		);
		const m = report.mistakes.find((x) => x.tag === "trato-irrespetuoso");
		expect(m?.critical).toBe(true);
		expect(m?.evidence[0]?.quote).toBe("Dejá de llorar, no es nada.");
	});

	test("el buen estudiante no tiene errores críticos", () => {
		expect(evaluate(goodStudent()).mistakes.filter((m) => m.critical)).toEqual(
			[],
		);
	});
});

describe("confianza de un paciente difícil", () => {
	function withJorge(confianza: number): EvaluationInput {
		const input = goodStudent();
		return {
			...input,
			session: {
				...input.session,
				personality: jorge.personality,
				state: { ...input.session.state, confianza },
			},
		};
	}

	test("subirla suma a comunicación y aparece entre lo que hiciste bien", () => {
		// Jorge empieza con 1 - 0,8 = 20% de confianza.
		const low = evaluate(withJorge(0.25));
		const high = evaluate(withJorge(0.6));
		expect(high.strengths[0]?.text).toContain("de 20% a 60%");
		expect(high.strengths).toHaveLength(3);
		expect(high.scores.comunicacion).toBe(
			Math.min(100, low.scores.comunicacion + 5),
		);
		expect(low.strengths[0]?.text).not.toContain("confianza");
	});

	test("con un paciente colaborador no suma", () => {
		const report = evaluate(goodStudent());
		expect(report.strengths.some((s) => s.text.includes("confianza"))).toBe(
			false,
		);
	});
});

describe("fuente de cada error", () => {
	test("todos los errores nombran su fuente", () => {
		for (const input of [goodStudent(), badStudent()]) {
			for (const m of evaluate(input).mistakes) {
				expect(m.source, m.tag).toBeTruthy();
			}
		}
		const consent = evaluate(badStudent()).mistakes.find(
			(m) => m.tag === "examen-sin-consentimiento",
		);
		expect(consent?.source).toContain("examen físico general");
	});
});

describe("describir lo que vio", () => {
	const SAID = "Veo las amígdalas rojas con exudado.";
	function describing(text: string | null): EvaluationInput {
		const input = goodStudent();
		const turns = input.turns.filter((t) => t.text !== SAID);
		const at = input.turns.find((t) => t.text === SAID)?.startMs ?? 0;
		return {
			...input,
			turns: text ? [...turns, say("d1", "estudiante", text, at)] : turns,
		};
	}
	const item = (input: EvaluationInput) =>
		evaluate(input).items.find((i) => i.itemId === "describe-hallazgo");
	const mistake = (input: EvaluationInput) =>
		evaluate(input).mistakes.find((m) => m.tag === "describe-hallazgo");

	test("describirlo con las palabras del caso da el ítem", () => {
		expect(item(describing(SAID))?.status).toBe("si");
		expect(mistake(describing(SAID))).toBeUndefined();
	});

	test("ver sin describir da crédito parcial y muestra lo esperado", () => {
		const input = describing(null);
		expect(item(input)?.status).toBe("parcial");
		expect(item(input)?.evidence[0]?.examActionId).toBe("e1");
		expect(mistake(input)?.what).toContain("no dijiste qué viste");
		expect(mistake(input)?.what).toContain("exudado blanquecino");
	});

	test("negar el hallazgo no cuenta como describirlo", () => {
		const input = describing("No veo placas ni exudado.");
		expect(item(input)?.status).toBe("parcial");
	});

	test("sin apertura completa no hay crédito parcial", () => {
		const report = evaluate(averageStudent());
		expect(
			report.items.find((i) => i.itemId === "describe-hallazgo")?.status,
		).toBe("no");
		expect(
			report.mistakes.find((m) => m.tag === "describe-hallazgo")?.what,
		).not.toContain("Lo esperado");
	});
});
