// Generador de pacientes a pedido: "dame un paciente con algo de garganta,
// que sea ansioso". Inventa a la persona y elige una plantilla clínica del
// banco. La IA (si hay clave) solo escribe a la persona, nunca lo clínico.
import "server-only";

import { z } from "zod";

import { type ClinicalCase, caseSchema } from "@/cases/schema";
import {
	CLINICAL_TEMPLATES,
	type ClinicalTemplate,
	OROFARINGE_CHECKLIST,
} from "@/cases/templates";
import { completeJson } from "@/server/ai";

import {
	ARCHETYPES,
	type Archetype,
	applyPersonalityRequest,
} from "./personalities";

export type GenerationRequest = { text: string; personalityKey?: string };

export class GenerationError extends Error {}

const FEMALE_NAMES = [
	"Valentina",
	"Camila",
	"Florencia",
	"Sofía",
	"Lucía",
	"Martina",
	"Carmen",
	"Graciela",
	"Rosa",
	"Ana",
];
const MALE_NAMES = [
	"Mateo",
	"Santiago",
	"Joaquín",
	"Nicolás",
	"Diego",
	"Juan",
	"Carlos",
	"Raúl",
	"Jorge",
	"Pablo",
];
const OCCUPATIONS = [
	"estudiante",
	"administrativo",
	"docente",
	"cocinero",
	"vendedor",
	"jubilado",
	"chofer",
	"enfermero",
	"programador",
	"peluquera",
];

function pick<T>(items: T[], rand: () => number): T {
	return items[Math.floor(rand() * items.length)] as T;
}

// Palabras muy cortas ("tos") como palabra entera: "todos" o "datos" no son tos.
function hasWord(text: string, w: string) {
	return w.length <= 3
		? new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "u").test(text)
		: text.includes(w);
}

function includesAny(text: string, words: string[]) {
	return words.some((w) => hasWord(text, w));
}

export function chooseTemplate(
	text: string,
	rand: () => number,
): ClinicalTemplate {
	const t = text.toLowerCase();
	const matches = CLINICAL_TEMPLATES.filter((tpl) =>
		includesAny(t, tpl.keywords),
	);
	if (matches.length === 0) {
		throw new GenerationError(
			'Por ahora solo hay casos de garganta. Probá con: "dame un paciente con dolor de garganta".',
		);
	}
	// Si pide catarro o tos, prioriza la plantilla que mejor coincide.
	const best = Math.max(
		...matches.map((m) => m.keywords.filter((k) => hasWord(t, k)).length),
	);
	return pick(
		matches.filter(
			(m) => m.keywords.filter((k) => hasWord(t, k)).length === best,
		),
		rand,
	);
}

export function chooseArchetype(text: string, explicitKey?: string): Archetype {
	const explicit = ARCHETYPES.find((a) => a.key === explicitKey);
	if (explicit) return explicit;
	const t = text.toLowerCase();
	return (
		ARCHETYPES.find((a) => includesAny(t, a.keywords)) ??
		(ARCHETYPES[0] as Archetype)
	);
}

function parseAge(text: string, archetype: Archetype, rand: () => number) {
	// "100 años" no tiene que leerse como "00 años".
	const match = text.match(/(?<!\d)(\d{1,3})\s*años/);
	if (match) return Math.max(16, Math.min(95, Number(match[1])));
	if (archetype.key === "mayor") return 68 + Math.floor(rand() * 15);
	return 18 + Math.floor(rand() * 40);
}

function parseSex(text: string, rand: () => number): "f" | "m" {
	const t = text.toLowerCase();
	// Bordes de palabra con letras acentuadas: \b no sirve para "él" ni "varón".
	const word = (alts: string) =>
		new RegExp(`(?<![\\p{L}])(${alts})(?![\\p{L}])`, "u");
	if (word("mujer|señora|chica|paciente femenina|ella").test(t)) return "f";
	if (word("hombre|señor|chico|varón|varon|él").test(t)) return "m";
	return rand() < 0.5 ? "f" : "m";
}

const personaSchema = z.object({
	name: z.string().min(2).max(30),
	occupation: z.string().min(2).max(40),
	chiefComplaint: z.string().min(5).max(120),
	profile: z.record(z.string(), z.string()),
});

// Sin IA (o si falla): persona al azar, con datos inventados.
function randomPersona(
	tpl: ClinicalTemplate,
	sex: "f" | "m",
	age: number,
	rand: () => number,
) {
	return {
		name: pick(sex === "f" ? FEMALE_NAMES : MALE_NAMES, rand),
		occupation: age >= 66 ? "jubilado" : pick(OCCUPATIONS, rand),
		chiefComplaint: pick(tpl.chiefComplaints, rand),
		profile: {
			edad: `${age} años`,
			vive: rand() < 0.5 ? "con mi familia" : "solo",
		},
	};
}

async function aiPersona(
	request: string,
	tpl: ClinicalTemplate,
	archetype: Archetype,
	sex: "f" | "m",
	age: number,
) {
	const result = await completeJson(
		[
			"Inventá una persona ficticia para un caso de práctica de entrevista clínica en Uruguay.",
			"Devolvé solo JSON con: name (solo nombre de pila, común en Uruguay), occupation, chiefComplaint (motivo de consulta con sus palabras, en voseo), profile (3 o 4 datos sociales breves: con quién vive, trabajo, etc.).",
			"No incluyas diagnósticos, síntomas nuevos, medicación ni datos reales de nadie.",
			`Pedido del estudiante: "${request}".`,
			`Sexo: ${sex === "f" ? "mujer" : "hombre"}. Edad: ${age}. Personalidad: ${archetype.label}.`,
			`Motivo de consulta de referencia: "${tpl.chiefComplaints[0]}".`,
		].join("\n"),
		personaSchema,
	);
	return result;
}

export async function generateCase(
	req: GenerationRequest,
	rand: () => number = Math.random,
): Promise<{ clinicalCase: ClinicalCase; personalityKey: string }> {
	const tpl = chooseTemplate(req.text, rand);
	const archetype = chooseArchetype(req.text, req.personalityKey);
	const age = parseAge(req.text, archetype, rand);
	const sex = parseSex(req.text, rand);
	const persona =
		(await aiPersona(req.text, tpl, archetype, sex, age).catch(() => null)) ??
		randomPersona(tpl, sex, age, rand);

	// Arquetipo más los ajustes pedidos con palabras ("que hable mucho").
	const { personality, notes } = applyPersonalityRequest(
		req.text,
		archetype.personality,
	);

	const id = `gen-${tpl.id}-${Date.now().toString(36)}${Math.floor(rand() * 1e4).toString(36)}`;
	const clinicalCase = caseSchema.parse({
		id,
		title: tpl.title,
		origin: "generado",
		reviewedBy: null,
		patient: { name: persona.name, age, occupation: persona.occupation },
		personality,
		personalityStyle: [archetype.style, ...notes].join(" "),
		chiefComplaint: persona.chiefComplaint,
		profile: {
			...persona.profile,
			edad: `${age} años`,
			ocupacion: persona.occupation,
		},
		hiddenHistory: tpl.hiddenHistory,
		vitals: tpl.vitals,
		exam: tpl.exam,
		expectedChecklist: OROFARINGE_CHECKLIST,
		notApplicable: [
			"gineco-obstetricos",
			"palpacion-cv",
			"contacto-ocular",
			"expresion-facial",
		],
		criticalErrors: tpl.criticalErrors,
		truth: tpl.truth,
	});
	// "caso": la sesión usa la personalidad ya ajustada del caso generado.
	return { clinicalCase, personalityKey: "caso" };
}
