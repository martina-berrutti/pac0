// Lo que el estudiante dice en la consulta sobre qué tiene el paciente se
// registra, suma al razonamiento y se compara con lo que escribe al cerrar
// (lib/scoring/diagnosis.ts).
import { describe, expect, test } from "vitest";

import type { Session, Turn } from "@/lib/contracts/session";
import { spokenDiagnoses } from "@/lib/scoring/diagnosis";
import { evaluate } from "@/lib/scoring/evaluate";
import type { EvaluationInput } from "@/lib/scoring/types";

import { lucia } from "./helpers";

let n = 0;
function consulta(
	said: string[],
	hypothesis: string,
	differentials: string[] = [],
): EvaluationInput {
	const turns: Turn[] = said.map((text, i) => {
		n += 1;
		return {
			id: `d${n}`,
			sessionId: "s1",
			speaker: "estudiante",
			text,
			startMs: i * 5000,
			endMs: i * 5000,
			overlap: false,
		};
	});
	const session: Session = {
		id: "s1",
		userId: "u1",
		caseId: lucia.id,
		alias: "Prueba",
		personalityKey: "caso",
		personality: lucia.personality,
		state: { confianza: 0.9, ansiedad: 0.3, dolor: 0.5, paciencia: 0.7 },
		status: "evaluada",
		startedAt: 0,
		endedAt: 1,
		closing: { hypothesis, differentials },
		consentGiven: false,
		historyOverrides: {},
		inventedFacts: {},
		voiceUsage: null,
	};
	return {
		clinicalCase: lucia,
		session,
		turns,
		events: [],
		examActions: [],
		vitals: [],
	};
}

const interview = [
	"Hola, soy Ana, estudiante. ¿Qué te trae por acá?",
	"¿Tenés mocos o tos?",
];

describe("lo que dice en la consulta sobre el diagnóstico", () => {
	test("se registra cada frase: correcto, diferencial u otro; las preguntas no", () => {
		const spoken = spokenDiagnoses(lucia, [
			...consulta(
				[
					"¿Te dijeron alguna vez que era una faringitis viral?",
					"Creo que tenés un poco de fiebre.",
					"Podría ser una gripe. Creo que es una angina.",
					"Lo que tenés es una faringitis viral, un resfrío.",
				],
				"x",
			).turns,
		]);
		expect(spoken.map((s) => s.verdict)).toEqual([
			"diferencial",
			"otro",
			"correcto",
		]);
		expect(spoken[0]?.differential).toBe("gripe");
		expect(spoken[2]?.quote).toContain("faringitis viral");
	});

	test("si dice y escribe lo mismo, no hay aviso", () => {
		const d = evaluate(
			consulta(
				[...interview, "Creo que es una faringitis viral, un resfrío común."],
				"faringitis viral por los mocos",
			),
		).diagnosis;
		expect(d?.spoken?.[0]?.verdict).toBe("correcto");
		expect(d?.mismatch).toBeUndefined();
	});

	test("lo dijo bien en voz alta pero escribió otro: aviso y media hipótesis", () => {
		const con = evaluate(
			consulta(
				[...interview, "Creo que es una faringitis viral."],
				"angina bacteriana",
			),
		);
		const sin = evaluate(consulta(interview, "angina bacteriana"));
		expect(con.diagnosis?.mismatch?.message).toContain(
			"Lo que dijiste en voz alta era lo correcto",
		);
		expect(con.diagnosis?.mismatch?.written).toBe("angina bacteriana");
		// Media hipótesis: 20 de 40 (menos los 5 de saltar al diagnóstico con
		// poca entrevista, que restan en las dos).
		expect(con.scores.razonamiento).toBe(15);
		expect(sin.scores.razonamiento).toBe(0);
		expect(con.mistakes.some((m) => m.what.includes("vale la mitad"))).toBe(
			true,
		);
		expect(con.improvements?.join(" ")).toContain("coincidan");
	});

	test("le dijo otra cosa al paciente y escribió bien: aviso de que al paciente le quedó otra idea", () => {
		const report = evaluate(
			consulta(
				[...interview, "Creo que es una angina."],
				"faringitis viral por los mocos y la tos",
			),
		);
		expect(report.diagnosis?.spoken?.[0]?.verdict).toBe("otro");
		expect(report.diagnosis?.mismatch?.message).toContain(
			"Lo escrito era lo correcto",
		);
	});

	test("los diferenciales dichos en voz alta suman aunque no los escriba", () => {
		const dicho = evaluate(
			consulta(
				[...interview, "Podría ser una gripe o una rinitis alérgica."],
				"faringitis viral",
			),
		);
		const callado = evaluate(consulta(interview, "faringitis viral"));
		expect(dicho.scores.razonamiento).toBeGreaterThan(
			callado.scores.razonamiento,
		);
		expect(
			dicho.diagnosis?.differentialsMissed.map((x) => x.differential),
		).not.toContain("gripe");
	});
});
