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

import { MARK_TOLERANCE, TECHNIQUE } from "@/lib/exam/blood-pressure";
import {
	affectedEar,
	OTOSCOPY_TECHNIQUE,
	otoscopyScenario,
} from "@/lib/exam/otoscope";

import {
	dimensionScore,
	MIN_ANAMNESIS_FOR_DIAGNOSIS,
	PENALTY_CAP,
	TRUST_BONUS,
	TRUST_GAIN,
	totalScore,
	verdictFor,
} from "./engine";
import { type Extracted, extract } from "./extractor";
import {
	DESCRIBE_ITEM,
	expectedFinding,
	judgeItem,
	normalize,
} from "./rule-judge";
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
// Palabra suelta al final ("…, ¿no?"): sin el límite, "¿tenés algún
// hermano?" contaba como sugestiva.
const LEADING_QUESTION = /(?:^|[\s,¿])(no|verdad|cierto)\s*\?\s*$/i;

// De dónde sale cada "por qué importa" (plan.md, sección 8: dimensiones y
// fuentes; sección 6: afiches). Solo se nombra la fuente.
export const SOURCES = {
	anamnesis:
		"Lista de cotejo de la facultad: introducción a la entrevista clínica",
	examen: "Lista de cotejo de la facultad: examen físico general",
	razonamiento: "Diagnóstico y diferenciales del caso",
	comunicacion: "Lista de cotejo de la facultad: construye una relación",
	presion: "Afiche HC-01 del Centro de Simulación: presión arterial",
	otoscopia: "Afiche HC-02 del Centro de Simulación: otoscopia",
	caso: "Lista de cotejo del caso",
} as const;

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
	for (const t of extracted.jargonTurns) {
		out.push({
			dimension: "comunicacion",
			points: 1,
			tag: "jerga",
			what: "Usaste un término médico sin explicarlo.",
			turnId: t.id,
			why: "El paciente no entiende la jerga y puede contestar mal o sentirse lejos.",
			nextTime:
				'Usá palabras simples o explicá el término: "exudado, o sea, unas placas blancas".',
		});
	}
	for (const { cue, reply } of extracted.ignoredCues) {
		out.push({
			dimension: "comunicacion",
			points: 3,
			tag: "ignora-pista",
			what: `El paciente dijo "${cue.text}" y seguiste sin recogerlo.`,
			turnId: reply.id,
			why: "Ignorar una pista emocional o de dolor baja la confianza y puede esconder información importante.",
			nextTime:
				'Reconocé lo que siente antes de seguir: "Entiendo que te preocupe, vamos a ver qué es".',
		});
	}
	return [
		...out,
		...bloodPressurePenalties(extracted),
		...otoscopyPenalties(extracted),
	];
}

// Otoscopio: 2 puntos de examen por cada error de técnica del afiche HC-02.
// Si examinó los dos oídos, el mismo error cuenta una vez.
function otoscopyPenalties({ otoscopies }: Extracted): Penalty[] {
	const errors = new Set(otoscopies.flatMap((a) => a.technique?.errors ?? []));
	return [...errors].map((e) => ({
		dimension: "examen",
		points: 2,
		tag: `otoscopia-${e}`,
		what: OTOSCOPY_TECHNIQUE[e].label,
		why: OTOSCOPY_TECHNIQUE[e].why,
		nextTime: OTOSCOPY_TECHNIQUE[e].tip,
		source: SOURCES.otoscopia,
	}));
}

// Hallazgos del caso en la otoscopia: examinar los dos oídos (el sano es la
// referencia) y empezar por el sano. Solo si el caso tiene un oído afectado.
function earPenalties(
	{ clinicalCase }: EvaluationInput,
	{ otoscopies }: Extracted,
): Penalty[] {
	if (otoscopies.length === 0) return [];
	const affected = affectedEar(
		otoscopyScenario(clinicalCase.id, clinicalCase.patient.age),
	);
	if (!affected) return [];
	const ears = otoscopies.map((a) =>
		a.zone === "oido-izquierdo" ? "izquierdo" : "derecho",
	);
	const out: Penalty[] = [];
	const missing = (["derecho", "izquierdo"] as const).find(
		(e) => !ears.includes(e),
	);
	if (missing) {
		out.push({
			dimension: "examen",
			points: 2,
			tag: "otoscopia-un-oido",
			what:
				missing === affected
					? `No examinaste el oído que le duele (el ${missing}).`
					: `Examinaste solo el oído ${affected}, sin compararlo con el sano.`,
			why: "Se examinan los dos oídos: el sano es la referencia para reconocer lo anormal.",
			nextTime: "Examiná los dos oídos, empezando por el sano.",
			source: SOURCES.caso,
		});
	} else if (ears[0] === affected) {
		out.push({
			dimension: "examen",
			points: 1,
			tag: "otoscopia-orden",
			what: `Empezaste por el oído que le duele (el ${affected}).`,
			why: "Empezar por el sano evita llevar secreción al otro oído y te da la referencia de lo normal.",
			nextTime: "Empezá la otoscopia por el oído sano.",
			source: SOURCES.caso,
		});
	}
	return out;
}

// Tensiómetro: 2 puntos de examen por cada error de técnica y por cada valor
// mal marcado (plan.md, sección 8). La técnica cuenta aunque no haya llegado a
// marcar; la lectura, solo si marcó.
function bloodPressurePenalties({ bp }: Extracted): Penalty[] {
	if (!bp) return [];
	const out: Penalty[] = bp.techniqueErrors.map((e) => ({
		dimension: "examen",
		points: 2,
		tag: `tecnica-${e}`,
		what: `Tomaste la presión con ${TECHNIQUE[e].label}.`,
		why: TECHNIQUE[e].effect,
		nextTime: TECHNIQUE[e].tip,
		source: SOURCES.presion,
	}));
	if (!bp.marked) return out;
	const marks = [
		{
			name: "PAS",
			marked: bp.marked.pas,
			real: bp.shown.pas,
			sound: "apareció el primer ruido",
			why: "La PAS es el primer ruido de Korotkoff.",
		},
		{
			name: "PAD",
			marked: bp.marked.pad,
			real: bp.shown.pad,
			sound: "desaparecieron los ruidos",
			why: "La PAD es cuando desaparecen los ruidos de Korotkoff.",
		},
	];
	for (const m of marks) {
		if (Math.abs(m.marked - m.real) <= MARK_TOLERANCE) continue;
		out.push({
			dimension: "examen",
			points: 2,
			tag: `lectura-${m.name.toLowerCase()}`,
			what: `Marcaste la ${m.name} en ${m.marked}, pero ${m.sound} en ${m.real}.`,
			why: m.why,
			nextTime:
				"Desinflá despacio, de 2 a 3 mmHg por segundo, y marcá en el momento justo.",
			source: SOURCES.presion,
		});
	}
	return out;
}

// Saltar al diagnóstico sin datos suficientes: 5 puntos de razonamiento si
// plantea una hipótesis con poca anamnesis o sin examinar.
function jumpedToDiagnosis(
	input: EvaluationInput,
	items: ItemResult[],
	extracted: Extracted,
): Penalty[] {
	if (!input.session.closing?.hypothesis.trim()) return [];
	const anamnesis = items.filter((i) => i.dimension === "anamnesis");
	const applicable = anamnesis.reduce((s, i) => s + i.weight, 0);
	const covered = anamnesis.reduce(
		(s, i) =>
			s + i.weight * (i.status === "si" ? 1 : i.status === "parcial" ? 0.5 : 0),
		0,
	);
	const coverage = applicable === 0 ? 100 : (covered / applicable) * 100;
	const missing = [
		coverage < MIN_ANAMNESIS_FOR_DIAGNOSIS ? "con poca anamnesis" : null,
		extracted.examined ? null : "sin examinar",
	].filter((x): x is string => x !== null);
	if (missing.length === 0) return [];
	return [
		{
			dimension: "razonamiento",
			points: 5,
			tag: "salta-al-diagnostico",
			what: `Planteaste una hipótesis ${missing.join(" y ")}.`,
			why: "Una hipótesis sin datos suficientes se queda con la primera idea y deja pasar otras causas.",
			nextTime:
				"Completá la historia y el examen antes de cerrar con una hipótesis.",
		},
	];
}

// Errores críticos (plan.md, sección 8). Bloquean el "Lo hiciste bien".
function criticalMistakes(
	items: ItemResult[],
	extracted: Extracted,
): Mistake[] {
	const out: Mistake[] = [];
	// Error crítico: examinar antes de explicar y pedir permiso.
	if (extracted.examWithoutConsent) {
		out.push({
			tag: "examen-sin-consentimiento",
			what: "Examinaste sin explicar ni pedir permiso.",
			why: "Es un error crítico: el consentimiento va antes de cualquier examen.",
			nextTime:
				"Explicá qué vas a hacer y preguntá si podés antes de examinar.",
			source: SOURCES.examen,
			critical: true,
			evidence: [{ examActionId: extracted.examWithoutConsent.id }],
		});
	}
	const { insisted } = extracted;
	if (insisted) {
		out.push({
			tag: "insiste-contra-negativa",
			what: "Insististe cuando el paciente se negó, sin resolver la negativa.",
			why: "Es un error crítico: ante una negativa no se presiona; se reconoce la emoción, se explica y se pide permiso.",
			nextTime:
				'"Entiendo que no quieras. Es para ver cómo están las amígdalas; si querés que pare, me avisás. ¿Te parece?"',
			source: SOURCES.comunicacion,
			critical: true,
			evidence: insisted.turn
				? [{ turnId: insisted.turn.id, quote: insisted.turn.text }]
				: [{ examActionId: insisted.examActionId }],
		});
	}
	for (const i of items.filter((x) => x.status === "no" && isAlarm(x))) {
		out.push({
			tag: `alarma-${i.itemId}`,
			what: `No ${i.item}.`,
			why: "Es un error crítico: pasar por alto una señal de alarma puede demorar una urgencia.",
			nextTime: "Antes de cerrar, preguntá siempre por los signos de alarma.",
			source: SOURCES.anamnesis,
			critical: true,
			evidence: [],
		});
	}
	if (extracted.disrespectfulTurns.length > 0) {
		out.push({
			tag: "trato-irrespetuoso",
			what: "Le hablaste al paciente de forma irrespetuosa.",
			why: "Es un error crítico: el trato respetuoso es la base de la consulta.",
			nextTime:
				"Aunque el paciente esté difícil, mantené un tono calmo y amable.",
			source: SOURCES.comunicacion,
			critical: true,
			evidence: extracted.disrespectfulTurns.map((t) => ({
				turnId: t.id,
				quote: t.text,
			})),
		});
	}
	return out;
}

// Los ítems de signos de alarma del caso (por ejemplo "sintomas-alarma").
function isAlarm(i: ItemResult) {
	return normalize(`${i.itemId} ${i.item}`).includes("alarma");
}

// Lo que el estudiante dijo que vio contra el hallazgo esperado del caso.
// Solo si hubo apertura completa u otoscopia: sin eso no había nada que
// describir.
function describeMistake(
	items: ItemResult[],
	extracted: Extracted,
	input: EvaluationInput,
): Mistake | null {
	const item = items.find(
		(i) => i.itemId === DESCRIBE_ITEM && i.status !== "si",
	);
	const expected = expectedFinding(input, extracted);
	if (!item || !expected) return null;
	const sawOnly = item.evidence.some((e) => e.examActionId);
	const what = sawOnly
		? `Miraste la zona pero no dijiste qué viste. Lo esperado: ${expected}.`
		: item.status === "parcial"
			? `Tu descripción no coincide del todo con el hallazgo. Lo esperado: ${expected}.`
			: `No describiste lo que viste. Lo esperado: ${expected}.`;
	return {
		tag: DESCRIBE_ITEM,
		what,
		why: "Describir el hallazgo en voz alta es parte del examen y es lo que después sostiene la hipótesis.",
		nextTime:
			"Después de mirar, decí qué ves: color, tamaño de las amígdalas, placas o exudado.",
		source: SOURCES.examen,
		critical: false,
		evidence: item.evidence,
	};
}

export function assembleReport(
	input: EvaluationInput,
	items: ItemResult[],
	reasoning: Reasoning,
	judge: Report["judge"],
	extracted: Extracted = extract(input),
): Report {
	const { clinicalCase } = input;
	const pens = [
		...penalties(extracted),
		...earPenalties(input, extracted),
		...jumpedToDiagnosis(input, items, extracted),
	];
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
	// Suma: subir la confianza de un paciente difícil.
	const { trust } = extracted;
	const wonTrust = trust.difficult && trust.end - trust.start >= TRUST_GAIN;
	if (wonTrust) {
		scores.comunicacion = Math.min(100, scores.comunicacion + TRUST_BONUS);
	}

	const mistakes: Mistake[] = criticalMistakes(items, extracted);
	const description = describeMistake(items, extracted, input);
	if (description) mistakes.push(description);
	for (const i of items.filter(
		(x) =>
			x.status === "no" &&
			x.weight >= 2 &&
			!isAlarm(x) &&
			!(description && x.itemId === DESCRIBE_ITEM),
	)) {
		mistakes.push({
			tag: i.itemId,
			what: `No ${i.item} (no aparece en ningún turno).`,
			why:
				i.weight === 3
					? "Es un ítem esencial de la lista de cotejo."
					: "Es un ítem importante de la lista de cotejo.",
			nextTime: `La próxima vez: ${i.item}.`,
			source: SOURCES[i.dimension],
			critical: false,
			evidence: [],
		});
	}
	for (const p of pens) {
		const quote = p.turnId ? turnText.get(p.turnId) : undefined;
		mistakes.push({
			tag: p.tag,
			what: p.what,
			why: p.why ?? "Resta puntos de la dimensión.",
			nextTime: p.nextTime ?? "Dejá hablar y preguntá de forma abierta.",
			source: p.source ?? SOURCES[p.dimension],
			critical: false,
			evidence: p.turnId ? [{ turnId: p.turnId, quote }] : [],
		});
	}
	// Qué hubiera marcado el manómetro con buena técnica.
	const { bp } = extracted;
	if (bp && bp.techniqueErrors.length > 0) {
		const [sys, dia] = clinicalCase.vitals.pa;
		mistakes.push({
			tag: "presion-lectura",
			what: `El manómetro marcó ${bp.shown.pas}/${bp.shown.pad}; con buena técnica hubiera marcado ${sys}/${dia}.`,
			why: "Los errores de técnica cambian la lectura y pueden llevar a un diagnóstico equivocado de hipertensión.",
			nextTime: "Prepará al paciente y revisá la posición antes de inflar.",
			source: SOURCES.presion,
			critical: false,
			evidence: [{ examActionId: bp.id }],
		});
	}
	for (const note of reasoning.notes) {
		mistakes.push({
			tag: "razonamiento",
			what: note,
			why: "Parte de la dimensión de razonamiento.",
			nextTime: note,
			source: SOURCES.razonamiento,
			critical: false,
			evidence: [],
		});
	}

	const pct = (x: number) => `${Math.round(x * 100)}%`;
	const strengths = [
		...(wonTrust
			? [
					{
						text: `Ganaste la confianza de un paciente difícil (de ${pct(trust.start)} a ${pct(trust.end)}).`,
						evidence: {},
					},
				]
			: []),
		...items
			.filter((i) => i.status === "si" && i.evidence[0])
			.sort((a, b) => b.weight - a.weight)
			.map((i) => ({
				text: `Bien: ${i.item}.`,
				evidence: i.evidence[0] ?? {},
			})),
	].slice(0, 3);

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
