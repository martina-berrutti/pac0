// Cambios atómicos sobre una sesión. En vez de leer, modificar y reescribir
// la sesión entera (dos pedidos simultáneos se pisaban), cada pedido manda su
// cambio y el almacenamiento lo aplica sobre el valor actual: en Convex dentro
// de una mutación (transacción). La misma lógica está repetida en
// packages/backend/convex/records.ts (changeSession): si cambia una, cambiar
// la otra.
import type { PatientState, Session, VoiceUsage } from "./session";

export type SessionChange = {
	// Campos que se reemplazan tal cual.
	set?: Partial<Session>;
	// Se suma al estado actual y queda entre 0 y 1.
	stateDelta?: Partial<PatientState>;
	// Tokens de una respuesta de voz: se suman.
	usageDelta?: Omit<VoiceUsage, "responses">;
	// Datos inventados nuevos: no pisan los que ya están (máximo 40).
	facts?: Record<string, string>;
	// Reserva una conexión de voz (el tope se controla con el resultado).
	incVoiceStarts?: boolean;
	// Solo aplica si la sesión está en este estado; si no, no cambia nada.
	ifStatus?: Session["status"];
	// Solo aplica si estos campos siguen valiendo esto (un campo que falta
	// cuenta como null). Para decidir con el valor actual y no con uno leído
	// antes: el consentimiento se da una vez, un cambio de ánimo por turno.
	// Un Convex sin desplegar lo ignora (el cambio llega como v.any()).
	ifEquals?: { consentGiven?: boolean; stateToolTurn?: number | null };
};

export const MAX_INVENTED_FACTS = 40;

const clamp = (n: number) => Math.min(1, Math.max(0, n));

// Devuelve la sesión nueva, o null si no se cumple ifStatus.
export function applySessionChange(
	session: Session,
	change: SessionChange,
): Session | null {
	if (change.ifStatus && session.status !== change.ifStatus) return null;
	for (const [k, v] of Object.entries(change.ifEquals ?? {}))
		if ((session[k as keyof Session] ?? null) !== (v ?? null)) return null;
	const next: Session = { ...session, ...change.set };
	if (change.stateDelta) {
		const state = { ...next.state };
		for (const [k, d] of Object.entries(change.stateDelta) as [
			keyof PatientState,
			number | undefined,
		][]) {
			if (d !== undefined) state[k] = clamp(state[k] + d);
		}
		next.state = state;
	}
	if (change.usageDelta) {
		const prev = next.voiceUsage ?? {
			responses: 0,
			inputTokens: 0,
			outputTokens: 0,
			inputAudioTokens: 0,
			outputAudioTokens: 0,
			cachedTokens: 0,
		};
		const u = change.usageDelta;
		next.voiceUsage = {
			responses: prev.responses + 1,
			inputTokens: prev.inputTokens + u.inputTokens,
			outputTokens: prev.outputTokens + u.outputTokens,
			inputAudioTokens: prev.inputAudioTokens + u.inputAudioTokens,
			outputAudioTokens: prev.outputAudioTokens + u.outputAudioTokens,
			cachedTokens: prev.cachedTokens + u.cachedTokens,
		};
	}
	if (change.facts) {
		const facts = { ...next.inventedFacts };
		for (const [k, v] of Object.entries(change.facts)) {
			if (k in facts || Object.keys(facts).length >= MAX_INVENTED_FACTS)
				continue;
			facts[k] = v;
		}
		next.inventedFacts = facts;
	}
	if (change.incVoiceStarts) next.voiceStarts = (next.voiceStarts ?? 0) + 1;
	return next;
}
