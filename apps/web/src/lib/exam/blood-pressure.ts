// Tensiómetro virtual (plan.md, sección 6, afiche HC-01). El manómetro marca
// el valor verdadero del caso más los ajustes por errores de técnica. Lo
// calcula este código, no la IA. Las magnitudes en mmHg son valores iniciales
// a calibrar con un docente: es un modelo educativo simplificado.
import type {
	BpReading,
	BpTechniqueError,
	CuffSize,
} from "@/lib/contracts/exam";
import type { Turn } from "@/lib/contracts/session";

function normalize(s: string) {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

type Technique = {
	// Completa "Tomaste la presión con ...".
	label: string;
	// Efecto en la lectura según el afiche.
	effect: string;
	adjust: BpReading;
	// Qué hacer la próxima vez.
	tip: string;
	// Paso que lo corrige y las frases del estudiante que lo cumplen.
	fix?: { step: string; keywords: string[] };
};

export const TECHNIQUE: Record<BpTechniqueError, Technique> = {
	"sin-reposo": {
		label: "la paciente sin descansar 5 minutos",
		effect: "La actividad reciente sube la presión de forma transitoria.",
		adjust: { systolic: 15, diastolic: 8 },
		tip: "Pedile que se siente y descanse 5 minutos antes de medir.",
		fix: {
			step: "indica-reposo",
			keywords: ["descans", "repos", "5 minutos", "cinco minutos", "esperemos"],
		},
	},
	hablando: {
		label: "la paciente hablando",
		effect: "Hablar durante la medición sube la presión.",
		adjust: { systolic: 10, diastolic: 8 },
		tip: "Pedile que corte el teléfono y no hable mientras medís.",
		fix: {
			step: "pide-silencio",
			keywords: ["no hables", "sin hablar", "silencio", "colga", "corta"],
		},
	},
	"piernas-cruzadas": {
		label: "las piernas cruzadas",
		effect: "Las piernas cruzadas suben la sistólica.",
		adjust: { systolic: 6, diastolic: 2 },
		tip: "Pedile que descruce las piernas y apoye los pies en el piso.",
		fix: {
			step: "descruza-piernas",
			keywords: ["descruz", "sin cruzar", "no cruces", "piernas apoyadas"],
		},
	},
	"espalda-sin-apoyo": {
		label: "la espalda sin apoyar",
		effect: "Sin respaldo sube la diastólica.",
		adjust: { systolic: 2, diastolic: 6 },
		tip: "Pedile que apoye la espalda en el respaldo.",
		fix: {
			step: "apoya-espalda",
			keywords: ["apoya la espalda", "espalda apoyada", "respaldo"],
		},
	},
	"brazo-bajo": {
		label: "el brazo por debajo del corazón",
		effect: "El brazo por debajo del corazón sobreestima la presión.",
		adjust: { systolic: 8, diastolic: 6 },
		tip: "Apoyá el brazo sobre la mesa, a la altura del corazón.",
		fix: {
			step: "brazo-a-la-altura-del-corazon",
			keywords: [
				"altura del corazon",
				"apoya el brazo",
				"brazo apoyado",
				"apoyar el brazo",
			],
		},
	},
	"brazo-alto": {
		label: "el brazo por encima del corazón",
		effect: "El brazo por encima del corazón subestima la presión.",
		adjust: { systolic: -8, diastolic: -6 },
		tip: "Bajá el brazo y apoyalo a la altura del corazón.",
	},
	"manguito-chico": {
		label: "un manguito chico para el brazo",
		effect: "Un manguito chico da valores falsamente elevados.",
		adjust: { systolic: 10, diastolic: 8 },
		tip: "Medí el perímetro del brazo: el manguito tiene que cubrir cerca del 80%.",
	},
	"manguito-grande": {
		label: "un manguito grande para el brazo",
		effect: "Un manguito grande da valores falsamente bajos.",
		adjust: { systolic: -8, diastolic: -6 },
		tip: "Medí el perímetro del brazo: el manguito tiene que cubrir cerca del 80%.",
	},
	"sobre-ropa": {
		label: "el manguito sobre la ropa",
		effect: "El manguito sobre ropa gruesa altera la lectura.",
		adjust: { systolic: 5, diastolic: 3 },
		tip: "Pedile que se arremangue y colocá el manguito sobre la piel.",
	},
};

// Cómo encuentra el estudiante al paciente al ir a tomarle la presión.
export type BpScenario = {
	armCm: number;
	pulse: number;
	initial: BpTechniqueError[];
};

const DEFAULT_SCENARIO: Omit<BpScenario, "pulse"> = {
	armCm: 26,
	initial: ["piernas-cruzadas", "brazo-bajo"],
};

// Caso trampa del afiche (Rosa Rodríguez, estación 3): llegó corriendo y
// espera hablando por teléfono. Cuando la Persona 3 agregue el caso 2, se
// puede pasar al JSON del caso.
const SCENARIOS: Record<string, Omit<BpScenario, "pulse">> = {
	"hipertension-01": {
		armCm: 35,
		initial: ["sin-reposo", "hablando", "piernas-cruzadas", "brazo-bajo"],
	},
};

export function scenarioFor(caseId: string, pulse: number): BpScenario {
	return { ...(SCENARIOS[caseId] ?? DEFAULT_SCENARIO), pulse };
}

// Preguntas de preparación del afiche: suman como pasos, no cambian la lectura.
const PREP_STEPS: Record<string, string[]> = {
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

export function correctCuff(armCm: number): CuffSize {
	if (armCm < 22) return "chico";
	return armCm <= 32 ? "adecuado" : "grande";
}

const CUFF_ORDER: CuffSize[] = ["chico", "adecuado", "grande"];

function says(turns: Turn[], keywords: string[]) {
	return turns.some((t) =>
		keywords.some((k) => normalize(t.text).includes(normalize(k))),
	);
}

// Errores y pasos según lo que dijo el estudiante antes de medir.
export function assessConversation(studentTurns: Turn[], scenario: BpScenario) {
	const steps: string[] = [];
	for (const [step, keywords] of Object.entries(PREP_STEPS)) {
		if (says(studentTurns, keywords)) steps.push(step);
	}
	for (const t of Object.values(TECHNIQUE)) {
		if (t.fix && says(studentTurns, t.fix.keywords)) steps.push(t.fix.step);
	}
	const errors = scenario.initial.filter((e) => {
		const fix = TECHNIQUE[e].fix;
		return !fix || !steps.includes(fix.step);
	});
	return { steps, errors };
}

// Errores del manguito, según lo que eligió en la vista.
export function assessCuff(
	cuffSize: CuffSize,
	overClothes: boolean,
	armCm: number,
) {
	const steps: string[] = [];
	const errors: BpTechniqueError[] = [];
	const diff =
		CUFF_ORDER.indexOf(cuffSize) - CUFF_ORDER.indexOf(correctCuff(armCm));
	if (diff < 0) errors.push("manguito-chico");
	else if (diff > 0) errors.push("manguito-grande");
	else steps.push("manguito-adecuado");
	if (overClothes) errors.push("sobre-ropa");
	else steps.push("manguito-sobre-piel");
	return { steps, errors };
}

export function gaugeReading(
	truth: [number, number],
	errors: BpTechniqueError[],
): BpReading {
	return errors.reduce(
		(r, e) => ({
			systolic: r.systolic + TECHNIQUE[e].adjust.systolic,
			diastolic: r.diastolic + TECHNIQUE[e].adjust.diastolic,
		}),
		{ systolic: truth[0], diastolic: truth[1] },
	);
}

// Margen para dar por bien marcada una lectura (los manómetros van de 2 en 2).
export const MARK_TOLERANCE = 4;
