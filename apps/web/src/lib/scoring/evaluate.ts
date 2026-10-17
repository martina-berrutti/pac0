// Arma el informe: juez por ítem + razonamiento + penalizaciones + motor.
// El juez por reglas (evaluate) y el juez con IA (ai-evaluate.ts) comparten
// assembleReport, así el puntaje siempre lo calcula este código.
import type { Dimension } from "@/cases/schema";
import {
	type ItemResult,
	type Mistake,
	type Report,
	reportSchema,
} from "@/lib/contracts/report";

import { dimensionScore, PENALTY_CAP, totalScore, verdictFor } from "./engine";
import { type Extracted, extract } from "./extractor";
import { judgeItem, normalize } from "./rule-judge";
import type { EvaluationInput, Penalty } from "./types";

const STUDIES = [
	"hisopado",
	"test rápido",
	"test rapido",
	"exudado faríngeo",
	"exudado faringeo",
	"cultivo",
	"strep",
];
const JUSTIFICATION_WORDS = [
	"fiebre",
	"exudado",
	"tos",
	"tragar",
	"dias",
	"amigdal",
	"placas",
	"eritema",
	"mocos",
];
const LEADING_QUESTION = /,?\s*(no|verdad|cierto)\s*\?\s*$/i;

export type Reasoning = { score: number; notes: string[] };

// Lo que el juez (reglas o IA) decide del cierre; el puntaje lo pone el código.
export type ReasoningParts = {
	hypothesisMatches: boolean;
	differentialsCovered: number;
	differentialsExpected: number;
	justified: boolean;
	studies: boolean;
};

export const NO_HYPOTHESIS: Reasoning = {
	score: 0,
	notes: ["No planteaste una hipótesis."],
};

// Razonamiento (plan.md: hipótesis 40%, diferenciales 25%, justificación 20%,
// estudios 15%). Devuelve un puntaje de 0 a 100.
export function reasoningFromParts(p: ReasoningParts): Reasoning {
	const notes: string[] = [];
	let score = 0;
	if (p.hypothesisMatches) score += 40;
	else notes.push("La hipótesis principal no coincide con el cuadro.");
	score += Math.round(
		(p.differentialsCovered / Math.max(1, p.differentialsExpected)) * 25,
	);
	if (p.differentialsCovered < p.differentialsExpected)
		notes.push("Faltaron diferenciales relevantes.");
	if (p.justified) score += 20;
	else notes.push("Justificá la hipótesis con lo que preguntaste o viste.");
	if (p.studies) score += 15;
	else
		notes.push(
			"Podés proponer un estudio o conducta (por ejemplo, test rápido).",
		);
	return { score, notes };
}

export function reasoningScore(input: EvaluationInput): Reasoning {
	const closing = input.session.closing;
	if (!closing) return NO_HYPOTHESIS;
	const { truth } = input.clinicalCase;
	const hyp = normalize(closing.hypothesis);
	const diffs = closing.differentials.map(normalize);
	return reasoningFromParts({
		hypothesisMatches: [truth.diagnosis, ...truth.acceptable].some((d) =>
			hyp.includes(normalize(d)),
		),
		differentialsCovered: truth.differentials.filter((d) =>
			diffs.some((x) => x.includes(normalize(d)) || normalize(d).includes(x)),
		).length,
		differentialsExpected: truth.differentials.length,
		justified: JUSTIFICATION_WORDS.some((w) => hyp.includes(w)),
		studies: STUDIES.some((s) => hyp.includes(normalize(s))),
	});
}

function penalties(extracted: Extracted): Penalty[] {
	const out: Penalty[] = [];
	// Desde la tercera interrupción, 2 puntos de comunicación por vez.
	for (const e of extracted.studentInterruptions.slice(2)) {
		out.push({
			dimension: "comunicacion",
			points: 2,
			tag: "interrumpe",
			what: `Interrumpiste al paciente (${Math.round(e.atMs / 1000)} s).`,
		});
	}
	const asked = new Set<string>();
	for (const t of extracted.studentTurns) {
		if (LEADING_QUESTION.test(t.text.trim())) {
			out.push({
				dimension: "comunicacion",
				points: 1,
				tag: "pregunta-sugestiva",
				what: "Pregunta sugestiva.",
				turnId: t.id,
			});
		}
		const key = normalize(t.text)
			.replace(/[^a-z ]/g, "")
			.trim();
		if (key.length > 8 && asked.has(key)) {
			out.push({
				dimension: "anamnesis",
				points: 1,
				tag: "repite-pregunta",
				what: "Repetiste una pregunta ya respondida.",
				turnId: t.id,
			});
		}
		asked.add(key);
	}
	return out;
}

export function assembleReport(
	input: EvaluationInput,
	items: ItemResult[],
	reasoning: Reasoning,
	judge: Report["judge"],
	extracted: Extracted = extract(input),
): Report {
	const { clinicalCase } = input;
	const pens = penalties(extracted);
	const turnText = new Map(extracted.studentTurns.map((t) => [t.id, t.text]));

	const byDim = (d: Dimension) => items.filter((i) => i.dimension === d);
	const pensFor = (d: Dimension) => pens.filter((p) => p.dimension === d);
	const scores = {
		anamnesis: dimensionScore(byDim("anamnesis"), pensFor("anamnesis")),
		examen: dimensionScore(byDim("examen"), pensFor("examen")),
		razonamiento: Math.max(
			0,
			reasoning.score -
				Math.min(
					PENALTY_CAP,
					pensFor("razonamiento").reduce((s, p) => s + p.points, 0),
				),
		),
		comunicacion: dimensionScore(
			byDim("comunicacion"),
			pensFor("comunicacion"),
		),
	};

	const mistakes: Mistake[] = [];
	// Error crítico: examinar antes de explicar y pedir permiso.
	if (extracted.examWithoutConsent) {
		mistakes.push({
			tag: "examen-sin-consentimiento",
			what: "Examinaste sin explicar ni pedir permiso.",
			why: "Es un error crítico: el consentimiento va antes de cualquier examen.",
			nextTime:
				"Explicá qué vas a hacer y preguntá si podés antes de examinar.",
			critical: true,
			evidence: [{ examActionId: extracted.examWithoutConsent.id }],
		});
	}
	for (const i of items.filter((x) => x.status === "no" && x.weight >= 2)) {
		mistakes.push({
			tag: i.itemId,
			what: `No ${i.item} (no aparece en ningún turno).`,
			why:
				i.weight === 3
					? "Es un ítem esencial de la lista de cotejo."
					: "Es un ítem importante de la lista de cotejo.",
			nextTime: `La próxima vez: ${i.item}.`,
			critical: false,
			evidence: [],
		});
	}
	for (const p of pens) {
		const quote = p.turnId ? turnText.get(p.turnId) : undefined;
		mistakes.push({
			tag: p.tag,
			what: p.what,
			why: "Resta puntos de la dimensión.",
			nextTime: "Dejá hablar y preguntá de forma abierta.",
			critical: false,
			evidence: p.turnId ? [{ turnId: p.turnId, quote }] : [],
		});
	}
	for (const note of reasoning.notes) {
		mistakes.push({
			tag: "razonamiento",
			what: note,
			why: "Parte de la dimensión de razonamiento.",
			nextTime: note,
			critical: false,
			evidence: [],
		});
	}

	const strengths = items
		.filter((i) => i.status === "si" && i.evidence[0])
		.sort((a, b) => b.weight - a.weight)
		.slice(0, 3)
		.map((i) => ({ text: `Bien: ${i.item}.`, evidence: i.evidence[0] ?? {} }));

	const total = totalScore(scores);
	const { verdict, message } = verdictFor(
		total,
		mistakes.filter((m) => m.critical).length,
	);

	return reportSchema.parse({
		sessionId: input.session.id,
		scores,
		total,
		verdict,
		verdictMessage: message,
		items,
		strengths,
		mistakes,
		truth: {
			diagnosis: clinicalCase.truth.diagnosis,
			differentials: clinicalCase.truth.differentials,
		},
		notMeasurable: ["Contacto ocular", "Expresión facial y postura"],
		judge,
		createdAt: Date.now(),
	});
}

// Evaluación sin IA: juez por reglas.
export function evaluate(input: EvaluationInput): Report {
	const extracted = extract(input);
	const items = input.clinicalCase.expectedChecklist.map((item) =>
		judgeItem(item, input, extracted),
	);
	return assembleReport(
		input,
		items,
		reasoningScore(input),
		"reglas",
		extracted,
	);
}
