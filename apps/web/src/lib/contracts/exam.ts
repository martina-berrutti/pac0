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

// Lo que el servidor devuelve al pedir un examen. Nunca incluye el hallazgo
// esperado: solo qué se ve.
export type ExamResult = {
	action: ExamAction;
	assetKey: string | null;
	hotspots: string[];
	patientReaction: string;
};
