// Tensiómetro virtual (plan.md, sección 6, afiche HC-01). El manómetro marca
// el valor verdadero del caso más los ajustes por cada paso de técnica que
// faltó. Lo calcula este código, no la IA. Las magnitudes en mmHg son valores
// iniciales a calibrar con un docente: es un modelo educativo simplificado.
//
// Los pasos de preparación salen de la herramienta medir_presion (el modelo de
// voz dice cuáles indicó el estudiante, lib/patient/tools.ts) o, con el botón
// del tensiómetro, de buscar frases en la transcripción. El manguito lo elige
// el estudiante en la vista.
import type {
	BpReading,
	BpTechniqueError,
	CuffSize,
	VitalsMeasurement,
} from "@/lib/contracts/exam";
import type { Turn } from "@/lib/contracts/session";
import { BP_STEPS } from "@/lib/patient/tools";

type BpStep = (typeof BP_STEPS)[number];

type Technique = {
	// Completa "Tomaste la presión con ...".
	label: string;
	// Efecto en la lectura según el afiche.
	effect: string;
	adjust: BpReading;
	// Qué hacer la próxima vez.
	tip: string;
};

export const TECHNIQUE: Record<BpTechniqueError, Technique> = {
	"sin-reposo": {
		label: "el paciente sin descansar 5 minutos",
		effect: "La actividad reciente sube la presión de forma transitoria.",
		adjust: { pas: 15, pad: 8 },
		tip: "Pedile que se siente y descanse 5 minutos antes de medir.",
	},
	hablando: {
		label: "el paciente hablando",
		effect: "Hablar durante la medición sube la presión.",
		adjust: { pas: 10, pad: 7 },
		tip: "Pedile que no hable mientras medís.",
	},
	"espalda-sin-apoyo": {
		label: "la espalda sin apoyar",
		effect: "Sin respaldo sube la diastólica.",
		adjust: { pas: 5, pad: 6 },
		tip: "Pedile que apoye la espalda en el respaldo.",
	},
	"pies-sin-apoyo": {
		label: "los pies sin apoyar",
		effect: "Con los pies colgando sube un poco la presión.",
		adjust: { pas: 3, pad: 2 },
		tip: "Pedile que apoye los pies en el piso.",
	},
	"piernas-cruzadas": {
		label: "las piernas cruzadas",
		effect: "Las piernas cruzadas suben la sistólica.",
		adjust: { pas: 7, pad: 2 },
		tip: "Pedile que descruce las piernas.",
	},
	"brazo-bajo": {
		label: "el brazo por debajo del corazón",
		effect: "El brazo por debajo del corazón sobreestima la presión.",
		adjust: { pas: 8, pad: 6 },
		tip: "Apoyá el brazo sobre la mesa, a la altura del corazón.",
	},
	"sobre-ropa": {
		label: "el manguito sobre la ropa",
		effect: "El manguito sobre ropa gruesa altera la lectura.",
		adjust: { pas: 5, pad: 3 },
		tip: "Pedile que se arremangue y colocá el manguito sobre la piel.",
	},
	"manguito-chico": {
		label: "un manguito chico para el brazo",
		effect: "Un manguito chico da valores falsamente elevados.",
		adjust: { pas: 10, pad: 8 },
		tip: "Medí el perímetro del brazo: el manguito tiene que cubrir cerca del 80%.",
	},
	"manguito-grande": {
		label: "un manguito grande para el brazo",
		effect: "Un manguito grande da valores falsamente bajos.",
		adjust: { pas: -8, pad: -6 },
		tip: "Medí el perímetro del brazo: el manguito tiene que cubrir cerca del 80%.",
	},
};

// Paso de preparación -> error si falta, y frases que lo cumplen (para el
// botón del tensiómetro, sin la herramienta de voz).
const STEPS: Record<BpStep, { error: BpTechniqueError; keywords: string[] }> = {
	descanso: {
		error: "sin-reposo",
		keywords: ["descans", "repos", "5 minutos", "cinco minutos", "esperemos"],
	},
	sin_hablar: {
		error: "hablando",
		keywords: ["no hables", "sin hablar", "silencio", "colga", "corta"],
	},
	espalda_apoyada: {
		error: "espalda-sin-apoyo",
		keywords: ["apoya la espalda", "espalda apoyada", "respaldo"],
	},
	pies_apoyados: {
		error: "pies-sin-apoyo",
		keywords: ["pies en el piso", "pies apoyados", "apoya los pies"],
	},
	piernas_descruzadas: {
		error: "piernas-cruzadas",
		keywords: ["descruz", "sin cruzar", "no cruces"],
	},
	brazo_altura_corazon: {
		error: "brazo-bajo",
		keywords: [
			"altura del corazon",
			"apoya el brazo",
			"brazo apoyado",
			"apoyar el brazo",
		],
	},
	manguito_sobre_piel: {
		error: "sobre-ropa",
		keywords: ["arremang", "sobre la piel", "subi la manga"],
	},
};

// Preguntas de preparación del afiche: suman como pasos, no cambian la lectura.
const PREP_QUESTIONS: Record<string, string[]> = {
	"pregunta-sustancias": [
		"cafe",
		"mate",
		"fumaste",
		"fumas",
		"tabaco",
		"cigarr",
		"energiz",
	],
	"pregunta-actividad": ["ejercicio", "corriste", "actividad fisica"],
	"pregunta-vejiga": ["vejiga", "al bano", "orinar", "hacer pis"],
};

// Perímetro del brazo y pulso de cada caso. Rosa (caso 2, trampa del afiche)
// tiene el brazo grande: el manguito de adulto le queda chico.
const ARM_CM: Record<string, number> = { "hipertension-01": 35 };
const DEFAULT_ARM_CM = 26;

export function armFor(caseId: string) {
	return ARM_CM[caseId] ?? DEFAULT_ARM_CM;
}

export function correctCuff(armCm: number): CuffSize {
	if (armCm < 22) return "chico";
	return armCm <= 32 ? "adecuado" : "grande";
}

const CUFF_ORDER: CuffSize[] = ["chico", "adecuado", "grande"];

function normalize(s: string) {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

function says(turns: Turn[], keywords: string[]) {
	return turns.some((t) =>
		keywords.some((k) => normalize(t.text).includes(normalize(k))),
	);
}

// Pasos que el estudiante indicó en la conversación (sin herramienta de voz).
export function stepsFromConversation(studentTurns: Turn[]): string[] {
	return [
		...BP_STEPS.filter((s) => says(studentTurns, STEPS[s].keywords)),
		...Object.keys(PREP_QUESTIONS).filter((q) =>
			says(studentTurns, PREP_QUESTIONS[q] ?? []),
		),
	];
}

export type Cuff = NonNullable<VitalsMeasurement["cuff"]>;

// Lectura del manómetro. Sin manguito colocado, "sobre la piel" sale de lo
// que indicó el estudiante; con manguito, de lo que eligió en la vista.
export function measure(
	truth: [number, number],
	steps: readonly string[],
	cuff: Cuff | null,
	armCm: number,
): Pick<VitalsMeasurement, "shown" | "stepsCompleted" | "techniqueErrors"> {
	const done = new Set(steps.filter((s) => s !== "manguito-adecuado"));
	if (cuff) {
		if (cuff.overClothes) done.delete("manguito_sobre_piel");
		else done.add("manguito_sobre_piel");
	}
	const errors: BpTechniqueError[] = BP_STEPS.filter((s) => !done.has(s)).map(
		(s) => STEPS[s].error,
	);
	if (cuff) {
		const diff =
			CUFF_ORDER.indexOf(cuff.size) - CUFF_ORDER.indexOf(correctCuff(armCm));
		if (diff < 0) errors.push("manguito-chico");
		else if (diff > 0) errors.push("manguito-grande");
		else done.add("manguito-adecuado");
	}
	const shown = errors.reduce(
		(r, e) => ({
			pas: r.pas + TECHNIQUE[e].adjust.pas,
			pad: r.pad + TECHNIQUE[e].adjust.pad,
		}),
		{ pas: truth[0], pad: truth[1] },
	);
	return { shown, stepsCompleted: [...done], techniqueErrors: errors };
}

// Margen para dar por bien marcada una lectura (los manómetros van de 2 en 2).
export const MARK_TOLERANCE = 4;
