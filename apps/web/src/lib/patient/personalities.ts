// Arquetipos de personalidad (plan.md, sección 5). Son independientes del caso:
// el mismo caso con otra personalidad es otra consulta.
import type { Personality } from "@/cases/schema";
import type { Mood } from "@/lib/avatar/commands";

export type Archetype = {
	key: string;
	label: string;
	description: string;
	personality: Personality;
	// Cómo habla, para el prompt y el paciente simulado sin IA. Incluye el
	// tono de voz: la voz de Gemini lo sigue.
	style: string;
	// Palabras con las que alguien lo pide en el generador.
	keywords: string[];
	// Expresión de base del avatar (Persona 3); el ánimo de la consulta la
	// puede cambiar (lib/avatar/mood.ts).
	mood: Mood;
	// Voz de Gemini Live acorde, por sexo del paciente (lib/patient/voices.ts).
	voice: { f: string; m: string };
	// Fuera del menú de Casos: solo la usa el generador (un paciente mayor).
	hidden?: boolean;
};

export const ARCHETYPES: Archetype[] = [
	{
		key: "directo",
		label: "Tranquilo",
		description: "Responde claro y colabora, algo preocupado.",
		mood: "neutral",
		voice: { f: "Aoede", m: "Charon" },
		personality: {
			cooperacion: 0.9,
			ansiedad: 0.3,
			locuacidad: 0.6,
			desconfianza: 0.1,
			paciencia: 0.7,
			audicion: "normal",
			vocabulario: "simple",
		},
		style:
			"Responde claro y corto, con voseo, algo preocupado. Tono de voz calmo y amable.",
		keywords: ["directo", "colaborador", "tranquilo", "normal", "fácil"],
	},
	{
		key: "ansioso",
		label: "Ansioso",
		description: "Pregunta si es grave, habla rápido.",
		mood: "fear",
		voice: { f: "Leda", m: "Fenrir" },
		personality: {
			cooperacion: 0.7,
			ansiedad: 0.9,
			locuacidad: 0.8,
			desconfianza: 0.3,
			paciencia: 0.4,
			audicion: "normal",
			vocabulario: "simple",
		},
		style:
			"Habla rápido, repite sus preocupaciones y pregunta seguido si es grave. Tono de voz nervioso y acelerado, con la respiración agitada.",
		keywords: ["ansios", "nervios", "preocupad", "asustad", "miedo"],
	},
	{
		key: "enojado",
		label: "Enojado",
		description:
			"Molesto por la espera y el dolor; se calma si lo tratan bien.",
		mood: "angry",
		voice: { f: "Kore", m: "Orus" },
		personality: {
			cooperacion: 0.5,
			ansiedad: 0.3,
			locuacidad: 0.5,
			desconfianza: 0.5,
			paciencia: 0.15,
			audicion: "normal",
			vocabulario: "simple",
		},
		style:
			"Está enojado: esperó mucho y está harto de la molestia. Se queja, contesta cortante y a veces levanta la voz. Si lo escuchan y le explican con respeto, se va calmando. Tono de voz enojado, firme y tenso.",
		// Sin "molest": "me molesta la garganta" es un síntoma, no un enojo.
		keywords: ["enojad", "furios", "irritad", "cabread", "de mal humor"],
	},
	{
		key: "feliz",
		label: "Feliz",
		description: "De buen humor, charla y hace chistes.",
		mood: "happy",
		voice: { f: "Zephyr", m: "Puck" },
		personality: {
			cooperacion: 0.95,
			ansiedad: 0.1,
			locuacidad: 0.8,
			desconfianza: 0.05,
			paciencia: 0.9,
			audicion: "normal",
			vocabulario: "simple",
		},
		style:
			"Está de buen humor: simpático, hace algún chiste y le quita un poco de importancia a lo que le pasa, aunque contesta todo. Tono de voz alegre y cálido, con sonrisa.",
		keywords: ["feliz", "alegre", "contento", "buen humor", "simpátic"],
	},
	{
		key: "triste",
		label: "Triste",
		description: "Desanimado, habla poco y bajo.",
		mood: "sad",
		voice: { f: "Aoede", m: "Charon" },
		personality: {
			cooperacion: 0.7,
			ansiedad: 0.4,
			locuacidad: 0.3,
			desconfianza: 0.2,
			paciencia: 0.6,
			audicion: "normal",
			vocabulario: "simple",
		},
		style:
			"Está triste y desanimado: contesta corto, suspira y se lo nota cansado. Tono de voz bajo, lento y apagado.",
		keywords: ["triste", "deprimid", "bajonead", "desanimad", "decaíd"],
	},
	{
		key: "mayor",
		label: "Adulto mayor con audición reducida",
		// El equipo la sacó del menú (Persona 3); el generador la sigue usando.
		hidden: true,
		description: "Divaga, hay que repetir.",
		mood: "neutral",
		voice: { f: "Aoede", m: "Charon" },
		personality: {
			cooperacion: 0.8,
			ansiedad: 0.4,
			locuacidad: 0.9,
			desconfianza: 0.2,
			paciencia: 0.6,
			audicion: "reducida",
			vocabulario: "simple",
		},
		style:
			"Habla lento, se va por las ramas y a veces pide que le repitan porque no escucha bien. Tono de voz pausado, de persona mayor.",
		keywords: ["mayor", "viej", "anciano", "abuel", "sordo", "no escucha"],
	},
	{
		key: "hostil",
		label: "Desconfiado",
		description: "Mala onda, no quiere abrir la boca.",
		mood: "disgust",
		voice: { f: "Kore", m: "Orus" },
		personality: {
			cooperacion: 0.2,
			ansiedad: 0.4,
			locuacidad: 0.2,
			desconfianza: 0.8,
			paciencia: 0.3,
			audicion: "normal",
			vocabulario: "simple",
		},
		style:
			"Seco, respuestas cortas y desconfiadas. No se deja examinar hasta que le expliquen para qué y le pidan permiso. Tono de voz seco y desganado.",
		keywords: ["hostil", "mala onda", "difícil", "desconfiad", "agresiv"],
	},
];

export function getArchetype(key: string): Archetype | undefined {
	return ARCHETYPES.find((a) => a.key === key);
}

// Ajustes de personalidad pedidos con palabras ("que no quiera abrir la
// boca", "que hable mucho"). Cada uno cambia un parámetro y suma una nota al
// estilo para el prompt.
const PERSONALITY_TWEAKS: {
	words: string[];
	apply: Partial<Personality>;
	note: string;
}[] = [
	{
		words: [
			"no quiera abrir",
			"no quiere abrir",
			"no se deje examinar",
			"no se deja examinar",
			"poco colaborador",
			"nada colaborador",
			"no colabora",
			"que no colabore",
			"poco amable",
			"nada amable",
		],
		apply: { cooperacion: 0.2 },
		note: "No te dejás examinar hasta que te expliquen para qué y te pidan permiso.",
	},
	{
		words: ["colaborador", "amable", "que colabore"],
		apply: { cooperacion: 0.9 },
		note: "Colaborás con todo lo que te piden.",
	},
	{
		words: [
			"hable mucho",
			"habla mucho",
			"charlat",
			"por las ramas",
			"cuente de más",
		],
		apply: { locuacidad: 0.95 },
		note: "Hablás de más y te vas por las ramas.",
	},
	{
		words: [
			"hable poco",
			"habla poco",
			"no hable mucho",
			"no habla mucho",
			"callad",
			"monosílab",
			"cortante",
		],
		apply: { locuacidad: 0.15 },
		note: "Respondés con muy pocas palabras.",
	},
	{
		words: ["no escuch", "sord", "escucha mal"],
		apply: { audicion: "reducida" },
		note: "No escuchás bien y pedís que te repitan.",
	},
	{
		words: ["impacient", "apurad", "con prisa"],
		apply: { paciencia: 0.15 },
		note: "Estás apurado y te impacientás si tardan.",
	},
	{
		words: ["desconfiad", "que no cuente", "oculte"],
		apply: { desconfianza: 0.85 },
		note: "Desconfiás y no contás datos íntimos hasta sentirte en confianza.",
	},
	{
		words: ["muy ansios", "muy nervios", "asustadísim", "ansios", "nervios"],
		apply: { ansiedad: 0.95 },
		note: "Estás muy nervioso y preguntás seguido si es grave.",
	},
];

// Si el texto pide esto, sin negarlo antes: "colaborador" en "poco (o nada)
// colaborador" o "hable mucho" en "que no hable mucho" no cuentan.
const NEGATIONS = ["no", "poco", "nada", "sin", "nunca", "ni"];

export function mentions(text: string, word: string) {
	let from = 0;
	for (;;) {
		const i = text.indexOf(word, from);
		if (i === -1) return false;
		const before = text.slice(0, i).trim().split(/\s+/).at(-1) ?? "";
		if (word.startsWith("no ") || !NEGATIONS.includes(before)) return true;
		from = i + word.length;
	}
}

export function applyPersonalityRequest(
	text: string,
	base: Personality,
): { personality: Personality; notes: string[] } {
	const t = text.toLowerCase();
	let personality = { ...base };
	const notes: string[] = [];
	for (const tweak of PERSONALITY_TWEAKS) {
		if (tweak.words.some((w) => mentions(t, w))) {
			personality = { ...personality, ...tweak.apply };
			notes.push(tweak.note);
		}
	}
	return { personality, notes };
}

// "caso" usa la personalidad propia del caso.
export function resolvePersonality(
	key: string,
	casePersonality: Personality,
	caseStyle?: string,
): { key: string; personality: Personality; style: string } {
	const archetype = getArchetype(key);
	if (archetype) {
		return {
			key: archetype.key,
			personality: archetype.personality,
			style: archetype.style,
		};
	}
	return {
		key: "caso",
		personality: casePersonality,
		style: caseStyle ?? "Responde con voseo rioplatense, frases cortas.",
	};
}
