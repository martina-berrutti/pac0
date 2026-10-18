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
	// De dónde sale el "por qué importa": la lista de cotejo o el afiche. Solo
	// se nombra; no se copia el texto (AGENTS.md). Opcional para los informes
	// guardados antes.
	source: z.string().optional(),
	critical: z.boolean(),
	evidence: z.array(evidenceSchema),
});

// Cómo le fue con el diagnóstico (lib/scoring/diagnosis.ts).
export const diagnosisFeedbackSchema = z.object({
	// Lo que planteó, tal cual.
	yours: z.string(),
	result: z.enum(["acertaste", "cerca", "otro_diagnostico", "sin_hipotesis"]),
	message: z.string(),
	// Si su hipótesis era uno de los diferenciales: qué los distingue.
	confusedWith: z
		.object({ differential: z.string(), hint: z.string() })
		.optional(),
	differentialsHit: z.array(z.string()),
	differentialsMissed: z.array(
		z.object({ differential: z.string(), hint: z.string().optional() }),
	),
	// Datos clave del caso que encontró y los que no.
	cluesFound: z.array(
		z.object({
			clue: z.string(),
			why: z.string(),
			// Si lo usó como argumento en su cierre.
			usedInClosing: z.boolean(),
			evidence: z.array(evidenceSchema),
		}),
	),
	cluesMissed: z.array(z.object({ clue: z.string(), why: z.string() })),
	// Lo que le dijo al paciente sobre qué tiene, si se lo dijo.
	toldPatient: z
		.object({ quote: z.string(), turnId: z.string(), correct: z.boolean() })
		.optional(),
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
	// Avisos que no restan puntos (por ejemplo, un examen que el caso no
	// necesitaba). Opcional para los informes guardados antes.
	notices: z.array(z.string()).optional(),
	// Diagnóstico y puntos a mejorar (Persona 1). Opcionales para los informes
	// guardados antes.
	diagnosis: diagnosisFeedbackSchema.optional(),
	improvements: z.array(z.string()).optional(),
	judge: z.enum(["reglas", "ia"]),
	createdAt: z.number(),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type ItemResult = z.infer<typeof itemResultSchema>;
export type Mistake = z.infer<typeof mistakeSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Report = z.infer<typeof reportSchema>;
export type DiagnosisFeedback = z.infer<typeof diagnosisFeedbackSchema>;
