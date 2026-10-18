// Trato al paciente (plan.md, sección 8: "comunicación y manejo del paciente"
// y la tabla de qué suma y qué resta). Junta lo que sumó y lo que restó en el
// trato, cada cosa con su cita, y calcula los puntos que suma a comunicación.
// Lo que resta ya entra como penalización de la dimensión (con su tope); acá
// solo se muestra. Valores iniciales, a calibrar con un docente.
import type {
	ItemResult,
	Mistake,
	Rapport,
	RapportEntry,
} from "@/lib/contracts/report";
import type { Turn } from "@/lib/contracts/session";

import { PENALTY_CAP, TRUST_BONUS, TRUST_GAIN } from "./engine";
import type { Extracted } from "./extractor";
import type { Penalty } from "./types";

// Lo que suma, con tope: el trato no puede tapar una anamnesis floja.
export const RAPPORT_BONUS_CAP = 10;
// Reconocer lo que siente el paciente cuando dice que le duele o tiene miedo.
export const CUE_POINTS = 2;
// Otras frases con empatía, hasta EMPATHY_MAX.
export const EMPATHY_POINTS = 1;
export const EMPATHY_MAX = 2;
// La confianza del paciente subió (en uno difícil suma TRUST_BONUS).
export const TRUST_UP = 0.1;
export const TRUST_UP_POINTS = 3;
// La confianza bajó: resta.
export const TRUST_DROP = 0.15;
export const TRUST_DROP_POINTS = 3;
// Despedirse con amabilidad.
export const CLOSING_POINTS = 1;
// Interrupciones que todavía no restan (desde la tercera, 2 puntos cada una).
export const FREE_INTERRUPTIONS = 2;

// Consejo para las faltas que no traen uno propio.
const TIPS: Record<string, string> = {
	interrumpe:
		"Dejá que el paciente termine la frase antes de hablar; si necesitás cortar, pedí permiso.",
	"pregunta-sugestiva":
		'Preguntá sin dar la respuesta: "¿Tuviste fiebre?" en vez de "Tuviste fiebre, ¿no?".',
};

// Faltas de trato que son errores críticos (evaluate.ts).
const CRITICAL_TAGS = new Set([
	"insiste-contra-negativa",
	"trato-irrespetuoso",
]);

// Margen para comparar confianzas: 1 − 0,9 da 0,0999… en punto flotante.
const EPS = 1e-9;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const cite = (t: Turn) => [{ turnId: t.id, quote: t.text }];

// Resta: el paciente terminó con bastante menos confianza que al empezar.
export function trustPenalty({ trust }: Extracted): Penalty[] {
	if (trust.start - trust.end < TRUST_DROP - EPS) return [];
	return [
		{
			dimension: "comunicacion",
			points: TRUST_DROP_POINTS,
			tag: "baja-confianza",
			what: `El paciente terminó con menos confianza en vos que al empezar (de ${pct(trust.start)} a ${pct(trust.end)}).`,
			why: "Cuando baja la confianza, el paciente cuenta menos y colabora menos con el examen.",
			nextTime:
				"Preguntá de forma abierta, dejalo terminar, reconocé lo que siente y explicá antes de examinar.",
		},
	];
}

// Suma: lo que hizo bien en el trato, con los puntos de cada cosa.
export function rapportBonus(extracted: Extracted): {
	bonus: number;
	plus: RapportEntry[];
} {
	const plus: RapportEntry[] = [];
	for (const { cue, reply } of extracted.acknowledgedCues) {
		plus.push({
			text: `Cuando el paciente dijo "${cue.text}", reconociste lo que sentía antes de seguir.`,
			points: CUE_POINTS,
			evidence: cite(reply),
		});
	}
	// Cada frase suma una sola vez: la que recogió una pista o la despedida no
	// vuelve a contar como empatía.
	const counted = new Set([
		...extracted.acknowledgedCues.map((c) => c.reply.id),
		...(extracted.kindClosing ? [extracted.kindClosing.id] : []),
	]);
	for (const t of extracted.empathyTurns
		.filter((x) => !counted.has(x.id))
		.slice(0, EMPATHY_MAX)) {
		plus.push({
			text: "Le hablaste con empatía.",
			points: EMPATHY_POINTS,
			evidence: cite(t),
		});
	}
	const { trust } = extracted;
	const gain = trust.end - trust.start;
	if (trust.difficult && gain >= TRUST_GAIN - EPS) {
		plus.push({
			text: `Ganaste la confianza de un paciente difícil (de ${pct(trust.start)} a ${pct(trust.end)}).`,
			points: TRUST_BONUS,
			evidence: [],
		});
	} else if (gain >= TRUST_UP - EPS) {
		plus.push({
			text: `El paciente terminó con más confianza en vos (de ${pct(trust.start)} a ${pct(trust.end)}).`,
			points: TRUST_UP_POINTS,
			evidence: [],
		});
	}
	if (extracted.kindClosing) {
		plus.push({
			text: "Cerraste la consulta con amabilidad.",
			points: CLOSING_POINTS,
			evidence: cite(extracted.kindClosing),
		});
	}
	const raw = plus.reduce((s, p) => s + (p.points ?? 0), 0);
	return { bonus: Math.min(RAPPORT_BONUS_CAP, raw), plus };
}

const LEVEL_TEXT: Record<Rapport["level"], string> = {
	muy_bueno: "Trataste muy bien al paciente.",
	bueno: "Trataste bien al paciente, con algunas cosas para pulir.",
	mejorable: "El trato al paciente se puede mejorar.",
	a_trabajar: "El trato al paciente es lo primero a trabajar.",
};

function levelFor(score: number, critical: boolean): Rapport["level"] {
	if (critical) return "a_trabajar";
	if (score >= 90) return "muy_bueno";
	if (score >= 75) return "bueno";
	if (score >= 60) return "mejorable";
	return "a_trabajar";
}

export function buildRapport({
	extracted,
	items,
	penalties,
	mistakes,
	bonus,
	plus,
	score,
}: {
	extracted: Extracted;
	items: ItemResult[];
	penalties: Penalty[];
	mistakes: Mistake[];
	bonus: number;
	plus: RapportEntry[];
	// Puntaje final de comunicación.
	score: number;
}): Rapport {
	const turnText = new Map(extracted.studentTurns.map((t) => [t.id, t.text]));
	const trato = items.filter((i) => i.dimension === "comunicacion");

	// Lo que sumó: los ítems de trato de la lista de cotejo (ya cuentan ahí) y
	// lo que suma puntos extra.
	const fromChecklist: RapportEntry[] = trato
		.filter((i) => i.status !== "no")
		.map((i) => ({
			text: i.status === "si" ? `${cap(i.item)}.` : `${cap(i.item)}, a medias.`,
			evidence: i.evidence,
		}));

	const critical = mistakes.filter(
		(m) => m.critical && CRITICAL_TAGS.has(m.tag),
	);
	const pens = penalties.filter((p) => p.dimension === "comunicacion");
	const interruptions = extracted.studentInterruptions.length;
	const minus: RapportEntry[] = [
		...critical.map((m) => ({
			text: m.what,
			critical: true,
			evidence: m.evidence,
		})),
		...pens.map((p) => ({
			text: p.what,
			points: p.points,
			evidence: p.turnId
				? [{ turnId: p.turnId, quote: turnText.get(p.turnId) }]
				: [],
		})),
		...(interruptions > 0 && interruptions <= FREE_INTERRUPTIONS
			? [
					{
						text: `Interrumpiste al paciente ${interruptions === 1 ? "una vez" : `${interruptions} veces`}. Todavía no resta: desde la tercera, resta 2 puntos cada una.`,
						evidence: [],
					},
				]
			: []),
		...trato
			.filter((i) => i.status === "no")
			.map((i) => ({ text: `Faltó: ${i.item}.`, evidence: [] })),
	];
	const penalty = Math.min(
		PENALTY_CAP,
		pens.reduce((s, p) => s + p.points, 0),
	);

	const level = levelFor(score, critical.length > 0);
	const { trust } = extracted;
	const moved =
		Math.abs(trust.end - trust.start) < 0.05
			? `La confianza del paciente se mantuvo en ${pct(trust.end)}.`
			: `La confianza del paciente pasó de ${pct(trust.start)} a ${pct(trust.end)}.`;
	const balance = [
		bonus > 0 ? `sumaste ${bonus} punto${bonus === 1 ? "" : "s"}` : null,
		penalty > 0 ? `restaste ${penalty}` : null,
	].filter(Boolean);
	const summary = [
		LEVEL_TEXT[level],
		moved,
		balance.length > 0
			? `Por el trato, ${balance.join(" y ")} en comunicación.`
			: null,
	]
		.filter(Boolean)
		.join(" ");

	const firstPenalty = pens[0];
	const penaltyTip = firstPenalty
		? (firstPenalty.nextTime ?? TIPS[firstPenalty.tag])
		: undefined;
	const firstMissing = trato.find((i) => i.status === "no");
	const tip = critical[0]
		? critical[0].nextTime
		: penaltyTip
			? penaltyTip
			: firstMissing
				? `La próxima vez: ${firstMissing.item}.`
				: extracted.acknowledgedCues.length === 0 &&
						extracted.empathyTurns.length === 0
					? 'Sumá una frase que muestre que lo escuchás: "Entiendo que te moleste, vamos a ver qué es".'
					: "Seguí así: presentate, preguntá de forma abierta, reconocé lo que siente y explicá antes de examinar.";

	return {
		level,
		summary,
		tip,
		trust: { start: trust.start, end: trust.end },
		bonus,
		penalty,
		plus: [...fromChecklist, ...plus],
		minus,
	};
}

function cap(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
