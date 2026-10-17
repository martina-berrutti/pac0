import type { ClinicalCase } from "@/cases/schema";
import type { ExamAction } from "@/lib/contracts/exam";
import type { Session, SessionEvent, Turn } from "@/lib/contracts/session";

// Todo lo que el evaluador lee de una consulta (plan.md, sección 8).
export type EvaluationInput = {
	clinicalCase: ClinicalCase;
	session: Session;
	turns: Turn[];
	events: SessionEvent[];
	examActions: ExamAction[];
};

export type Penalty = {
	dimension: "anamnesis" | "examen" | "razonamiento" | "comunicacion";
	points: number;
	tag: string;
	what: string;
	turnId?: string;
};
