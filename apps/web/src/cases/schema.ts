// Forma de un caso clínico (plan.md, sección 7). Contrato entre la Persona 1
// (motor del paciente) y la Persona 3 (casos): cambios, por mensaje.
import { z } from "zod";

export const DIMENSIONS = [
	"anamnesis",
	"examen",
	"razonamiento",
	"comunicacion",
] as const;
export const dimensionSchema = z.enum(DIMENSIONS);
export type Dimension = z.infer<typeof dimensionSchema>;

const unit = z.number().min(0).max(1);

export const personalitySchema = z.object({
	cooperacion: unit,
	ansiedad: unit,
	locuacidad: unit,
	desconfianza: unit,
	paciencia: unit,
	audicion: z.enum(["normal", "reducida"]),
	vocabulario: z.enum(["simple", "medio"]).default("simple"),
});
export type Personality = z.infer<typeof personalitySchema>;

export const examZoneSchema = z.object({
	// Variante de apertura -> clave del asset ("parcial" -> "mouth-partial-01").
	variants: z.object({ parcial: z.string(), completa: z.string() }),
	hotspots: z.array(z.string()).min(1),
	expected: z.string(),
});

export const checklistItemSchema = z.object({
	id: z.string(),
	item: z.string(),
	dimension: dimensionSchema,
	// Esencial 3, importante 2, complementario 1.
	weight: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	// Palabras que usa el juez simple (sin IA) para buscar evidencia en los
	// turnos del estudiante. El juez con IA las ignora.
	keywords: z.array(z.string()).default([]),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

// Datos que el paciente solo cuenta si la confianza es alta.
export const SENSITIVE_KEYS = ["alcohol", "tabaco", "drogas", "sexualidad"];

// Exámenes que tiene la pantalla. En cualquier caso se puede hacer cualquiera;
// los que no son del problema del paciente restan un punto (lib/scoring).
export const EXAM_KINDS = ["orofaringe", "oido", "presion"] as const;
export type ExamKind = (typeof EXAM_KINDS)[number];

// Dónde le duele a la paciente (rodilla). No es el diagnóstico: puede ir al
// navegador, para el "tocá donde te duele".
export const painZoneSchema = z.object({
	side: z.enum(["izquierda", "derecha"]),
	spot: z.enum(["interna", "externa", "anterior"]),
});
export type PainZone = z.infer<typeof painZoneSchema>;

export const caseSchema = z.object({
	id: z.string().regex(/^[a-z0-9-]+$/),
	title: z.string(),
	// Mismo paciente con varios problemas: el estudiante elige el paciente y
	// después el problema. El nombre del problema no dice el diagnóstico.
	group: z.string().optional(),
	problem: z.string().optional(),
	// Exámenes que tienen que ver con el problema. Vacío: no se penaliza
	// ninguno (casos generados).
	relevantExams: z.array(z.enum(EXAM_KINDS)).default([]),
	// banco: escrito por el equipo; generado: lo armó el generador a pedido.
	origin: z.enum(["banco", "generado"]).default("banco"),
	// Plantilla de la que salió un caso generado. Solo en el servidor: el nombre
	// de la plantilla es el diagnóstico, así que no va en el id ni en el resumen.
	templateId: z.string().optional(),
	// Cuándo se generó (ms): el tope de pacientes generados es por día.
	createdAt: z.number().optional(),
	// Nadie lo revisó todavía si es null (AGENTS.md: lo valida un médico o un
	// estudiante avanzado).
	reviewedBy: z.string().nullable().default(null),
	patient: z.object({
		name: z.string(),
		age: z.number().int().positive(),
		occupation: z.string(),
		// Para elegir una voz acorde (lib/patient/voices.ts).
		sex: z.enum(["f", "m"]).optional(),
	}),
	personality: personalitySchema,
	painZone: painZoneSchema.optional(),
	// Cómo habla con la personalidad propia del caso (opcional).
	personalityStyle: z.string().optional(),
	chiefComplaint: z.string(),
	profile: z.record(z.string(), z.string()),
	hiddenHistory: z.record(z.string(), z.string()),
	// Variación controlada (plan.md, sección 7): para cada clave de
	// hiddenHistory, opciones que se sortean al empezar sin cambiar el
	// diagnóstico. Las define y valida el docente.
	variations: z.record(z.string(), z.array(z.string()).min(1)).default({}),
	vitals: z.object({
		pa: z.tuple([z.number(), z.number()]),
		fc: z.number(),
		fr: z.number(),
		tax: z.number(),
	}),
	exam: z.record(z.string(), examZoneSchema),
	expectedChecklist: z.array(checklistItemSchema).min(1),
	notApplicable: z.array(z.string()).default([]),
	criticalErrors: z.array(z.string()).default([]),
	// Solo se lee en el servidor (src/server, src/lib/scoring). Nunca va al
	// navegador ni al prompt del paciente.
	truth: z.object({
		diagnosis: z.string(),
		acceptable: z.array(z.string()),
		differentials: z.array(z.string()),
		// Datos que llevan al diagnóstico, para el informe (lib/scoring/
		// diagnosis.ts). Se encuentra si el ítem itemId de la lista de cotejo se
		// cumplió; keywords sirven para ver si el cierre lo usa como argumento.
		keyClues: z
			.array(
				z.object({
					itemId: z.string(),
					clue: z.string(),
					why: z.string(),
					keywords: z.array(z.string()).default([]),
				}),
			)
			.default([]),
		// Por diferencial: qué lo distingue del diagnóstico del caso.
		differentialHints: z.record(z.string(), z.string()).default({}),
		// Palabras de una conducta o estudio razonable para este caso. Vacío:
		// las de garganta (test rápido, hisopado).
		conduct: z.array(z.string()).default([]),
	}),
});
export type ClinicalCase = z.infer<typeof caseSchema>;
export type CaseInput = z.input<typeof caseSchema>;

// Lo único que el navegador ve de un caso para elegirlo.
export type CaseSummary = {
	id: string;
	title: string;
	group?: string;
	problem?: string;
	origin: ClinicalCase["origin"];
	reviewed: boolean;
	patient: { name: string; age: number };
	chiefComplaint: string;
	painZone?: PainZone;
};

export function toSummary(c: ClinicalCase): CaseSummary {
	return {
		id: c.id,
		title: c.title,
		group: c.group,
		problem: c.problem,
		origin: c.origin,
		reviewed: c.reviewedBy !== null,
		patient: { name: c.patient.name, age: c.patient.age },
		chiefComplaint: c.chiefComplaint,
		painZone: c.painZone,
	};
}
