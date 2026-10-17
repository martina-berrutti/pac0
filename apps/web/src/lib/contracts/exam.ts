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
};

// Tensiómetro (plan.md, sección 6, afiche HC-01).
export type CuffSize = "chico" | "adecuado" | "grande";

export type BpTechniqueError =
	| "sin-reposo"
	| "hablando"
	| "piernas-cruzadas"
	| "espalda-sin-apoyo"
	| "brazo-bajo"
	| "brazo-alto"
	| "manguito-chico"
	| "manguito-grande"
	| "sobre-ropa";

export type BpReading = { systolic: number; diastolic: number };

// Una medición de presión. El valor del manómetro (gauge) es el verdadero del
// caso más los ajustes por técnica; el verdadero no se guarda acá.
export type VitalsMeasurement = {
	id: string;
	sessionId: string;
	// Lo que el estudiante hizo bien, por ejemplo "descruza-piernas".
	stepsCompleted: string[];
	techniqueErrors: BpTechniqueError[];
	cuffSize: CuffSize | null;
	overClothes: boolean | null;
	gauge: BpReading | null;
	marked: BpReading | null;
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
