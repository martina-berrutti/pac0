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
import { assembleReport, evaluate } from "./evaluate";
import { extract } from "./extractor";
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

Caso: ${input.clinicalCase.title}. Motivo de consulta: ${input.clinicalCase.chiefComplaint}.

Errores:
${report.mistakes
	.map((m, i) => {
		const quote = m.evidence.find((e) => e.quote)?.quote;
		return `${i}. ${m.what}${quote ? ` Cita: "${quote}"` : ""}`;
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

export async function evaluateWithAi(
	input: EvaluationInput,
	llm: JsonLlm,
): Promise<Report> {
	try {
		const extracted = extract(input);
		const [judged, reasoning] = await Promise.all([
			aiJudgeItems(input, extracted, llm),
			aiReasoning(input, llm),
		]);
		const items = await verifyOmissions(judged, input, extracted, llm);
		const report = assembleReport(input, items, reasoning, "ia", extracted);
		return await writeFeedback(report, input, llm);
	} catch (error) {
		console.warn("Evaluador con IA falló; uso el juez por reglas.", error);
		return evaluate(input);
	}
}
