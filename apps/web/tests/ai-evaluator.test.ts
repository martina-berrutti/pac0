import { describe, expect, test } from "vitest";
import type { z } from "zod";

import { reportSchema } from "@/lib/contracts/report";
import { evaluateWithAi } from "@/lib/scoring/ai-evaluate";
import type { JsonLlm } from "@/lib/scoring/ai-judge";
import { evaluate } from "@/lib/scoring/evaluate";
import { judgeItem } from "@/lib/scoring/rule-judge";
import type { EvaluationInput } from "@/lib/scoring/types";

import { averageStudent, badStudent, goodStudent } from "./helpers";

type Kind = "juez" | "verificador" | "razonamiento" | "redactor";
type Handlers = Partial<Record<Kind, (prompt: string) => unknown>>;

function kindOf(prompt: string): Kind {
	if (prompt.includes("primera lectura")) return "verificador";
	if (prompt.includes("Compará el cierre")) return "razonamiento";
	if (prompt.includes("devuelve feedback")) return "redactor";
	return "juez";
}

// Modelo falso: responde según el tipo de pedido y valida con el esquema,
// igual que completeJson.
function fakeLlm(handlers: Handlers) {
	const calls: Record<Kind, string[]> = {
		juez: [],
		verificador: [],
		razonamiento: [],
		redactor: [],
	};
	const llm: JsonLlm = async <T>(prompt: string, schema: z.ZodType<T>) => {
		const kind = kindOf(prompt);
		calls[kind].push(prompt);
		const handler = handlers[kind];
		if (!handler) throw new Error(`sin respuesta para ${kind}`);
		return schema.parse(handler(prompt));
	};
	return { llm, calls };
}

// Un modelo "honesto": juzga como las reglas y compara el cierre con la verdad.
function honest(input: EvaluationInput): Handlers {
	return {
		juez: () => ({
			items: input.clinicalCase.expectedChecklist.map((item) => {
				const r = judgeItem(item, input);
				return {
					itemId: r.itemId,
					status: r.status,
					turnIds: r.evidence.flatMap((e) => (e.turnId ? [e.turnId] : [])),
				};
			}),
		}),
		verificador: (p) => ({
			items: [...p.matchAll(/^- ([a-z-]+):/gm)].map((m) => ({
				itemId: m[1],
				status: "no",
			})),
		}),
		razonamiento: () => {
			const closing = input.session.closing;
			const hyp = closing?.hypothesis.toLowerCase() ?? "";
			const { truth } = input.clinicalCase;
			return {
				hipotesisCoincide: truth.acceptable.some((a) => hyp.includes(a)),
				diferencialesCubiertos: truth.differentials.filter((d) =>
					closing?.differentials.includes(d),
				),
				justificacion: ["fiebre", "exudado"].filter((w) => hyp.includes(w)),
				estudiosRazonables: hyp.includes("test"),
			};
		},
		redactor: () => ({ mistakes: [] }),
	};
}

function studentTurnIds(input: EvaluationInput) {
	return new Set(
		input.turns.filter((t) => t.speaker === "estudiante").map((t) => t.id),
	);
}

describe("evaluador con IA", () => {
	test("ordena bueno > mediocre > malo y el informe valida", async () => {
		const reports = await Promise.all(
			[goodStudent(), averageStudent(), badStudent()].map((input) =>
				evaluateWithAi(input, fakeLlm(honest(input)).llm),
			),
		);
		const [good, average, bad] = reports.map((r) => reportSchema.parse(r));
		expect(good?.judge).toBe("ia");
		expect(good?.verdict).toBe("lo_hiciste_bien");
		expect(good?.total).toBeGreaterThan(average?.total ?? 0);
		expect(average?.total).toBeGreaterThan(bad?.total ?? 0);
	});

	test("tres corridas con las mismas respuestas dan el mismo total", async () => {
		const input = goodStudent();
		const totals = await Promise.all(
			[1, 2, 3].map(
				async () =>
					(await evaluateWithAi(input, fakeLlm(honest(input)).llm)).total,
			),
		);
		expect(new Set(totals).size).toBe(1);
	});

	test("un turno inventado no cuenta como evidencia", async () => {
		const input = goodStudent();
		const { llm } = fakeLlm({
			...honest(input),
			juez: () => ({
				items: input.clinicalCase.expectedChecklist.map((i) => ({
					itemId: i.id,
					status: "si",
					turnIds: ["t-inventado"],
				})),
			}),
		});
		const report = await evaluateWithAi(input, llm);
		const real = studentTurnIds(input);
		for (const item of report.items) {
			if (item.status === "no") continue;
			const ids = item.evidence.flatMap((e) => (e.turnId ? [e.turnId] : []));
			for (const id of ids) expect(real.has(id)).toBe(true);
		}
		const alergias = report.items.find((i) => i.itemId === "alergias");
		expect(alergias?.status).toBe("no");
	});

	test("el verificador revisa un 'no' cuando el turno existe", async () => {
		const input = goodStudent();
		const { llm, calls } = fakeLlm({
			...honest(input),
			juez: () => ({
				items: input.clinicalCase.expectedChecklist.map((i) => ({
					itemId: i.id,
					status: "no",
				})),
			}),
			verificador: (p) => ({
				items: [...p.matchAll(/^- ([a-z-]+):/gm)].map((m) => ({
					itemId: m[1],
					status: "si",
				})),
			}),
		});
		const report = await evaluateWithAi(input, llm);
		expect(calls.verificador).toHaveLength(1);
		const alergias = report.items.find((i) => i.itemId === "alergias");
		expect(alergias?.status).toBe("si");
		expect(alergias?.evidence[0]?.quote).toContain("alérgica");
	});

	test("sin turno candidato, la omisión queda y no se re-pregunta", async () => {
		const input = badStudent();
		const { llm, calls } = fakeLlm({
			...honest(input),
			juez: () => ({
				items: input.clinicalCase.expectedChecklist.map((i) => ({
					itemId: i.id,
					status: "no",
				})),
			}),
		});
		const report = await evaluateWithAi(input, llm);
		expect(calls.verificador).toHaveLength(0);
		expect(report.mistakes.some((m) => m.tag === "alergias")).toBe(true);
	});

	test("una justificación que no está en el cierre no suma", async () => {
		const input = goodStudent();
		const base = await evaluateWithAi(input, fakeLlm(honest(input)).llm);
		const { llm } = fakeLlm({
			...honest(input),
			razonamiento: () => ({
				hipotesisCoincide: true,
				diferencialesCubiertos: ["viral", "estreptocócica", "mononucleosis"],
				justificacion: ["dolor de cabeza intenso"],
				estudiosRazonables: true,
			}),
		});
		const invented = await evaluateWithAi(input, llm);
		expect(invented.scores.razonamiento).toBe(base.scores.razonamiento - 20);
	});

	test("el redactor cambia el texto pero no qué pasó ni lo crítico", async () => {
		const input = badStudent();
		const plain = evaluate(input);
		const { llm } = fakeLlm({
			...honest(input),
			redactor: () => ({
				mistakes: plain.mistakes.map((_, index) => ({
					index,
					why: "Porque sí.",
					nextTime: "Probá así.",
				})),
			}),
		});
		const report = await evaluateWithAi(input, llm);
		expect(report.mistakes.map((m) => [m.tag, m.what, m.critical])).toEqual(
			plain.mistakes.map((m) => [m.tag, m.what, m.critical]),
		);
		expect(report.mistakes.every((m) => m.why === "Porque sí.")).toBe(true);
	});

	test("si el modelo falla, sale con el juez por reglas", async () => {
		const input = averageStudent();
		const report = await evaluateWithAi(input, async () => {
			throw new Error("sin red");
		});
		const rules = evaluate(input);
		expect(report.judge).toBe("reglas");
		expect({ ...report, createdAt: 0 }).toEqual({ ...rules, createdAt: 0 });
	});
});

describe("extractor", () => {
	test("examinar antes del consentimiento es error crítico", () => {
		const input = goodStudent();
		input.events = [
			{ id: "c1", sessionId: "s1", type: "consentimiento", atMs: 200_000 },
		];
		const report = evaluate(input);
		expect(
			report.mistakes.some(
				(m) => m.critical && m.tag === "examen-sin-consentimiento",
			),
		).toBe(true);
	});
});

describe("evaluador con IA: fuente y descripción", () => {
	test("el redactor recibe la fuente de cada error", async () => {
		const input = averageStudent();
		const { llm, calls } = fakeLlm(honest(input));
		await evaluateWithAi(input, llm);
		expect(calls.redactor[0]).toContain("Fuente: Lista de cotejo");
	});

	test("ver sin describir da parcial aunque el modelo diga no", async () => {
		const base = goodStudent();
		const input = {
			...base,
			turns: base.turns.filter((t) => !t.text.startsWith("Veo")),
		};
		const { llm } = fakeLlm(honest(input));
		const report = await evaluateWithAi(input, llm);
		expect(report.judge).toBe("ia");
		expect(
			report.items.find((i) => i.itemId === "describe-hallazgo")?.status,
		).toBe("parcial");
	});
});
