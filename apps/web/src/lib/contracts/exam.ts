// Acción de examen (Persona 2). La herramienta examinar del paciente
// (Persona 1) la crea; la vista de examen le suma los tiempos por zona.
export type InstructionClarity = "baja" | "media" | "alta";

export type ExamVariant = "parcial" | "completa" | "negado";

export type ExamAction = {
	id: string;
	sessionId: string;
	zone: string;
	maneuver: string;
	clarity: InstructionClarity;
	variant: ExamVariant;
	// Hotspot -> milisegundos con la luz encima.
	hotspotTimesMs: Record<string, number>;
	startMs: number;
	endMs: number | null;
	// Exámenes con técnica (otoscopia): pasos cumplidos y errores.
	technique?: { steps: string[]; errors: OtoscopyError[] };
};

// Otoscopio (plan.md, sección 6, afiche HC-02). Se guarda como una acción de
// examen con maneuver "otoscopia" y zona "oido-derecho" u "oido-izquierdo".
export const OTOSCOPY = "otoscopia";

export type Ear = "derecho" | "izquierdo";

export type OtoscopyPrep = "higiene" | "inspeccion-externa" | "verificar-luz";

export type OtoscopyError =
	| "sin-higiene"
	| "sin-explicar"
	| "sin-inspeccion-externa"
	| "sin-verificar-luz"
	| "especulo-inadecuado"
	| "mano-cruzada"
	| "sin-traccion"
	| "traccion-incorrecta"
	| "introduce-brusco"
	| "introduce-demasiado"
	| "no-observa-conducto"
	| "no-observa-timpano";

// Lo que el estudiante hizo en la vista. El servidor calcula los errores.
export type OtoscopyRecord = {
	hand: "derecha" | "izquierda";
	// Pasos de preparación hechos antes de introducir el espéculo.
	prep: OtoscopyPrep[];
	speculum: "pediatrico" | "adulto" | null;
	traction: "arriba-atras" | "abajo-atras" | "otra" | null;
	roughInsertions: number;
	maxDepth: number;
	canalMs: number;
	tympanumMs: number;
};

// Qué se ve en el oído según el caso (esquema, sin foto clínica).
export type EarAppearance = {
	canal: "sano" | "eritema" | "secrecion";
	tympanum: "nacarado" | "eritematoso" | "abombado";
};

// Tensiómetro (plan.md, sección 6, afiche HC-01).
export type CuffSize = "chico" | "adecuado" | "grande";

export type BpTechniqueError =
	| "sin-reposo"
	| "hablando"
	| "espalda-sin-apoyo"
	| "pies-sin-apoyo"
	| "piernas-cruzadas"
	| "brazo-bajo"
	| "sobre-ropa"
	| "manguito-chico"
	| "manguito-grande";

export type BpReading = { pas: number; pad: number };

// Medición de presión. La crea la herramienta medir_presion (Persona 1) o el
// botón del tensiómetro. Lo que marca el manómetro (shown) lo calcula el
// código: verdadero del caso más los ajustes por técnica (lib/exam/
// blood-pressure.ts). El valor verdadero no se guarda acá.
export type VitalsMeasurement = {
	id: string;
	sessionId: string;
	// Pasos de preparación cumplidos (BP_STEPS de lib/patient/tools.ts) y del
	// manguito.
	stepsCompleted: string[];
	techniqueErrors: BpTechniqueError[];
	shown: BpReading;
	// Lo que marca el estudiante en el tensiómetro (Persona 2).
	marked: BpReading | null;
	// Manguito elegido en el tensiómetro; null hasta colocarlo.
	cuff: { size: CuffSize; overClothes: boolean } | null;
	atMs: number;
};

// Lo que el servidor devuelve al pedir un examen. Nunca incluye el hallazgo
// esperado: solo qué se ve.
export type ExamResult = {
	action: ExamAction;
	assetKey: string | null;
	hotspots: string[];
	patientReaction: string;
};
