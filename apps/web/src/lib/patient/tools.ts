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

// Cambio de ánimo: chico y acotado a ±0.5 aunque el modelo pida más.
const smallDelta = z
	.number()
	.optional()
	.catch(undefined)
	.transform((d) =>
		d === undefined || !Number.isFinite(d)
			? undefined
			: Math.max(-0.5, Math.min(0.5, d)),
	);

export const toolArgs = {
	// El modelo a veces manda valores fuera del esquema ("Alta", un paso
	// inventado, 0.8): se corrigen en vez de rechazar la llamada entera.
	examinar: z.object({
		zona: z.string().catch(""),
		maniobra: z.string().catch("inspeccion"),
		// alta: pidió abrir bien, sacar la lengua o decir aaa; media: solo
		// "abrí la boca"; baja: confusa.
		claridad: z.preprocess(
			(v) => (typeof v === "string" ? v.toLowerCase().trim() : v),
			z.enum(["baja", "media", "alta"]).catch("media"),
		),
		// El estudiante explicó qué va a hacer o pidió permiso. Ante la duda, no.
		consentimiento: z.boolean().catch(false),
	}),
	medir_presion: z.object({
		consentimiento: z.boolean().catch(false),
		pasos_cumplidos: z
			.array(z.string())
			.catch([])
			.transform((steps) => BP_STEPS.filter((s) => steps.includes(s))),
	}),
	mostrar_region: z.object({ region: z.string() }),
	actualizar_estado: z.object({
		delta: z
			.object({
				confianza: smallDelta,
				ansiedad: smallDelta,
				dolor: smallDelta,
				paciencia: smallDelta,
			})
			.catch({
				confianza: undefined,
				ansiedad: undefined,
				dolor: undefined,
				paciencia: undefined,
			}),
		motivo: z
			.string()
			.catch("")
			.transform((m) => m.slice(0, 200)),
	}),
	terminar_consulta: z.object({
		motivo: z.string().optional().catch(undefined),
	}),
	anotar_dato: z.object({
		clave: z
			.string()
			.trim()
			.min(1)
			.transform((k) => k.slice(0, 40)),
		valor: z
			.string()
			.trim()
			.min(1)
			.transform((v) => v.slice(0, 200)),
	}),
} as const;

export type ToolName = keyof typeof toolArgs;

export function isToolName(name: string): name is ToolName {
	// hasOwn: "toString" o "constructor" no son herramientas.
	return Object.hasOwn(toolArgs, name);
}

// Definiciones de las herramientas. Para Gemini Live se pasan como
// functionDeclarations con parametersJsonSchema (server/voice.ts).
export const PATIENT_TOOLS = [
	{
		type: "function",
		name: "examinar",
		description:
			"Llamala cuando el estudiante te pide examinarte (abrir la boca, mirar la garganta, decir aaa, revisarte el oído o palparte el cuello). Te dice qué ves vos de tu cuerpo y cómo reaccionás. No describas hallazgos médicos.",
		parameters: {
			type: "object",
			properties: {
				zona: {
					type: "string",
					description:
						"Zona a examinar: orofaringe (boca o garganta), oído (con el lado si lo dijeron: oído izquierdo) o cuello (ganglios).",
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
				consentimiento: {
					type: "boolean",
					description:
						"true si el estudiante te pidió permiso o te explicó antes.",
				},
			},
			required: ["pasos_cumplidos", "consentimiento"],
		},
	},
	{
		type: "function",
		name: "mostrar_region",
		description:
			"Llamala cuando el estudiante te pide que le muestres una parte del cuerpo (rodilla, uñas, ojos). Para la garganta, la boca o el oído no: usá examinar.",
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
