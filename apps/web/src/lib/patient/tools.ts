// Herramientas del paciente para la voz (plan.md, secciones 4 a 6). El modelo
// decide cuándo llamarlas según lo que pide el estudiante; las ejecuta el
// servidor, que es quien sabe qué se ve. Nada de esto lleva el diagnóstico.
import { z } from "zod";

export const BP_STEPS = [
	"descanso",
	"sin_hablar",
	"espalda_apoyada",
	"pies_apoyados",
	"piernas_descruzadas",
	"brazo_altura_corazon",
	"manguito_sobre_piel",
] as const;

export const toolArgs = {
	examinar: z.object({
		zona: z.string(),
		maniobra: z.string().default("inspeccion"),
		// alta: pidió abrir bien, sacar la lengua o decir aaa; media: solo
		// "abrí la boca"; baja: confusa.
		claridad: z.enum(["baja", "media", "alta"]),
		// El estudiante explicó qué va a hacer o pidió permiso.
		consentimiento: z.boolean(),
	}),
	medir_presion: z.object({
		pasos_cumplidos: z.array(z.enum(BP_STEPS)).default([]),
	}),
	mostrar_region: z.object({ region: z.string() }),
	actualizar_estado: z.object({
		delta: z
			.object({
				confianza: z.number().min(-0.5).max(0.5).optional(),
				ansiedad: z.number().min(-0.5).max(0.5).optional(),
				dolor: z.number().min(-0.5).max(0.5).optional(),
				paciencia: z.number().min(-0.5).max(0.5).optional(),
			})
			.default({}),
		motivo: z.string().max(200),
	}),
	terminar_consulta: z.object({ motivo: z.string().max(200).optional() }),
	anotar_dato: z.object({
		clave: z.string().min(1).max(40),
		valor: z.string().min(1).max(200),
	}),
} as const;

export type ToolName = keyof typeof toolArgs;

export function isToolName(name: string): name is ToolName {
	return name in toolArgs;
}

// Definiciones de las herramientas. Para Gemini Live se pasan como
// functionDeclarations con parametersJsonSchema (server/voice.ts).
export const PATIENT_TOOLS = [
	{
		type: "function",
		name: "examinar",
		description:
			"Llamala cuando el estudiante te pide examinarte (abrir la boca, mirar la garganta, decir aaa, o revisarte el oído). Te dice qué ves vos de tu cuerpo y cómo reaccionás. No describas hallazgos médicos.",
		parameters: {
			type: "object",
			properties: {
				zona: {
					type: "string",
					description: "Zona a examinar: orofaringe (boca o garganta) u oído.",
				},
				maniobra: { type: "string", description: "Por ejemplo inspeccion." },
				claridad: {
					type: "string",
					enum: ["baja", "media", "alta"],
					description:
						"alta si pidió abrir bien, sacar la lengua o decir aaa; media si solo dijo abrí la boca; baja si fue confuso.",
				},
				consentimiento: {
					type: "boolean",
					description: "true si explicó qué va a hacer o te pidió permiso.",
				},
			},
			required: ["zona", "claridad", "consentimiento"],
		},
	},
	{
		type: "function",
		name: "medir_presion",
		description:
			"Llamala cuando el estudiante te mide la presión. Indicá qué pasos de preparación hizo según lo que te dijo.",
		parameters: {
			type: "object",
			properties: {
				pasos_cumplidos: {
					type: "array",
					items: { type: "string", enum: [...BP_STEPS] },
				},
			},
			required: ["pasos_cumplidos"],
		},
	},
	{
		type: "function",
		name: "mostrar_region",
		description:
			"Llamala cuando el estudiante te pide que le muestres una parte del cuerpo (rodilla, uñas, ojos).",
		parameters: {
			type: "object",
			properties: { region: { type: "string" } },
			required: ["region"],
		},
	},
	{
		type: "function",
		name: "actualizar_estado",
		description:
			"Llamala cuando algo que hizo el estudiante te cae bien o mal (te trató con empatía, te interrumpió, te presionó). Cambios chicos, entre -0.3 y 0.3.",
		parameters: {
			type: "object",
			properties: {
				delta: {
					type: "object",
					properties: {
						confianza: { type: "number" },
						ansiedad: { type: "number" },
						dolor: { type: "number" },
						paciencia: { type: "number" },
					},
				},
				motivo: { type: "string" },
			},
			required: ["delta", "motivo"],
		},
	},
	{
		type: "function",
		name: "terminar_consulta",
		description:
			"Llamala cuando el estudiante da por terminada la consulta o se despide.",
		parameters: { type: "object", properties: { motivo: { type: "string" } } },
	},
	{
		type: "function",
		name: "anotar_dato",
		description:
			"Llamala cada vez que inventes un dato sobre vos que no estaba en tu historia (por ejemplo, a qué te dedicás exactamente o cuántos hermanos tenés), para no contradecirte después.",
		parameters: {
			type: "object",
			properties: {
				clave: {
					type: "string",
					description: "Tema corto, por ejemplo hermanos.",
				},
				valor: { type: "string", description: "Lo que dijiste." },
			},
			required: ["clave", "valor"],
		},
	},
] as const;
