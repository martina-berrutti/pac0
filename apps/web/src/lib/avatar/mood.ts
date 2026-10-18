// Cara del avatar según la personalidad elegida y el estado del paciente
// (confianza, ansiedad, dolor y paciencia, de 0 a 1). Persona 3. Umbrales
// iniciales, a ajustar mirando la consulta.
import type { PatientState } from "@/lib/contracts/session";

import type { Mood } from "./commands";

// base: la expresión de la personalidad (enojado, feliz, triste…). Sin
// personalidad elegida (la del caso), manda solo el estado.
export function moodFor(state: PatientState, base?: Mood): Mood {
	// Perdió la paciencia: se enoja, sea cual sea su carácter.
	if (state.paciencia < 0.25) return "angry";
	switch (base) {
		// El enojado se calma si lo tratan bien.
		case "angry":
			return state.confianza >= 0.7 && state.paciencia >= 0.4
				? "neutral"
				: "angry";
		// El ansioso se tranquiliza si le bajan la ansiedad.
		case "fear":
			return state.ansiedad < 0.4 ? "neutral" : "fear";
		// El feliz se enoja si lo maltratan.
		case "happy":
			return state.confianza < 0.3 ? "angry" : "happy";
		// El desconfiado afloja cuando gana confianza.
		case "disgust":
			return state.confianza >= 0.7 ? "neutral" : "disgust";
		// El tranquilo sigue tranquilo, salvo que lo pongan nervioso o lo
		// maltraten.
		case "neutral":
			if (state.confianza < 0.3) return "angry";
			return state.ansiedad >= 0.6 ? "fear" : "neutral";
		case undefined:
			break;
		default:
			return base;
	}
	if (state.confianza < 0.3) return "angry";
	if (state.ansiedad >= 0.6) return "fear";
	if (state.dolor >= 0.7) return "sad";
	if (state.confianza >= 0.7 && state.ansiedad < 0.4) return "happy";
	return "neutral";
}
