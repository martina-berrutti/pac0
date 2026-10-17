// Informe final (Persona 2). La Persona 3 diseña la pantalla contra este
// tipo; el evaluador con IA tiene que devolver algo que valide acá.
import { z } from "zod";

import { dimensionSchema } from "@/cases/schema";

export const evidenceSchema = z.object({
	turnId: z.string().optional(),
	examActionId: z.string().optional(),
	quote: z.string().optional(),
});

export const itemResultSchema = z.object({
	itemId: z.string(),
	item: z.string(),
	dimension: dimensionSchema,
	weight: z.number(),
	status: z.enum(["si", "parcial", "no"]),
	evidence: z.array(evidenceSchema),
});

export const mistakeSchema = z.object({
	tag: z.string(),
	what: z.string(),
	why: z.string(),
	nextTime: z.string(),
	critical: z.boolean(),
	evidence: z.array(evidenceSchema),
});

export const verdictSchema = z.enum([
	"lo_hiciste_bien",
	"error_critico",
	"casi",
	"a_repasar",
]);

export const reportSchema = z.object({
	sessionId: z.string(),
	scores: z.object({
		anamnesis: z.number(),
		examen: z.number(),
		razonamiento: z.number(),
		comunicacion: z.number(),
	}),
	total: z.number(),
	verdict: verdictSchema,
	verdictMessage: z.string(),
	items: z.array(itemResultSchema),
	strengths: z.array(z.object({ text: z.string(), evidence: evidenceSchema })),
	mistakes: z.array(mistakeSchema),
	// La verdad del caso recién se muestra en el informe.
	truth: z.object({
		diagnosis: z.string(),
		differentials: z.array(z.string()),
	}),
	notMeasurable: z.array(z.string()),
	judge: z.enum(["reglas", "ia"]),
	createdAt: z.number(),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type ItemResult = z.infer<typeof itemResultSchema>;
export type Mistake = z.infer<typeof mistakeSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Report = z.infer<typeof reportSchema>;
