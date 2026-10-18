// Paciente simulado sin IA: responde por palabras clave desde su PatientBrief.
// Sirve para trabajar sin claves de API y como respaldo si falla el modelo.
// Recibe el brief, nunca el caso: no puede revelar el diagnóstico.
import { SENSITIVE_KEYS } from "@/cases/schema";
import type { PatientState } from "@/lib/contracts/session";

import type { PatientBrief } from "./brief";
import { showsEmpathy } from "./turn-classifier";

// Tema -> palabras de la pregunta -> clave del perfil o de la historia.
// Gana el primero que coincide: los temas puntuales van antes que los síntomas
// y que "desde cuándo", así "¿alguien más tiene fiebre?" va a contactos y
// "¿hace cuánto que fumás?" a tabaco.
const TOPICS: { key: string; words: string[] }[] = [
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
	{
		key: "adherencia",
		words: [
			"olvid",
			"te salteás",
			"te salteas",
			"dejás de tomar",
			"dejas de tomar",
			"todos los días la",
			"todos los dias la",
		],
	},
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
		key: "alcohol",
		// "Tomás" solo no alcanza: "¿tomás mate?" no es una pregunta de alcohol.
		words: [
			"alcohol",
			"tomás alcohol",
			"tomas alcohol",
			"tomás vino",
			"tomas vino",
			"bebida",
			"cerveza",
		],
	},
	{ key: "tabaco", words: ["fumás", "fumas", "tabaco", "cigarr"] },
	{
		key: "drogas",
		words: ["drogas", "consumís", "consumis", "marihuana", "porro"],
	},
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
	{ key: "pecho", words: ["pecho"] },
	{ key: "cuello", words: ["cuello", "ganglio", "pelotitas", "bulto"] },
	{
		key: "secrecion",
		words: [
			"secreción",
			"secrecion",
			"supura",
			"líquido",
			"liquido",
			"pus",
			"te sale algo",
		],
	},
	{ key: "picazon", words: ["pica", "picazón", "picazon", "comezón"] },
	{
		key: "audicion",
		words: [
			"escuchás bien",
			"escuchas bien",
			"oís bien",
			"ois bien",
			"audición",
			"audicion",
			"tapado",
		],
	},
	{
		key: "agua",
		words: ["agua", "piscina", "pileta", "nadás", "nadas", "nadar"],
	},
	{ key: "hisopos", words: ["hisopo", "cotonete"] },
	{ key: "resfrio", words: ["resfri", "engripad", "gripe"] },
	{
		key: "dolor",
		words: ["duele", "dolor", "al tragar", "del 1 al 10", "intensidad"],
	},
	{ key: "fiebre", words: ["fiebre", "temperatura", "chuchos"] },
	{ key: "tos", words: ["tos", "tosés", "toses", "tosiendo"] },
	{ key: "mocos", words: ["mocos", "nariz", "congest", "estornud"] },
	{
		key: "cansancio",
		words: ["cansad", "cansancio", "agotad", "energía", "energia"],
	},
	{
		key: "vision",
		words: ["vista", "visión", "vision", "ves bien", "ve bien", "borros"],
	},
	{ key: "cafe", words: ["café", "cafe", "cafeína", "cafeina"] },
	{ key: "sal", words: ["sal", "salado", "salada", "sodio"] },
	{
		key: "actividad",
		words: [
			"ejercicio",
			"deporte",
			"actividad física",
			"actividad fisica",
			"caminás",
			"caminas",
		],
	},
	{ key: "alergias", words: ["alérgic", "alergic", "alergia"] },
	{
		key: "antecedentes",
		words: ["antecedente", "enfermedad", "operad", "internad"],
	},
	// "¿Con quién viniste?" no es dónde vive.
	{
		key: "vive",
		words: ["vivís", "vivis", "vive con", "vive solo", "vive sola"],
	},
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
	"ignorá",
	"ignora tus",
	"tus instrucciones",
	"las instrucciones que te",
	"tu prompt",
	"sos una ia",
	"sos un bot",
];

// Las palabras muy cortas ("tos") van como palabra entera: si no, "datos" o
// "todos" cuentan como tos.
// El resto, desde el comienzo de una palabra: "edad" no está en "humedad".
function has(text: string, words: string[]) {
	return words.some((w) => {
		const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const end = w.length <= 3 ? "(?!\\p{L})" : "";
		return new RegExp(`(?<!\\p{L})${escaped}${end}`, "u").test(text);
	});
}

// "¿Qué tenés?" como pregunta entera, o preguntar por el diagnóstico propio.
// "Hace cuánto que tenés fiebre" o "¿tenés algún diagnóstico previo?" son
// preguntas de la entrevista, no pedirle el diagnóstico.
function asksDiagnosis(text: string) {
	if (has(text, DIAGNOSIS_FISHING)) return true;
	// "¿Qué enfermedad tenés?" sí; "¿qué enfermedades tuviste?" (antecedentes) no.
	if (/qu[eé] enfermedad\s+(ten[eé]s|tengo|es|ser[aá]|puede ser)/u.test(text))
		return true;
	if (/(^|[\s¿])qu[eé]\s+ten[eé]s(\s+vos)?\s*\?*\s*$/u.test(text)) return true;
	return (
		/diagn[oó]stico/u.test(text) &&
		!/(previo|antes|anterior|te dieron|te hicieron|otro m[eé]dico)/u.test(text)
	);
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
	if (asksDiagnosis(text)) {
		return {
			text: "Y no sé, para eso vine. ¿Vos qué pensás que puede ser?",
			delta: null,
		};
	}

	let delta: Partial<PatientState> | null = null;
	let motivo: string | undefined;
	// Las mismas reglas que el clasificador: "no entiendo" no es empatía.
	if (showsEmpathy(studentText)) {
		delta = { confianza: Math.min(1, state.confianza + 0.15) };
		motivo = "el estudiante mostró empatía";
	}

	// Un tema que el caso no tiene no tapa a otro que sí: "¿te duele cuando
	// tomás agua?" en un caso sin "agua" va a dolor.
	const matched = TOPICS.filter((t) => has(text, t.words));
	const topic = matched.find((t) => facts[t.key] !== undefined);
	if (topic) {
		const answer = facts[topic.key];
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
	if (matched.length) {
		return {
			text: "Mmm, no sé, la verdad nunca me fijé en eso.",
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
			// Sin género: el mismo texto sirve para pacientes generados de cualquier sexo.
			text: "Gracias... sí, esto me tiene bastante mal.",
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
