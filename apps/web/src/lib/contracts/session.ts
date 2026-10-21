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
	// Voz de Gemini sorteada al empezar (lib/patient/voices.ts).
	voice?: string;
	// Persona sorteada al empezar: avatar, nombre, edad y sexo
	// (lib/patient/avatars.ts). Las sesiones viejas no la tienen.
	patient?: { avatar: string; name: string; age: number; sex: "f" | "m" };
	// Cantidad de turnos del estudiante cuando el modelo cambió su ánimo por
	// última vez (un cambio por turno, server/voice.ts).
	stateToolTurn?: number;
	// Conexiones de voz pedidas en esta consulta (hay un tope).
	voiceStarts?: number;
	// Si los errores del informe ya se sumaron al perfil (una vez por consulta).
	// Opcional: las sesiones guardadas antes no lo tienen.
	mistakesRecorded?: boolean;
	// Si la confianza ya llegó a 0,5 alguna vez (por texto, lo sensible queda
	// en el prompt aunque después baje).
	trustReached?: boolean;
};

export type VoiceUsage = {
	responses: number;
	inputTokens: number;
	outputTokens: number;
	inputAudioTokens: number;
	outputAudioTokens: number;
	cachedTokens: number;
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
	// Etiquetas del clasificador en los turnos del estudiante
	// (lib/patient/turn-classifier.ts): pregunta abierta, jerga, empatía...
	tags?: string[];
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
