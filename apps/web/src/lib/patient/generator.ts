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

import { asciiKey } from "./keys";

import {
	ARCHETYPES,
	type Archetype,
	applyPersonalityRequest,
	mentions,
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
const OCCUPATIONS = [
	"estudiante",
	"administrativa",
	"docente",
	"cocinera",
	"vendedora",
	"enfermera",
	"programadora",
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
			'Por ahora hay pacientes con dolor de garganta, dolor de oído o control de presión. Probá con: "dame un paciente con dolor de oído".',
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

// La personalidad que el pedido nombra (o la elegida a mano); null si no hay.
export function namedArchetype(
	text: string,
	explicitKey?: string,
): Archetype | null {
	const explicit = ARCHETYPES.find((a) => a.key === explicitKey);
	if (explicit) return explicit;
	const t = text.toLowerCase();
	return ARCHETYPES.find((a) => a.keywords.some((w) => mentions(t, w))) ?? null;
}

export function chooseArchetype(text: string, explicitKey?: string): Archetype {
	const explicit = ARCHETYPES.find((a) => a.key === explicitKey);
	if (explicit) return explicit;
	const t = text.toLowerCase();
	const asked = (a: Archetype) => a.keywords.some((w) => mentions(t, w));
	// "Una abuela ansiosa": la edad pesa más que el carácter (la ansiedad
	// se suma después como ajuste).
	const older = ARCHETYPES.find((a) => a.key === "mayor");
	if (older && asked(older)) return older;
	return ARCHETYPES.find(asked) ?? (ARCHETYPES[0] as Archetype);
}

function parseAge(
	text: string,
	archetype: Archetype,
	rand: () => number,
	minAge = 16,
) {
	// "100 años" no tiene que leerse como "00 años".
	// "Tos hace 2 años" es un dato de la historia, no la edad.
	const match = text.match(/(?<!hace\s+)(?<!\d)(\d{1,3})\s*años/);
	// La plantilla puede pedir una edad mínima (la historia tiene que cerrar).
	if (match) return Math.max(minAge, Math.min(95, Number(match[1])));
	if (archetype.key === "mayor") return 68 + Math.floor(rand() * 15);
	const from = Math.max(18, minAge);
	return from + Math.floor(rand() * Math.max(10, 58 - from));
}

export const personaSchema = z.object({
	name: z.string().min(2).max(30),
	occupation: z.string().min(2).max(40),
	chiefComplaint: z.string().min(5).max(120),
	// Va a las instrucciones del paciente: pocos datos y cortos, para que una
	// respuesta rara de la IA no infle el prompt ni le meta instrucciones.
	// La historia clínica de la plantilla igual gana (brief.ts la mezcla después).
	profile: z
		.record(z.string().max(30), z.string().max(120))
		// Claves en ASCII ("con quién vive" → "con_quien_vive"): Convex no acepta
		// otras como nombre de campo.
		.transform((p) =>
			Object.fromEntries(
				Object.entries(p)
					.slice(0, 6)
					.map(([k, v]) => [asciiKey(k), v]),
			),
		),
});

// Sin IA (o si falla): persona al azar, con datos inventados.
function randomPersona(tpl: ClinicalTemplate, age: number, rand: () => number) {
	return {
		name: pick(FEMALE_NAMES, rand),
		occupation: age >= 66 ? "jubilada" : pick(OCCUPATIONS, rand),
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
	age: number,
) {
	const result = await completeJson(
		[
			"Inventá una persona ficticia para un caso de práctica de entrevista clínica en Uruguay.",
			"Devolvé solo JSON con: name (solo nombre de pila, común en Uruguay), occupation, chiefComplaint (motivo de consulta con sus palabras, en voseo), profile (3 o 4 datos sociales breves: con quién vive, trabajo, etc.).",
			"No incluyas diagnósticos, síntomas nuevos, medicación ni datos reales de nadie.",
			`Pedido del estudiante: "${request}".`,
			`Sexo: mujer (siempre un nombre de mujer, aunque el pedido diga otra cosa). Edad: ${age}. Personalidad: ${archetype.label}.`,
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
	const age = parseAge(req.text, archetype, rand, tpl.minAge);
	// El avatar es una mujer: los pacientes generados son siempre mujeres.
	const sex = "f" as const;
	const persona =
		(await aiPersona(req.text, tpl, archetype, age).catch(() => null)) ??
		randomPersona(tpl, age, rand);

	// Arquetipo más los ajustes pedidos con palabras ("que hable mucho").
	const { personality, notes } = applyPersonalityRequest(
		req.text,
		archetype.personality,
	);

	// El id llega al navegador: no puede llevar el nombre de la plantilla (es
	// el diagnóstico). La plantilla queda en templateId, solo en el servidor.
	const id = `gen-${Date.now().toString(36)}${Math.floor(rand() * 1e6).toString(36)}`;
	const clinicalCase = caseSchema.parse({
		id,
		title: tpl.title,
		origin: "generado",
		templateId: tpl.id,
		createdAt: Date.now(),
		reviewedBy: null,
		patient: { name: persona.name, age, occupation: persona.occupation, sex },
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
		expectedChecklist: tpl.checklist ?? OROFARINGE_CHECKLIST,
		notApplicable: tpl.notApplicable ?? [
			"gineco-obstetricos",
			"palpacion-cv",
			"contacto-ocular",
			"expresion-facial",
		],
		criticalErrors: tpl.criticalErrors,
		truth: tpl.truth,
	});
	// Si el pedido nombra una personalidad, queda elegida en la tarjeta; si no,
	// "caso": la sesión usa la personalidad ya ajustada del caso generado.
	const named = namedArchetype(req.text, req.personalityKey);
	return { clinicalCase, personalityKey: named?.key ?? "caso" };
}
