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
	// Todo lo que dijo en la consulta sobre qué tiene el paciente, en orden.
	// Opcional para los informes guardados antes.
	spoken: z
		.array(
			z.object({
				quote: z.string(),
				turnId: z.string(),
				// correcto: el diagnóstico; diferencial: uno de los diferenciales
				// del caso; otro: algo que no es ninguno de los dos.
				verdict: z.enum(["correcto", "diferencial", "otro"]),
				differential: z.string().optional(),
			}),
		)
		.optional(),
	// Lo último que dijo en la consulta no coincide con lo que escribió.
	mismatch: z
		.object({
			spoken: z.string(),
			turnId: z.string(),
			written: z.string(),
			message: z.string(),
		})
		.optional(),
	toldPatient: z
		.object({ quote: z.string(), turnId: z.string(), correct: z.boolean() })
		.optional(),
});

// Cómo trató al paciente (lib/scoring/rapport.ts): lo que sumó y lo que restó
// en comunicación, cada cosa con su cita.
export const rapportEntrySchema = z.object({
	text: z.string(),
	// Puntos de comunicación que sumó o restó. Sin número: es un ítem de la
	// lista de cotejo (ya cuenta ahí) o algo que todavía no resta.
	points: z.number().optional(),
	critical: z.boolean().optional(),
	evidence: z.array(evidenceSchema),
});

export const rapportSchema = z.object({
	level: z.enum(["muy_bueno", "bueno", "mejorable", "a_trabajar"]),
	summary: z.string(),
	tip: z.string(),
	// Confianza del paciente en el estudiante, de 0 a 1.
	trust: z.object({ start: z.number(), end: z.number() }),
	// Puntos que sumó (ya con el tope) y que restó en comunicación.
	bonus: z.number(),
	penalty: z.number(),
	plus: z.array(rapportEntrySchema),
	minus: z.array(rapportEntrySchema),
});

const statusSchema = z.enum(["si", "parcial", "no"]);

// Odinofagia (Persona 3): la lista en bloques ✓/✗
// (lib/scoring/odinofagia.ts).
export const odinofagiaSchema = z.object({
	blocks: z.array(
		z.object({
			key: z.enum(["anamnesis", "examen", "indicaciones"]),
			title: z.string(),
			status: statusSchema,
			checks: z.array(
				z.object({
					label: z.string(),
					status: statusSchema,
					detail: z.string().optional(),
				}),
			),
		}),
	),
});

// En qué orden hizo la consulta (lib/scoring/order.ts). No resta puntos: se
// destaca en el informe.
export const orderSchema = z.object({
	ok: z.boolean(),
	// Los bloques en el orden en que los empezó; atMs null: no lo hizo.
	steps: z.array(
		z.object({
			key: z.enum(["anamnesis", "examen", "indicaciones"]),
			title: z.string(),
			atMs: z.number().nullable(),
		}),
	),
	notes: z.array(z.string()),
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
	// Trato al paciente. Opcional para los informes guardados antes.
	rapport: rapportSchema.optional(),
	// Odinofagia y orden de la consulta (Persona 3). Opcionales: solo los
	// casos que los piden y los informes nuevos.
	odinofagia: odinofagiaSchema.optional(),
	order: orderSchema.optional(),
	judge: z.enum(["reglas", "ia"]),
	// Si había clave pero la IA falló y se usó el juez por reglas: por qué.
	// Sin el mensaje del error (puede traer datos del proveedor).
	judgeFallback: z.enum(["tiempo", "cuota", "formato", "otro"]).optional(),
	createdAt: z.number(),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type ItemResult = z.infer<typeof itemResultSchema>;
export type Mistake = z.infer<typeof mistakeSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Report = z.infer<typeof reportSchema>;
export type DiagnosisFeedback = z.infer<typeof diagnosisFeedbackSchema>;
export type Rapport = z.infer<typeof rapportSchema>;
export type RapportEntry = z.infer<typeof rapportEntrySchema>;
export type Odinofagia = z.infer<typeof odinofagiaSchema>;
export type ConsultationOrder = z.infer<typeof orderSchema>;
