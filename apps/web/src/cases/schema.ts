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

export const caseSchema = z.object({
	id: z.string().regex(/^[a-z0-9-]+$/),
	title: z.string(),
	// banco: escrito por el equipo; generado: lo armó el generador a pedido.
	origin: z.enum(["banco", "generado"]).default("banco"),
	// Nadie lo revisó todavía si es null (AGENTS.md: lo valida un médico o un
	// estudiante avanzado).
	reviewedBy: z.string().nullable().default(null),
	patient: z.object({
		name: z.string(),
		age: z.number().int().positive(),
		occupation: z.string(),
	}),
	personality: personalitySchema,
	chiefComplaint: z.string(),
	profile: z.record(z.string(), z.string()),
	hiddenHistory: z.record(z.string(), z.string()),
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
	}),
});
export type ClinicalCase = z.infer<typeof caseSchema>;
export type CaseInput = z.input<typeof caseSchema>;

// Lo único que el navegador ve de un caso para elegirlo.
export type CaseSummary = {
	id: string;
	title: string;
	origin: ClinicalCase["origin"];
	reviewed: boolean;
	patient: { name: string; age: number };
	chiefComplaint: string;
};

export function toSummary(c: ClinicalCase): CaseSummary {
	return {
		id: c.id,
		title: c.title,
		origin: c.origin,
		reviewed: c.reviewedBy !== null,
		patient: { name: c.patient.name, age: c.patient.age },
		chiefComplaint: c.chiefComplaint,
	};
}
