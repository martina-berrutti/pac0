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

// "caso" usa la personalidad propia del caso.
export function resolvePersonality(
	key: string,
	casePersonality: Personality,
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
		style: "Responde con voseo rioplatense, frases cortas.",
	};
}
