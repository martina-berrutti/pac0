// Arquetipos de personalidad (plan.md, sección 5). Son independientes del caso:
// el mismo caso con otra personalidad es otra consulta.
import type { Personality } from "@/cases/schema";

export type Archetype = {
	key: string;
	label: string;
	description: string;
	personality: Personality;
	// Cómo habla, para el prompt y el paciente simulado sin IA.
	style: string;
	// Palabras con las que alguien lo pide en el generador.
	keywords: string[];
};

export const ARCHETYPES: Archetype[] = [
	{
		key: "directo",
		label: "Directo y colaborador",
		description: "Responde claro, algo preocupado.",
		personality: {
			cooperacion: 0.9,
			ansiedad: 0.3,
			locuacidad: 0.6,
			desconfianza: 0.1,
			paciencia: 0.7,
			audicion: "normal",
			vocabulario: "simple",
		},
		style: "Responde claro y corto, con voseo, algo preocupado.",
		keywords: ["directo", "colaborador", "tranquilo", "normal", "fácil"],
	},
	{
		key: "ansioso",
		label: "Ansioso",
		description: "Pregunta si es grave, habla rápido.",
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
			"Habla rápido, repite sus preocupaciones y pregunta seguido si es grave.",
		keywords: ["ansios", "nervios", "preocupad", "asustad", "miedo"],
	},
	{
		key: "mayor",
		label: "Adulto mayor con audición reducida",
		description: "Divaga, hay que repetir.",
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
			"Habla lento, se va por las ramas y a veces pide que le repitan porque no escucha bien.",
		keywords: ["mayor", "viej", "anciano", "abuel", "sordo", "no escucha"],
	},
	{
		key: "hostil",
		label: "Hostil o mala onda",
		description: "Desconfiado, no quiere abrir la boca.",
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
			"Seco, respuestas cortas y desconfiadas. No se deja examinar hasta que le expliquen para qué y le pidan permiso.",
		keywords: [
			"hostil",
			"mala onda",
			"enojad",
			"difícil",
			"desconfiad",
			"agresiv",
		],
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
		words: ["hable poco", "habla poco", "callad", "monosílab", "cortante"],
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
		words: ["muy ansios", "muy nervios", "asustadísim"],
		apply: { ansiedad: 0.95 },
		note: "Estás muy nervioso y preguntás seguido si es grave.",
	},
];

export function applyPersonalityRequest(
	text: string,
	base: Personality,
): { personality: Personality; notes: string[] } {
	const t = text.toLowerCase();
	let personality = { ...base };
	const notes: string[] = [];
	for (const tweak of PERSONALITY_TWEAKS) {
		if (tweak.words.some((w) => t.includes(w))) {
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
