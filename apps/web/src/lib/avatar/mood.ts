// Cara del avatar según el estado del paciente (confianza, ansiedad, dolor y
// paciencia, de 0 a 1). Persona 3. Umbrales iniciales, a ajustar mirando la
// consulta: el primero que se cumple gana.
import type { PatientState } from "@/lib/contracts/session";

import type { Mood } from "./commands";

export function moodFor(state: PatientState): Mood {
	if (state.paciencia < 0.25 || state.confianza < 0.3) return "angry";
	if (state.ansiedad >= 0.6) return "fear";
	if (state.dolor >= 0.7) return "sad";
	if (state.confianza >= 0.7 && state.ansiedad < 0.4) return "happy";
	return "neutral";
}
