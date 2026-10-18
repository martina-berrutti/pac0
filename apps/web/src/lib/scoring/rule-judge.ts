// Juez por reglas: busca las palabras clave de cada ítem en los turnos del
// estudiante y cita el turno. Sin evidencia no hay "sí". Es el respaldo del
// juez con IA (ai-judge.ts), que devuelve lo mismo.
import type { ChecklistItem } from "@/cases/schema";
import type { ItemResult } from "@/lib/contracts/report";
import type { Turn } from "@/lib/contracts/session";
import { MARK_TOLERANCE } from "@/lib/exam/blood-pressure";
import {
	describeEars,
	MIN_LOOK_MS,
	otoscopyScenario,
} from "@/lib/exam/otoscope";

import { type Extracted, extract } from "./extractor";
import type { EvaluationInput } from "./types";

// Ítems que se juzgan con las acciones de examen, no con lo que dijo.
export const ACTION_ITEMS = new Set([
	"orofaringe",
	"presion-arterial",
	"otoscopia",
]);

// Odinofagia (Persona 3): los signos de alarma y los ganglios los juzga
// siempre este código, también con el juez de IA: tienen reglas propias
// (cuántos signos descartó; palpar o preguntar).
export const ALARM_ITEM = "signos-alarma";
export const NODES_ITEM = "adenopatias";
export const RULE_ONLY_ITEMS = new Set([
	...ACTION_ITEMS,
	ALARM_ITEM,
	NODES_ITEM,
]);

// Signos de alarma de la odinofagia y cómo se pregunta por cada uno.
export const ALARM_SIGNS: { sign: string; keywords: string[] }[] = [
	{
		sign: "falta de aire",
		keywords: ["aire", "respir", "ahog", "disnea", "agitad"],
	},
	{
		sign: "no poder tragar",
		keywords: ["tragar", "tragas", "comer", "comes", "comida", "disfagia"],
	},
	{
		sign: "saliva",
		keywords: ["saliva", "babe", "sialorrea", "escupi"],
	},
	{
		sign: "abrir la boca",
		keywords: [
			"cuesta abrir",
			"duele abrir",
			"dolor al abrir",
			"abris bien la boca",
			"mandibula",
			"trismus",
		],
	},
	{
		sign: "cambios en la voz",
		keywords: ["voz", "disfon", "ronca", "papa caliente"],
	},
];
// Con 3 de los 5 descartados, el ítem está cumplido; con 1 o 2, a medias.
export const MIN_ALARM_SIGNS = 3;

export function normalize(s: string) {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

export const DESCRIBE_ITEM = "describe-hallazgo";

// Las claves cortas tienen que ser palabra: "tos" no está en "datos", ni
// "mate" en "tomate". Hasta 3 letras valen como comienzo de palabra ("roj"
// para roja o rojo); 4 letras, palabra entera (con o sin s). Las largas, en
// cualquier parte ("alérgic").
export function hasKeyword(text: string, keyword: string) {
	const t = normalize(text);
	const k = normalize(keyword).trim();
	if (!k) return false;
	if (k.length > 4 || /\s/.test(k)) return t.includes(k);
	const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const end = k.length === 4 ? "s?(?![a-z0-9])" : "";
	return new RegExp(`(?<![a-z0-9])${escaped}${end}`).test(t);
}

export function findTurn(turns: Turn[], keywords: string[]) {
	return turns.find((t) => keywords.some((k) => hasKeyword(t.text, k)));
}

// Turnos del estudiante que pueden probar el ítem. Describir el hallazgo solo
// cuenta después de examinar.
export function turnsForItem(item: ChecklistItem, extracted: Extracted) {
	if (item.id !== DESCRIBE_ITEM) return extracted.studentTurns;
	const from = extracted.firstExamMs;
	return from === null
		? []
		: extracted.studentTurns.filter((t) => t.startMs >= from);
}

// La palabra clave aparece sin negar en su frase: "no veo placas" no prueba
// "placas". Las claves que ya traen la negación ("sin placas") valen tal cual.
function affirms(text: string, keyword: string) {
	const t = normalize(text);
	const k = normalize(keyword);
	if (/^(no|sin) /.test(k)) return t.includes(k);
	for (let at = t.indexOf(k); at >= 0; at = t.indexOf(k, at + 1)) {
		const clause =
			t
				.slice(0, at)
				.split(/[.,;:!?]/)
				.at(-1) ?? "";
		if (!/(^|\s)(no|sin|ni)\s/.test(clause)) return true;
	}
	return false;
}

// Describir el hallazgo (plan.md, sección 6): sí si lo describe con las
// palabras del caso; si iluminó las zonas pero no dijo qué vio, parcial.
function judgeDescription(
	item: ChecklistItem,
	base: Omit<ItemResult, "status" | "evidence">,
	extracted: Extracted,
): ItemResult {
	const turn = turnsForItem(item, extracted).find((t) =>
		item.keywords.some((k) => affirms(t.text, k)),
	);
	if (turn)
		return {
			...base,
			status: "si",
			evidence: [{ turnId: turn.id, quote: turn.text }],
		};
	return creditSeenZones({ ...base, status: "no", evidence: [] }, extracted);
}

// Crédito parcial por ver sin describir. Lo usan los dos jueces: el de IA
// deja en "no" lo que no tiene un turno que lo pruebe.
export function creditSeenZones(
	result: ItemResult,
	extracted: Extracted,
): ItemResult {
	if (result.itemId !== DESCRIBE_ITEM || result.status !== "no") return result;
	const { fullExam, zonesSeen, otoscopies } = extracted;
	const looked = otoscopies.find(
		(a) =>
			(a.hotspotTimesMs.conducto ?? 0) >= MIN_LOOK_MS ||
			(a.hotspotTimesMs.timpano ?? 0) >= MIN_LOOK_MS,
	);
	const evidence =
		fullExam && zonesSeen.length > 0
			? {
					examActionId: fullExam.id,
					quote: `viste ${zonesSeen.join(", ")} pero no lo describiste`,
				}
			: looked
				? {
						examActionId: looked.id,
						quote: "miraste el oído pero no describiste lo que viste",
					}
				: null;
	return evidence
		? { ...result, status: "parcial", evidence: [evidence] }
		: result;
}

// Lo que tenía que describir: el hallazgo de la boca bien abierta o, si hizo
// otoscopia, el de los oídos. Sin examen que lo muestre, null.
export function expectedFinding(
	input: EvaluationInput,
	extracted: Extracted,
): string | null {
	const { clinicalCase } = input;
	if (extracted.fullExam)
		return clinicalCase.exam[extracted.fullExam.zone]?.expected ?? null;
	if (extracted.otoscopies.length > 0)
		return describeEars(
			otoscopyScenario(
				clinicalCase.templateId ?? clinicalCase.id,
				clinicalCase.patient.age,
			),
		);
	return null;
}

function judgeExamAction(
	base: Omit<ItemResult, "status" | "evidence">,
	extracted: Extracted,
): ItemResult {
	const { fullExam, partialExam } = extracted;
	if (!fullExam) {
		return partialExam
			? {
					...base,
					status: "parcial",
					evidence: [
						{ examActionId: partialExam.id, quote: "solo apertura parcial" },
					],
				}
			: { ...base, status: "no", evidence: [] };
	}
	return {
		...base,
		status: extracted.zoneCoverage >= 0.66 ? "si" : "parcial",
		evidence: [
			{
				examActionId: fullExam.id,
				quote: `zonas vistas: ${extracted.zonesSeen.join(", ") || "ninguna"}`,
			},
		],
	};
}

// Presión: sí con técnica sin errores y PAS y PAD bien marcadas; parcial si
// midió con errores.
function judgeBloodPressure(
	base: Omit<ItemResult, "status" | "evidence">,
	extracted: Extracted,
): ItemResult {
	const { bp } = extracted;
	if (!bp?.marked) return { ...base, status: "no", evidence: [] };
	const wellRead =
		Math.abs(bp.marked.pas - bp.shown.pas) <= MARK_TOLERANCE &&
		Math.abs(bp.marked.pad - bp.shown.pad) <= MARK_TOLERANCE;
	const clean = bp.techniqueErrors.length === 0 && wellRead;
	return {
		...base,
		status: clean ? "si" : "parcial",
		evidence: [
			{
				examActionId: bp.id,
				quote: `marcó ${bp.marked.pas}/${bp.marked.pad} con ${bp.techniqueErrors.length} errores de técnica`,
			},
		],
	};
}

// Otoscopia: sí si algún oído se examinó sin errores; parcial si hubo errores.
function judgeOtoscopy(
	base: Omit<ItemResult, "status" | "evidence">,
	extracted: Extracted,
): ItemResult {
	const done = extracted.otoscopies;
	if (done.length === 0) return { ...base, status: "no", evidence: [] };
	const clean = done.find((a) => a.technique?.errors.length === 0);
	const shown = clean ?? done[0];
	return {
		...base,
		status: clean ? "si" : "parcial",
		evidence: shown
			? [
					{
						examActionId: shown.id,
						quote: `${shown.zone}: ${shown.technique?.errors.length ?? 0} errores de técnica`,
					},
				]
			: [],
	};
}

// Signos de alarma: qué signos descartó y con qué turno. Explicarlos como
// motivo para volver ("si te falta el aire, volvé") es una indicación, no
// descartarlos: esos turnos (los del ítem reconsulta del caso) no cuentan.
export function alarmSignsAsked(input: EvaluationInput, extracted: Extracted) {
	const advice =
		input.clinicalCase.expectedChecklist.find((i) => i.id === "reconsulta")
			?.keywords ?? [];
	const asked = extracted.studentTurns.filter(
		(t) => !advice.some((k) => hasKeyword(t.text, k)),
	);
	return ALARM_SIGNS.flatMap(({ sign, keywords }) => {
		const turn = findTurn(asked, keywords);
		return turn ? [{ sign, turn }] : [];
	});
}

function judgeAlarmSigns(
	base: Omit<ItemResult, "status" | "evidence">,
	input: EvaluationInput,
	extracted: Extracted,
): ItemResult {
	const asked = alarmSignsAsked(input, extracted);
	if (asked.length === 0) return { ...base, status: "no", evidence: [] };
	const turns = [...new Map(asked.map((a) => [a.turn.id, a.turn])).values()];
	return {
		...base,
		status: asked.length >= MIN_ALARM_SIGNS ? "si" : "parcial",
		evidence: turns.slice(0, 3).map((t) => ({ turnId: t.id, quote: t.text })),
	};
}

// Ganglios: palparlos o preguntar por ellos (la especificación acepta las
// dos cosas).
function judgeNodes(
	item: ChecklistItem,
	base: Omit<ItemResult, "status" | "evidence">,
	extracted: Extracted,
): ItemResult {
	const palpation = extracted.neckPalpation;
	if (palpation)
		return {
			...base,
			status: "si",
			evidence: [{ examActionId: palpation.id, quote: "palpó el cuello" }],
		};
	const turn = findTurn(extracted.studentTurns, item.keywords);
	return turn
		? {
				...base,
				status: "si",
				evidence: [{ turnId: turn.id, quote: turn.text }],
			}
		: { ...base, status: "no", evidence: [] };
}

export function judgeItem(
	item: ChecklistItem,
	input: EvaluationInput,
	extracted: Extracted = extract(input),
): ItemResult {
	const base = {
		itemId: item.id,
		item: item.item,
		dimension: item.dimension,
		weight: item.weight,
	};
	if (item.id === "presion-arterial")
		return judgeBloodPressure(base, extracted);
	if (item.id === "otoscopia") return judgeOtoscopy(base, extracted);
	if (item.id === ALARM_ITEM) return judgeAlarmSigns(base, input, extracted);
	if (item.id === NODES_ITEM) return judgeNodes(item, base, extracted);
	if (ACTION_ITEMS.has(item.id)) return judgeExamAction(base, extracted);
	if (item.id === DESCRIBE_ITEM) return judgeDescription(item, base, extracted);

	const turn = findTurn(turnsForItem(item, extracted), item.keywords);
	return turn
		? {
				...base,
				status: "si",
				evidence: [{ turnId: turn.id, quote: turn.text }],
			}
		: { ...base, status: "no", evidence: [] };
}
