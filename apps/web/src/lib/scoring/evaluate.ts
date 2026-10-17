// Arma el informe: juez por ítem + razonamiento + penalizaciones + motor.
import type { Dimension } from "@/cases/schema";
import {
	type Mistake,
	type Report,
	reportSchema,
} from "@/lib/contracts/report";

import { dimensionScore, totalScore, verdictFor } from "./engine";
import { judgeItem } from "./rule-judge";
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
const LEADING_QUESTION = /,?\s*(no|verdad|cierto)\s*\?\s*$/i;

function normalize(s: string) {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

// Razonamiento (plan.md: hipótesis 40%, diferenciales 25%, justificación 20%,
// estudios 15%). Devuelve un puntaje de 0 a 100.
export function reasoningScore(input: EvaluationInput) {
	const closing = input.session.closing;
	if (!closing) return { score: 0, notes: ["No planteaste una hipótesis."] };
	const { truth } = input.clinicalCase;
	const hyp = normalize(closing.hypothesis);
	const notes: string[] = [];
	let score = 0;
	const hits = [truth.diagnosis, ...truth.acceptable].some((d) =>
		hyp.includes(normalize(d)),
	);
	if (hits) score += 40;
	else notes.push("La hipótesis principal no coincide con el cuadro.");
	const diffs = closing.differentials.map(normalize);
	const covered = truth.differentials.filter((d) =>
		diffs.some((x) => x.includes(normalize(d)) || normalize(d).includes(x)),
	);
	score += Math.round(
		(covered.length / Math.max(1, truth.differentials.length)) * 25,
	);
	if (covered.length < truth.differentials.length)
		notes.push("Faltaron diferenciales relevantes.");
	// Justificación: la hipótesis cita algún dato que preguntó o vio.
	const justified = [
		"fiebre",
		"exudado",
		"tos",
		"tragar",
		"dias",
		"amigdal",
		"placas",
		"eritema",
		"mocos",
	].some((w) => hyp.includes(w));
	if (justified) score += 20;
	else notes.push("Justificá la hipótesis con lo que preguntaste o viste.");
	if (STUDIES.some((s) => hyp.includes(normalize(s)))) score += 15;
	else
		notes.push(
			"Podés proponer un estudio o conducta (por ejemplo, test rápido).",
		);
	return { score, notes };
}

function penalties(input: EvaluationInput): Penalty[] {
	const out: Penalty[] = [];
	const interruptions = input.events.filter(
		(e) => e.type === "interrupcion_estudiante",
	);
	// Desde la tercera interrupción, 2 puntos de comunicación por vez.
	for (const e of interruptions.slice(2)) {
		out.push({
			dimension: "comunicacion",
			points: 2,
			tag: "interrumpe",
			what: `Interrumpiste al paciente (${Math.round(e.atMs / 1000)} s).`,
		});
	}
	const student = input.turns.filter((t) => t.speaker === "estudiante");
	const asked = new Set<string>();
	for (const t of student) {
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

export function evaluate(input: EvaluationInput): Report {
	const { clinicalCase } = input;
	const items = clinicalCase.expectedChecklist.map((item) =>
		judgeItem(item, input),
	);
	const pens = penalties(input);
	const reasoning = reasoningScore(input);

	const byDim = (d: Dimension) => items.filter((i) => i.dimension === d);
	const pensFor = (d: Dimension) => pens.filter((p) => p.dimension === d);
	const scores = {
		anamnesis: dimensionScore(byDim("anamnesis"), pensFor("anamnesis")),
		examen: dimensionScore(byDim("examen"), pensFor("examen")),
		razonamiento: Math.max(
			0,
			reasoning.score -
				Math.min(
					15,
					pensFor("razonamiento").reduce((s, p) => s + p.points, 0),
				),
		),
		comunicacion: dimensionScore(
			byDim("comunicacion"),
			pensFor("comunicacion"),
		),
	};

	const mistakes: Mistake[] = [];
	// Error crítico: examinar sin consentimiento.
	const examined = input.examActions.some((a) => a.variant !== "negado");
	if (examined && !input.session.consentGiven) {
		mistakes.push({
			tag: "examen-sin-consentimiento",
			what: "Examinaste sin explicar ni pedir permiso.",
			why: "Es un error crítico: el consentimiento va antes de cualquier examen.",
			nextTime:
				"Explicá qué vas a hacer y preguntá si podés antes de examinar.",
			critical: true,
			evidence: [],
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
		mistakes.push({
			tag: p.tag,
			what: p.what,
			why: "Resta puntos de la dimensión.",
			nextTime: "Dejá hablar y preguntá de forma abierta.",
			critical: false,
			evidence: p.turnId ? [{ turnId: p.turnId }] : [],
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
		judge: "reglas",
		createdAt: Date.now(),
	});
}
