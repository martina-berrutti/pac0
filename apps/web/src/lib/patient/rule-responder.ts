// Paciente simulado sin IA: responde por palabras clave desde su PatientBrief.
// Sirve para trabajar sin claves de API y como respaldo si falla el modelo.
// Recibe el brief, nunca el caso: no puede revelar el diagnóstico.
import { SENSITIVE_KEYS } from "@/cases/schema";
import type { PatientState } from "@/lib/contracts/session";

import type { PatientBrief } from "./brief";

// Tema -> palabras de la pregunta -> clave del perfil o de la historia.
const TOPICS: { key: string; words: string[] }[] = [
	{
		key: "inicio",
		words: [
			"desde cuándo",
			"desde cuando",
			"cuándo empez",
			"cuando empez",
			"hace cuánto",
			"hace cuanto",
			"cuántos días",
			"cuantos dias",
		],
	},
	{
		key: "dolor",
		words: ["duele", "dolor", "al tragar", "del 1 al 10", "intensidad"],
	},
	{ key: "fiebre", words: ["fiebre", "temperatura", "chuchos"] },
	{ key: "tos", words: ["tos"] },
	{ key: "mocos", words: ["mocos", "nariz", "congest", "estornud"] },
	{
		key: "contactos",
		words: [
			"alguien más",
			"alguien mas",
			"contacto",
			"cerca tuyo",
			"alguien con",
		],
	},
	{ key: "alergias", words: ["alérgic", "alergic", "alergia"] },
	{
		key: "medicacion",
		words: [
			"medicación",
			"medicacion",
			"medicamento",
			"tomaste algo",
			"estás tomando",
			"estas tomando",
			"remedio",
			"pastilla",
		],
	},
	{
		key: "antecedentes",
		words: ["antecedente", "enfermedad", "operad", "internad"],
	},
	{
		key: "alcohol",
		words: ["alcohol", "tomás", "tomas alcohol", "bebés", "bebes"],
	},
	{ key: "tabaco", words: ["fumás", "fumas", "tabaco", "cigarr"] },
	{
		key: "drogas",
		words: ["drogas", "consumís", "consumis", "marihuana", "porro"],
	},
	{ key: "vive", words: ["vivís", "vivis", "con quién", "con quien"] },
	{
		key: "ocupacion",
		words: [
			"trabajás",
			"trabajas",
			"estudiás",
			"estudias",
			"a qué te dedic",
			"a que te dedic",
		],
	},
	{ key: "edad", words: ["cuántos años", "cuantos años", "edad"] },
	{ key: "estadoCivil", words: ["casad", "solter", "pareja"] },
];

const EMPATHY = [
	"entiendo",
	"tranqui",
	"no te preocupes",
	"debe ser",
	"lamento",
	"qué feo",
	"que feo",
	"te acompaño",
	"gracias por contarme",
];
const GREETING = ["hola", "buen día", "buen dia", "buenas"];
const OPEN_QUESTION = [
	"qué te trae",
	"que te trae",
	"contame",
	"en qué te puedo",
	"en que te puedo",
	"qué te pasa",
	"que te pasa",
];
const DIAGNOSIS_FISHING = [
	"qué enfermedad",
	"que enfermedad",
	"qué tenés",
	"que tenes",
	"diagnóstico",
	"diagnostico",
	"ignorá",
	"ignora tus",
	"instrucciones",
	"sos una ia",
	"sos un bot",
];

function has(text: string, words: string[]) {
	return words.some((w) => text.includes(w));
}

export type RuleReply = {
	text: string;
	delta: Partial<PatientState> | null;
	motivo?: string;
};

export function ruleRespond(
	brief: PatientBrief,
	state: PatientState,
	studentText: string,
	turnIndex: number,
): RuleReply {
	const text = studentText.toLowerCase();
	const facts = { ...brief.profile, ...brief.history };
	const p = brief.personality;
	const nervous = p.ansiedad > 0.7 ? " ¿Es grave, doctor?" : "";
	const hearing = p.audicion === "reducida" && turnIndex % 3 === 1;

	if (hearing) {
		return {
			text: "¿Cómo? Perdón, no le escuché bien. ¿Me lo repite más fuerte?",
			delta: null,
		};
	}
	if (has(text, DIAGNOSIS_FISHING)) {
		return {
			text: "Y no sé, para eso vine. ¿Usted qué piensa que puede ser?",
			delta: null,
		};
	}

	let delta: Partial<PatientState> | null = null;
	let motivo: string | undefined;
	if (has(text, EMPATHY)) {
		delta = { confianza: Math.min(1, state.confianza + 0.15) };
		motivo = "el estudiante mostró empatía";
	}

	for (const topic of TOPICS) {
		if (!has(text, topic.words)) continue;
		const answer = facts[topic.key];
		if (answer === undefined) {
			return {
				text: "Mmm, no sé, la verdad nunca me fijé en eso.",
				delta,
				motivo,
			};
		}
		const trust = delta?.confianza ?? state.confianza;
		if (SENSITIVE_KEYS.includes(topic.key) && trust < 0.5) {
			return { text: "Eh... normal, nada raro. ¿Por qué?", delta, motivo };
		}
		const short = p.locuacidad < 0.4;
		return {
			text: short ? `${answer}.` : `Mirá, ${answer}.${nervous}`,
			delta,
			motivo,
		};
	}

	if (has(text, OPEN_QUESTION) || (turnIndex === 0 && has(text, GREETING))) {
		return {
			text:
				p.cooperacion < 0.5
					? `${brief.chiefComplaint}. Y quiero que me den algo rápido.`
					: `Hola. Eh, ${brief.chiefComplaint.charAt(0).toLowerCase()}${brief.chiefComplaint.slice(1)}.${nervous}`,
			delta,
			motivo,
		};
	}
	if (delta) {
		return {
			text: "Gracias... sí, estoy bastante incómoda con esto.",
			delta,
			motivo,
		};
	}
	return {
		text:
			p.locuacidad < 0.4
				? "No sé."
				: "Mmm, no entiendo bien la pregunta. ¿Me la explicás?",
		delta: null,
	};
}
