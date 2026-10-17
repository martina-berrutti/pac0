// Validadores compartidos del esquema. Son el contrato entre frentes (plan.md,
// sección 11): cambiarlos se pide por mensaje a la Persona 1.
import { type Infer, v } from "convex/values";

export const role = v.union(v.literal("estudiante"), v.literal("docente"));

// De 1º a 6º, internado o recién recibido (plan.md, sección 10).
export const careerYear = v.union(
	v.literal("1"),
	v.literal("2"),
	v.literal("3"),
	v.literal("4"),
	v.literal("5"),
	v.literal("6"),
	v.literal("internado"),
	v.literal("recibido"),
);

export const dimension = v.union(
	v.literal("anamnesis"),
	v.literal("examen"),
	v.literal("razonamiento"),
	v.literal("comunicacion"),
);

// Parámetros de personalidad (plan.md, sección 5). Los numéricos van de 0 a 1.
export const personality = v.object({
	cooperacion: v.number(),
	ansiedad: v.number(),
	locuacidad: v.number(),
	desconfianza: v.number(),
	paciencia: v.number(),
	audicion: v.union(v.literal("normal"), v.literal("reducida")),
	vocabulario: v.optional(v.union(v.literal("simple"), v.literal("medio"))),
});

// Estado dinámico del paciente durante la consulta, de 0 a 1.
export const patientState = v.object({
	confianza: v.number(),
	ansiedad: v.number(),
	dolor: v.number(),
	paciencia: v.number(),
});

export const examZone = v.object({
	// Variante de apertura -> clave del asset (por ejemplo "parcial" -> "mouth-partial-01").
	variants: v.record(v.string(), v.string()),
	hotspots: v.array(v.string()),
	expected: v.string(),
});

export const checklistItem = v.object({
	item: v.string(),
	dimension,
	// Esencial 3, importante 2, complementario 1.
	weight: v.number(),
});

// Diagnóstico del caso. Solo se lee desde funciones internas.
export const truth = v.object({
	diagnosis: v.string(),
	acceptable: v.array(v.string()),
	differentials: v.array(v.string()),
});

export const sessionStatus = v.union(
	v.literal("activa"),
	v.literal("finalizada"),
	v.literal("evaluada"),
	v.literal("abandonada"),
);

export const speaker = v.union(v.literal("estudiante"), v.literal("paciente"));

export const instructionClarity = v.union(
	v.literal("baja"),
	v.literal("media"),
	v.literal("alta"),
);

export const eventType = v.union(
	v.literal("interrupcion_estudiante"),
	v.literal("interrupcion_paciente"),
	v.literal("silencio_largo"),
	v.literal("cambio_animo"),
	v.literal("consentimiento"),
);

export const itemStatus = v.union(
	v.literal("si"),
	v.literal("parcial"),
	v.literal("no"),
	v.literal("no_aplica"),
);

export const verdict = v.union(
	v.literal("lo_hiciste_bien"),
	v.literal("error_critico"),
	v.literal("casi"),
	v.literal("a_repasar"),
);

// Cita que prueba un ítem o un error: un turno, una acción de examen o ambos.
export const evidence = v.object({
	turnId: v.optional(v.id("turns")),
	examActionId: v.optional(v.id("examActions")),
	quote: v.optional(v.string()),
});

export const dimensionScores = v.object({
	anamnesis: v.number(),
	examen: v.number(),
	razonamiento: v.number(),
	comunicacion: v.number(),
});

export type Role = Infer<typeof role>;
export type CareerYear = Infer<typeof careerYear>;
export type Dimension = Infer<typeof dimension>;
export type Personality = Infer<typeof personality>;
export type PatientState = Infer<typeof patientState>;
export type SessionStatus = Infer<typeof sessionStatus>;
export type Verdict = Infer<typeof verdict>;
