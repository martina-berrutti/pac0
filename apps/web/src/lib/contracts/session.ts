// Contratos de sesión, turnos y eventos (Persona 1). Los usan la consulta,
// el examen y el evaluador.
import type { Personality } from "@/cases/schema";

export type PatientState = {
	confianza: number;
	ansiedad: number;
	dolor: number;
	paciencia: number;
};

export type SessionStatus = "activa" | "finalizada" | "evaluada";

export type Session = {
	id: string;
	userId: string;
	caseId: string;
	// Copia del alias al empezar; ningún otro dato personal.
	alias: string;
	personalityKey: string;
	personality: Personality;
	state: PatientState;
	status: SessionStatus;
	startedAt: number;
	endedAt: number | null;
	// Hipótesis y diferenciales que el estudiante plantea al cerrar.
	closing: { hypothesis: string; differentials: string[] } | null;
	// Si el paciente ya aceptó que lo examinen.
	consentGiven: boolean;
	// Valores sorteados de la variación controlada (clave de hiddenHistory).
	historyOverrides: Record<string, string>;
	// Datos que el paciente inventó porque el caso no los define, para no
	// contradecirse (plan.md, sección 5).
	inventedFacts: Record<string, string>;
	// Tokens de la voz, para medir el costo por sesión.
	voiceUsage: VoiceUsage | null;
	// Tokens de voz pedidos (conexión y reconexiones), con tope por costo.
	// Opcional: las sesiones guardadas antes no lo tienen.
	voiceConnections?: number;
};

export type VoiceUsage = {
	responses: number;
	inputTokens: number;
	outputTokens: number;
	inputAudioTokens: number;
	outputAudioTokens: number;
	cachedTokens: number;
	// El mayor valor recibido en un solo mensaje. Todavía no sabemos si
	// usageMetadata de Gemini Live es por respuesta o acumulado: si es por
	// respuesta, el costo sale de las sumas; si es acumulado, de estos picos.
	// Opcional: las sesiones guardadas antes no lo tienen.
	peak?: { inputTokens: number; outputTokens: number };
};

export type Turn = {
	id: string;
	sessionId: string;
	speaker: "estudiante" | "paciente";
	text: string;
	// Milisegundos desde el inicio de la sesión.
	startMs: number;
	endMs: number;
	overlap: boolean;
};

export type SessionEventType =
	| "interrupcion_estudiante"
	| "interrupcion_paciente"
	| "silencio_largo"
	| "cambio_animo"
	| "consentimiento";

export type SessionEvent = {
	id: string;
	sessionId: string;
	type: SessionEventType;
	atMs: number;
	durationMs?: number;
	delta?: Partial<PatientState>;
	motivo?: string;
};

// Tope de la consulta (plan.md, sección 5).
export const MAX_SESSION_MS = 8 * 60 * 1000;
