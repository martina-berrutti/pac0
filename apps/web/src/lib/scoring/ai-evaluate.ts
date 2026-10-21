// Evaluador con IA (plan.md, sección 8): juez por ítem, verificador de
// omisiones y redactor de feedback. El puntaje y el veredicto los sigue
// calculando el código (assembleReport). Si algo del modelo falla, el informe
// sale con el juez por reglas.
import { z } from "zod";

import type { Report } from "@/lib/contracts/report";

import {
	aiJudgeItems,
	aiReasoning,
	type JsonLlm,
	verifyOmissions,
} from "./ai-judge";
import { improvementsFor } from "./diagnosis";
import { assembleReport, evaluate } from "./evaluate";
import { extract } from "./extractor";
import { creditSeenZones } from "./rule-judge";
import type { EvaluationInput } from "./types";

const MAX_TEXT = 300;

const writerSchema = z.object({
	mistakes: z.array(
		z.object({
			index: z.number().int(),
			why: z.string(),
			nextTime: z.string(),
		}),
	),
});

// Paso 6: el redactor solo reescribe "por qué importa" y "la próxima vez".
// Qué pasó, la evidencia y si es crítico no los toca.
export async function writeFeedback(
	report: Report,
	input: EvaluationInput,
	llm: JsonLlm,
): Promise<Report> {
	if (report.mistakes.length === 0) return report;
	const prompt = `Sos un docente de semiología que le devuelve feedback a un estudiante de medicina después de una entrevista de práctica. Para cada error, escribí en español rioplatense (voseo), en una o dos frases cortas:
- why: por qué importa en la práctica clínica.
- nextTime: qué hacer concretamente la próxima vez, con una frase de ejemplo si sirve.
No cambies qué pasó ni agregues errores nuevos. Sin juicios sobre la persona.
Si el error tiene fuente, el "why" tiene que ser coherente con ella; no la copies ni la cites textual.

Caso: ${input.clinicalCase.title}. Motivo de consulta: ${input.clinicalCase.chiefComplaint}.

Errores:
${report.mistakes
	.map((m, i) => {
		const quote = m.evidence.find((e) => e.quote)?.quote;
		return `${i}. ${m.what}${quote ? ` Cita: "${quote}"` : ""}${m.source ? ` Fuente: ${m.source}.` : ""}`;
	})
	.join("\n")}

Respondé solo JSON: {"mistakes":[{"index":0,"why":"...","nextTime":"..."}]}.`;

	try {
		const out = await llm(prompt, writerSchema);
		const byIndex = new Map(out.mistakes.map((m) => [m.index, m]));
		return {
			...report,
			mistakes: report.mistakes.map((m, i) => {
				const text = byIndex.get(i);
				const why = text?.why.trim().slice(0, MAX_TEXT);
				const nextTime = text?.nextTime.trim().slice(0, MAX_TEXT);
				return why && nextTime ? { ...m, why, nextTime } : m;
			}),
		};
	} catch {
		// Sin redactor, quedan los textos fijos.
		return report;
	}
}

// Tope para todo el evaluador con IA (juez, omisiones y redactor van uno
// detrás del otro): si no termina, sale el juez por reglas y el cierre no
// pasa el límite de tiempo de la función en Vercel.
export const AI_EVAL_BUDGET_MS = 45_000;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() =>
				reject(
					Object.assign(new Error("El evaluador con IA tardó demasiado"), {
						name: "TimeoutError",
					}),
				),
			ms,
		);
	});
	return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export async function evaluateWithAi(
	input: EvaluationInput,
	llm: JsonLlm,
	budgetMs = AI_EVAL_BUDGET_MS,
): Promise<Report> {
	try {
		return await withDeadline(runAi(input, llm), budgetMs);
	} catch (error) {
		console.warn("Evaluador con IA falló; uso el juez por reglas.", error);
		return { ...evaluate(input), judgeFallback: fallbackReason(error) };
	}
}

async function runAi(input: EvaluationInput, llm: JsonLlm): Promise<Report> {
	const extracted = extract(input);
	const [judged, reasoning] = await Promise.all([
		aiJudgeItems(input, extracted, llm),
		aiReasoning(input, llm),
	]);
	const items = (await verifyOmissions(judged, input, extracted, llm)).map(
		(i) => creditSeenZones(i, extracted),
	);
	const report = assembleReport(input, items, reasoning, "ia", extracted);
	const written = await writeFeedback(report, input, llm);
	// Los puntos a mejorar salen de los textos reescritos por el redactor.
	return written.diagnosis
		? {
				...written,
				improvements: improvementsFor(
					input.clinicalCase,
					written.diagnosis,
					written.mistakes,
				),
			}
		: written;
}

// Por qué falló la IA, en una palabra: queda en el informe para saberlo sin
// mirar los registros del servidor.
export function fallbackReason(
	error: unknown,
): NonNullable<Report["judgeFallback"]> {
	const text = String(error);
	const name = error instanceof Error ? error.name : "";
	if (
		name === "AbortError" ||
		name === "TimeoutError" ||
		/aborted|timed? ?out|en pausa/i.test(text)
	)
		return "tiempo";
	if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(text)) return "cuota";
	if (name === "ZodError" || name === "SyntaxError" || /JSON/i.test(text))
		return "formato";
	return "otro";
}
