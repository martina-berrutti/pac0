import type { ClinicalCase } from "@/cases/schema";
import type { ExamAction, VitalsMeasurement } from "@/lib/contracts/exam";
import type { Session, SessionEvent, Turn } from "@/lib/contracts/session";

// Todo lo que el evaluador lee de una consulta (plan.md, sección 8).
export type EvaluationInput = {
	clinicalCase: ClinicalCase;
	session: Session;
	turns: Turn[];
	events: SessionEvent[];
	examActions: ExamAction[];
	vitals: VitalsMeasurement[];
};

export type Penalty = {
	dimension: "anamnesis" | "examen" | "razonamiento" | "comunicacion";
	points: number;
	tag: string;
	what: string;
	turnId?: string;
	// Textos de la tarjeta de error; sin ellos van los genéricos.
	why?: string;
	nextTime?: string;
};
