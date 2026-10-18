"use client";

// Consulta por voz con la Live API de Gemini (Google AI Studio), Persona 1.
// El navegador captura el micrófono (PCM 16 kHz), reproduce la voz del
// paciente (PCM 24 kHz) y reenvía a nuestro servidor transcripciones,
// herramientas, interrupciones y silencios. Las instrucciones del paciente
// van fijadas en el token efímero: el navegador no las ve ni las cambia.
import {
	type FunctionResponse,
	GoogleGenAI,
	type LiveServerMessage,
	type Session as LiveSession,
	Modality,
} from "@google/genai";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PatientState, Turn } from "@/lib/contracts/session";
import { timeoutSignal } from "@/lib/timeout-signal";
import { createWriteQueue } from "@/lib/voice/queue";
import type { ToolRun, ToolUi } from "@/server/voice";

export type VoiceStatus =
	| "idle"
	| "connecting"
	| "live"
	| "reconnecting"
	| "ended"
	| "error";

// Silencio largo: sin nadie hablando durante este tiempo (plan.md, sección 5).
const LONG_SILENCE_MS = 20_000;
// Se considera que el estudiante sigue hablando si llegó transcripción hace menos de esto.
const SPEAKING_WINDOW_MS = 900;
const OUTPUT_RATE = 24_000;
// Si se corta la conexión, se reintenta con un token nuevo que lleva lo hablado.
const MAX_RECONNECTS = 3;
// Tope para que Google abra la conexión de voz.
const CONNECT_TIMEOUT_MS = 15_000;
// Espera para guardar el turno del estudiante cuando empieza el paciente.
const STUDENT_FLUSH_DELAY_MS = 700;
// Cuánto se espera a que arranque el audio antes de seguir conectando.
const RESUME_WAIT_MS = 1_000;

type LiveToken = {
	token: string;
	apiVersion: string;
	model: string;
	remainingMs: number;
};

type Options = {
	sessionId: string;
	onTurn: (turn: Turn) => void;
	onTool: (ui: ToolUi) => void;
	// Ánimo del paciente después de cada turno guardado (para el avatar).
	onState?: (state: PatientState) => void;
	// Lo que va diciendo el estudiante, mientras lo dice (antes de guardar el
	// turno): para reaccionar rápido, como cerrar la boca (Persona 3).
	onHearing?: (text: string) => void;
	onEnd: () => void;
	onError: (message: string) => void;
};

// Las escrituras van en fila: un pedido colgado trabaría todos los que
// siguen (turnos, herramientas y el cierre), así que cada uno tiene tope.
const POST_TIMEOUT_MS = 15_000;

async function post<T>(path: string, body: unknown): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: timeoutSignal(POST_TIMEOUT_MS),
		});
	} catch {
		throw new Error("El servidor no respondió. Revisá la conexión.");
	}
	const data = (await res.json().catch(() => null)) as
		| (T & { error?: string })
		| null;
	if (!res.ok) throw new Error(data?.error ?? "Error de la API");
	// Un 200 con el cuerpo cortado no es una respuesta: devolver {} haría que
	// la pantalla reciba un turno vacío y se rompa.
	if (data === null)
		throw new Error("La respuesta del servidor llegó cortada.");
	return data;
}

function toBase64(bytes: Uint8Array) {
	let s = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(s);
}

function pcm16ToFloat(base64: string) {
	const bin = atob(base64);
	const out = new Float32Array(bin.length / 2);
	for (let i = 0; i < out.length; i++) {
		const v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
		out[i] = (v >= 0x8000 ? v - 0x10000 : v) / 0x8000;
	}
	return out;
}

function floatToPcm16(samples: Float32Array) {
	const out = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
		out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
	}
	return new Uint8Array(out.buffer);
}

// Mandar por un socket que Gemini ya cerró tira una excepción: se ignora para
// no llenar la consola (el cierre ya lo maneja onclose).
function safeSend(send: () => void) {
	try {
		send();
	} catch {}
}

// Procesador que copia el audio del micrófono al hilo principal.
const CAPTURE_WORKLET = `
class P0Capture extends AudioWorkletProcessor {
	process(inputs) {
		const ch = inputs[0] && inputs[0][0];
		if (ch) this.port.postMessage(ch.slice(0));
		return true;
	}
}
registerProcessor("p0-capture", P0Capture);
`;

// La sesión del SDK no dice si su WebSocket sigue abierto, y mandarle algo a
// uno que se está cerrando llena la consola de avisos. Si no se puede saber,
// se manda igual.
function openSession(session: LiveSession | null) {
	const ws = (session as unknown as { conn?: { ws?: WebSocket } } | null)?.conn
		?.ws;
	return session && (!ws || ws.readyState === WebSocket.OPEN) ? session : null;
}

export function useVoice({
	sessionId,
	onTurn,
	onTool,
	onState,
	onHearing,
	onEnd,
	onError,
}: Options) {
	const [status, setStatus] = useState<VoiceStatus>("idle");
	const [remainingMs, setRemainingMs] = useState<number | null>(null);
	const [studentSpeaking, setStudentSpeaking] = useState(false);
	const [patientSpeaking, setPatientSpeaking] = useState(false);

	const live = useRef<LiveSession | null>(null);
	// Número de conexión: los avisos de una conexión vieja se ignoran.
	const conn = useRef(0);
	const reconnects = useRef(0);
	const reconnectRef = useRef<() => void>(() => {});
	const mic = useRef<MediaStream | null>(null);
	const inCtx = useRef<AudioContext | null>(null);
	const out = useRef<{
		ctx: AudioContext;
		analyser: AnalyserNode;
		// Copia de la voz del paciente para los labios del avatar.
		stream: MediaStream;
		buf: Uint8Array<ArrayBuffer>;
		sources: Set<AudioBufferSourceNode>;
		playHead: number;
	} | null>(null);
	const st = useRef({
		studentText: "",
		patientText: "",
		lastStudentChunk: 0,
		patientTurnStarted: false,
		lastActivity: 0,
		silenceReported: false,
		deadline: 0,
	});
	const callbacks = useRef({
		onTurn,
		onTool,
		onState,
		onHearing,
		onEnd,
		onError,
	});
	callbacks.current = { onTurn, onTool, onState, onHearing, onEnd, onError };
	// Guarda lo que quedó a medio transcribir al cortar (se define más abajo).
	const flushPending = useRef<() => void>(() => {});
	// Con un examen abierto el silencio es normal: no se cuenta ni se interrumpe.
	const examining = useRef(false);
	// Llamadas a herramientas que Gemini canceló (el estudiante interrumpió):
	// si todavía no se ejecutaron, no se ejecutan ni se responden.
	const cancelledCalls = useRef(new Set<string>());
	// Notas para el paciente que llegaron mientras generaba su respuesta.
	const pendingNotes = useRef<string[]>([]);
	// Herramientas pedidas por el modelo que todavía no se respondieron: una
	// nota en ese momento cortaría la respuesta en curso.
	const toolsPending = useRef(0);
	// Se respondió una herramienta y el paciente todavía no terminó de contestar
	// (antes del primer audio, patientTurnStarted sigue en false).
	const awaitingReply = useRef(false);
	// Reconectando: todavía no hay sesión, pero va a haber. Las notas esperan en
	// vez de perderse.
	const reconnecting = useRef(false);
	// Guardado diferido del turno del estudiante (ver onMessage).
	const studentFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Contexto para el paciente sin hacerlo hablar (turnComplete false). Si el
	// paciente está generando su respuesta, mandarlo la cortaría (y contaría
	// como una interrupción del estudiante): espera a que termine su turno.
	const deliverNote = useCallback((text: string) => {
		if (
			st.current.patientTurnStarted ||
			toolsPending.current > 0 ||
			awaitingReply.current ||
			reconnecting.current
		) {
			pendingNotes.current.push(text);
			return;
		}
		const target = openSession(live.current);
		if (!target) return;
		safeSend(() =>
			target.sendClientContent({
				turns: [{ role: "user", parts: [{ text }] }],
				turnComplete: false,
			}),
		);
	}, []);

	// Todo lo que se manda al servidor va en fila (lib/voice/queue.ts): los
	// turnos quedan en el orden en que se dijeron, el permiso se anota antes de
	// que corra examinar y dos escrituras de la misma sesión no se pisan.
	const [queue] = useState(createWriteQueue);
	const enqueue = queue.enqueue;
	// Espera a que se guarde todo lo pendiente (antes de cerrar la consulta).
	const drain = queue.drain;
	// Cada start es un intento; stop lo invalida. Si se corta mientras pide el
	// micrófono o el token (cambio de pantalla, botón), no se conecta.
	const attempt = useRef(0);

	const stopPlayback = useCallback(() => {
		const o = out.current;
		if (!o) return;
		for (const src of o.sources) {
			try {
				src.stop();
			} catch {}
		}
		o.sources.clear();
		o.playHead = 0;
		setPatientSpeaking(false);
	}, []);

	const stop = useCallback(
		(reason: "ended" | "error" = "ended") => {
			attempt.current += 1;
			if (studentFlushTimer.current) {
				clearTimeout(studentFlushTimer.current);
				studentFlushTimer.current = null;
			}
			pendingNotes.current = [];
			reconnecting.current = false;
			// Lo último que se dijo antes de cortar también va al informe.
			flushPending.current();
			stopPlayback();
			const session = live.current;
			live.current = null;
			conn.current += 1;
			session?.close();
			for (const track of mic.current?.getTracks() ?? []) track.stop();
			mic.current = null;
			inCtx.current?.close().catch(() => {});
			inCtx.current = null;
			out.current?.ctx.close().catch(() => {});
			out.current = null;
			setStudentSpeaking(false);
			setStatus((s) => (s === "idle" ? s : reason));
		},
		[stopPlayback],
	);

	const event = useCallback(
		(
			type:
				| "interrupcion_estudiante"
				| "interrupcion_paciente"
				| "silencio_largo",
			durationMs?: number,
		) =>
			enqueue(() =>
				post<{ nota?: string | null }>(`/api/sessions/${sessionId}/events`, {
					type,
					durationMs,
				}),
			)
				.then(({ nota }) => {
					// El paciente se entera como contexto, sin que le toque hablar.
					if (nota) deliverNote(nota);
				})
				.catch(() => {}),
		[sessionId, enqueue, deliverNote],
	);

	const saveTurn = useCallback(
		async (speaker: Turn["speaker"], text: string, overlap: boolean) => {
			if (!text.trim()) return;
			await enqueue(async () => {
				try {
					const { turn, stateNote, state } = await post<{
						turn: Turn;
						stateNote: string | null;
						state: PatientState;
					}>(`/api/sessions/${sessionId}/voice-turns`, {
						speaker,
						text,
						overlap,
					});
					callbacks.current.onTurn(turn);
					callbacks.current.onState?.(state);
					// El clasificador cambió el ánimo del paciente: se lo contamos al
					// modelo como contexto, sin pedirle que responda (turnComplete false).
					if (stateNote)
						deliverNote(
							`(Nota interna, no la digas en voz alta: así te sentís ahora con el estudiante: ${stateNote}. Que se note en cómo respondés.)`,
						);
				} catch (e) {
					callbacks.current.onError(
						e instanceof Error ? e.message : "No se guardó un turno",
					);
				}
			});
		},
		[sessionId, enqueue, deliverNote],
	);

	const flushStudent = useCallback(() => {
		const s = st.current;
		const saved = saveTurn("estudiante", s.studentText, false);
		s.studentText = "";
		return saved;
	}, [saveTurn]);

	const flushPatient = useCallback(
		(overlap: boolean) => {
			const s = st.current;
			const saved = saveTurn("paciente", s.patientText, overlap);
			s.patientText = "";
			s.patientTurnStarted = false;
			return saved;
		},
		[saveTurn],
	);

	flushPending.current = () => {
		void flushStudent();
		void flushPatient(false);
	};

	const playChunk = useCallback((base64: string) => {
		const o = out.current;
		if (!o) return;
		// Si el navegador dejó el audio suspendido al conectar, otro intento.
		// Safari también lo deja "interrupted" al volver de segundo plano.
		if (o.ctx.state !== "running") o.ctx.resume().catch(() => {});
		const samples = pcm16ToFloat(base64);
		const buffer = o.ctx.createBuffer(1, samples.length, OUTPUT_RATE);
		buffer.copyToChannel(samples, 0);
		const src = o.ctx.createBufferSource();
		src.buffer = buffer;
		src.connect(o.analyser);
		const at = Math.max(o.ctx.currentTime, o.playHead);
		src.start(at);
		o.playHead = at + buffer.duration;
		o.sources.add(src);
		setPatientSpeaking(true);
		src.onended = () => {
			o.sources.delete(src);
			if (o.sources.size === 0) {
				setPatientSpeaking(false);
				st.current.lastActivity = Date.now();
			}
		};
	}, []);

	const answerTools = useCallback(
		async (
			calls: { id?: string; name?: string; args?: Record<string, unknown> }[],
		) => {
			// La respuesta va a la conexión que pidió la herramienta: tras una
			// reconexión, la nueva tiene otros ids. Si se cortó mientras esperaba
			// en la fila, la herramienta no se ejecuta.
			const target = live.current;
			const gen = conn.current;
			const functionResponses: FunctionResponse[] = [];
			for (const call of calls) {
				let output: Record<string, unknown>;
				let skipped = false;
				try {
					const run = await enqueue(() => {
						if (conn.current !== gen)
							return Promise.reject(new Error("La voz se cortó"));
						if (call.id && cancelledCalls.current.has(call.id)) {
							skipped = true;
							return Promise.reject(new Error("Llamada cancelada"));
						}
						return post<ToolRun>(`/api/sessions/${sessionId}/tools`, {
							name: call.name,
							arguments: call.args ?? {},
						});
					});
					output = run.output;
					callbacks.current.onTool(run.ui);
				} catch (e) {
					output = {
						error: e instanceof Error ? e.message : "falló la herramienta",
					};
				}
				if (skipped) continue;
				functionResponses.push({
					id: call.id,
					name: call.name,
					response: output,
				});
			}
			if (
				functionResponses.length > 0 &&
				target &&
				live.current === target &&
				openSession(target)
			) {
				safeSend(() => target.sendToolResponse({ functionResponses }));
				// Se respondió: el paciente va a hablar ahora (las notas esperan a
				// que termine).
				awaitingReply.current = true;
				return true;
			}
			return false;
		},
		[sessionId, enqueue],
	);

	const runTools = useCallback(
		async (
			calls: { id?: string; name?: string; args?: Record<string, unknown> }[],
		) => {
			toolsPending.current += 1;
			let answered = false;
			try {
				answered = await answerTools(calls);
			} finally {
				toolsPending.current -= 1;
				// Solo si no se mandó respuesta (todas canceladas): el paciente no
				// va a hablar y las notas no tienen por qué esperar. Si se respondió,
				// el paciente empieza a contestar y las notas esperan a que termine
				// (turnComplete), o lo cortarían.
				if (
					!answered &&
					toolsPending.current === 0 &&
					!st.current.patientTurnStarted
				)
					for (const note of pendingNotes.current.splice(0)) deliverNote(note);
			}
		},
		[answerTools, deliverNote],
	);

	const onMessage = useCallback(
		(m: LiveServerMessage) => {
			const s = st.current;
			const now = Date.now();
			const content = m.serverContent;

			// Google avisa que va a cerrar la conexión: se reconecta antes.
			if (m.goAway) {
				reconnectRef.current();
				return;
			}
			if (content?.inputTranscription?.text) {
				s.studentText += content.inputTranscription.text;
				callbacks.current.onHearing?.(s.studentText);
				s.lastStudentChunk = now;
				s.lastActivity = now;
				s.silenceReported = false;
				setStudentSpeaking(true);
			}
			if (content?.interrupted) {
				awaitingReply.current = false;
				// El estudiante habló encima del paciente: se corta el audio. Solo
				// cuenta como interrupción (y penaliza) si el paciente ya se
				// escuchaba; si el audio no había empezado, no interrumpió a nadie.
				const wasPlaying = (out.current?.sources.size ?? 0) > 0;
				stopPlayback();
				if (wasPlaying) event("interrupcion_estudiante");
				// Lo del estudiante que esperaba su transcripción va antes que el
				// pedazo del paciente, como en turnComplete.
				if (studentFlushTimer.current) {
					clearTimeout(studentFlushTimer.current);
					studentFlushTimer.current = null;
					flushStudent();
				}
				flushPatient(wasPlaying);
			}
			for (const part of content?.modelTurn?.parts ?? []) {
				const data = part.inlineData?.data;
				if (!data) continue;
				if (!s.patientTurnStarted) {
					s.patientTurnStarted = true;
					// El paciente arranca mientras el estudiante todavía hablaba.
					if (now - s.lastStudentChunk < 300 && s.studentText.trim())
						event("interrupcion_paciente");
					// La transcripción del estudiante suele llegar un poco tarde: se
					// guarda su turno en un momento, para no partirlo en dos. Si
					// antes termina el turno del paciente, se guarda ahí (primero).
					if (studentFlushTimer.current)
						clearTimeout(studentFlushTimer.current);
					studentFlushTimer.current = setTimeout(() => {
						studentFlushTimer.current = null;
						flushStudent();
					}, STUDENT_FLUSH_DELAY_MS);
				}
				playChunk(data);
			}
			if (content?.outputTranscription?.text)
				s.patientText += content.outputTranscription.text;
			if (content?.turnComplete) {
				awaitingReply.current = false;
				if (studentFlushTimer.current) {
					clearTimeout(studentFlushTimer.current);
					studentFlushTimer.current = null;
				}
				flushStudent();
				flushPatient(false);
				// Las notas que esperaban al paciente ya se pueden mandar.
				for (const note of pendingNotes.current.splice(0)) deliverNote(note);
			}
			for (const id of m.toolCallCancellation?.ids ?? [])
				cancelledCalls.current.add(id);
			if (m.toolCall?.functionCalls?.length) {
				flushStudent();
				runTools(m.toolCall.functionCalls);
			}
			const u = m.usageMetadata;
			if (u) {
				const audio = (list?: { modality?: string; tokenCount?: number }[]) =>
					(list ?? [])
						.filter((d) => d.modality === "AUDIO")
						.reduce((n, d) => n + (d.tokenCount ?? 0), 0);
				const usage = {
					inputTokens: u.promptTokenCount ?? 0,
					outputTokens: u.responseTokenCount ?? 0,
					inputAudioTokens: audio(u.promptTokensDetails),
					outputAudioTokens: audio(u.responseTokensDetails),
					cachedTokens: u.cachedContentTokenCount ?? 0,
				};
				enqueue(() => post(`/api/sessions/${sessionId}/usage`, usage)).catch(
					() => {},
				);
			}
		},
		[
			deliverNote,
			enqueue,
			event,
			flushPatient,
			flushStudent,
			playChunk,
			runTools,
			sessionId,
			stopPlayback,
		],
	);

	// Pide un token y abre la conexión con Gemini. Si mientras tanto se cortó o
	// se volvió a conectar, la conexión nueva se descarta.
	const connect = useCallback(async () => {
		const gen = ++conn.current;
		const token = await post<LiveToken>("/api/voice/session", { sessionId });
		const ai = new GoogleGenAI({
			apiKey: token.token,
			httpOptions: { apiVersion: token.apiVersion },
		});
		const opening = ai.live.connect({
			model: token.model,
			// La configuración real va fijada en el token.
			config: { responseModalities: [Modality.AUDIO] },
			callbacks: {
				onmessage: (m) => {
					if (gen === conn.current) onMessage(m);
				},
				onclose: () => {
					// Corte que no pidió nadie: se reconecta.
					if (gen === conn.current && live.current) reconnectRef.current();
				},
			},
		});
		// Si Google no abre la conexión, la pantalla quedaría "conectando" para
		// siempre (el reloj de 8 minutos solo corre en vivo). Una conexión que
		// llega tarde se cierra sola.
		let timer: ReturnType<typeof setTimeout> | undefined;
		const session = await Promise.race([
			opening,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					opening.then((late) => late.close()).catch(() => {});
					reject(new Error("El paciente no responde. Probá de nuevo."));
				}, CONNECT_TIMEOUT_MS);
			}),
		]).finally(() => clearTimeout(timer));
		if (gen !== conn.current) {
			session.close();
			throw new Error("Conexión de voz descartada");
		}
		live.current = session;
		return token;
	}, [onMessage, sessionId]);

	const reconnect = useCallback(async () => {
		const s = st.current;
		if (
			reconnects.current >= MAX_RECONNECTS ||
			Date.now() >= s.deadline ||
			!live.current
		) {
			stop("error");
			callbacks.current.onError(
				"Se cortó la conexión con el paciente. Tocá de nuevo “hablar por voz” para seguir.",
			);
			return;
		}
		reconnects.current += 1;
		// Si mientras tanto se corta la voz (botón, cambio de pantalla), no se
		// vuelve a conectar.
		const mine = attempt.current;
		const old = live.current;
		live.current = null;
		conn.current += 1;
		// Desde acá no hay sesión: las notas esperan a la nueva (incluida la de
		// ánimo que sale de guardar lo pendiente, justo abajo). Si se corta, stop
		// y start lo limpian.
		reconnecting.current = true;
		// La conexión nueva no recibió la respuesta de herramienta pendiente: el
		// paciente no va a contestarla, así que las notas no la esperan.
		awaitingReply.current = false;
		old.close();
		stopPlayback();
		setStatus("reconnecting");
		// Lo que quedó a medias se guarda antes, así el paciente lo recibe.
		await Promise.all([flushStudent(), flushPatient(true)]);
		if (attempt.current !== mine) return;
		try {
			await connect();
			if (attempt.current !== mine) return;
			s.lastActivity = Date.now();
			setStatus("live");
			// Las notas que llegaron mientras reconectaba salen en la sesión nueva.
			reconnecting.current = false;
			for (const note of pendingNotes.current.splice(0)) deliverNote(note);
		} catch (e) {
			// Si la estudiante cortó mientras reconectaba, no es un error.
			if (attempt.current !== mine) return;
			if (e instanceof Error && e.message === "Conexión de voz descartada")
				return;
			stop("error");
			callbacks.current.onError(
				e instanceof Error ? e.message : "No se pudo reconectar la voz",
			);
		} finally {
			// Falló o se cortó: ya no se espera una sesión nueva. Solo si esta
			// reconexión sigue siendo la vigente (una vieja que termina tarde no
			// le baja el indicador a una nueva).
			if (attempt.current === mine) reconnecting.current = false;
		}
	}, [connect, deliverNote, flushPatient, flushStudent, stop, stopPlayback]);
	reconnectRef.current = () => {
		// Red de seguridad: si algo inesperado falla al reconectar, se corta con
		// aviso en vez de quedar "reconectando" para siempre.
		reconnect().catch(() => {
			stop("error");
			callbacks.current.onError(
				"Se cortó la conexión con el paciente. Tocá de nuevo “hablar por voz” para seguir.",
			);
		});
	};

	const start = useCallback(async () => {
		// Doble clic en "Acepto": el segundo no arranca otra conexión (pisaría
		// el audio del primero sin cerrarlo).
		if (inCtx.current || live.current) return;
		setStatus("connecting");
		// El reloj de una voz anterior no vale mientras conecta.
		setRemainingMs(null);
		reconnects.current = 0;
		// Nada de una consulta anterior pasa a esta.
		pendingNotes.current = [];
		awaitingReply.current = false;
		reconnecting.current = false;
		const mine = ++attempt.current;
		const cancelled = () => attempt.current !== mine;
		// Los AudioContext se crean en el mismo clic (Safari, sobre todo en
		// iPhone, bloquea el audio que no arranca por un gesto del usuario) y a la
		// frecuencia propia del navegador: Firefox no deja mezclar frecuencias, y
		// Gemini convierte la entrada y el navegador la salida de 24 kHz.
		const outCtx = new AudioContext();
		const ctx = new AudioContext();
		out.current = null;
		inCtx.current = ctx;
		// resume() también en el mismo clic: fuera del gesto, Safari puede dejar
		// la promesa pendiente para siempre.
		const resumed = Promise.all([outCtx.resume(), ctx.resume()]).catch(
			() => {},
		);
		try {
			// Primero el micrófono: si se niega, no se gasta un token.
			let stream: MediaStream;
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					audio: { echoCancellation: true, noiseSuppression: true },
				});
			} catch (e) {
				const name = e instanceof DOMException ? e.name : "";
				throw new Error(
					name === "NotAllowedError"
						? "El navegador bloqueó el micrófono. Permitilo (ícono del candado en la barra de direcciones) y probá de nuevo."
						: name === "NotFoundError"
							? "No encontramos un micrófono conectado."
							: "No pudimos usar el micrófono.",
				);
			}
			// Se cortó mientras se pedía el permiso (cambio de pantalla, botón).
			if (cancelled()) {
				for (const track of stream.getTracks()) track.stop();
				outCtx.close().catch(() => {});
				return;
			}
			mic.current = stream;
			// Se espera un momento a que arranque el audio, sin trabar la conexión
			// si el navegador no lo deja (se intenta de nuevo al reproducir).
			await Promise.race([
				resumed,
				new Promise((resolve) => setTimeout(resolve, RESUME_WAIT_MS)),
			]);

			// Salida del paciente, con un AnalyserNode para el avatar.
			const analyser = outCtx.createAnalyser();
			analyser.fftSize = 512;
			analyser.connect(outCtx.destination);
			// El avatar vive en otro AudioContext: se le pasa la voz por un
			// MediaStream (no suena dos veces, solo lo analiza).
			const copy = outCtx.createMediaStreamDestination();
			analyser.connect(copy);
			out.current = {
				ctx: outCtx,
				analyser,
				stream: copy.stream,
				buf: new Uint8Array(analyser.fftSize),
				sources: new Set(),
				playHead: 0,
			};

			// Antes de conectar: lo que llegue de esta conexión arranca de cero.
			st.current = {
				studentText: "",
				patientText: "",
				lastStudentChunk: 0,
				patientTurnStarted: false,
				lastActivity: Date.now(),
				silenceReported: false,
				deadline: Number.POSITIVE_INFINITY,
			};
			if (cancelled()) {
				outCtx.close().catch(() => {});
				return;
			}
			const token = await connect();
			if (cancelled()) return;
			st.current.deadline = Date.now() + token.remainingMs;

			// Entrada: el micrófono a la frecuencia del navegador.
			const url = URL.createObjectURL(
				new Blob([CAPTURE_WORKLET], { type: "application/javascript" }),
			);
			await ctx.audioWorklet.addModule(url);
			URL.revokeObjectURL(url);
			// Se cortó mientras cargaba el procesador: no se marca "en línea".
			if (cancelled()) return;
			const node = new AudioWorkletNode(ctx, "p0-capture");
			ctx.createMediaStreamSource(stream).connect(node);
			// En Safari un procesador sin salida puede no correr: va a una salida
			// en silencio.
			const mute = ctx.createGain();
			mute.gain.value = 0;
			node.connect(mute);
			mute.connect(ctx.destination);
			// Safari pausa el audio del micrófono (llamada, segundo plano): se
			// reanuda. Si el micrófono se corta, se avisa en vez de seguir mudo.
			ctx.onstatechange = () => {
				if (ctx.state !== "running" && ctx.state !== "closed")
					ctx.resume().catch(() => {});
			};
			stream.getTracks()[0]?.addEventListener?.("ended", () => {
				if (cancelled() || !live.current) return;
				stop("error");
				callbacks.current.onError(
					"Se cortó el micrófono. Tocá de nuevo “hablar por voz” para seguir.",
				);
			});
			const rate = ctx.sampleRate;
			const chunk: number[] = [];
			node.port.onmessage = (e: MessageEvent<Float32Array>) => {
				for (const v of e.data) chunk.push(v);
				// Envía de a ~100 ms.
				if (chunk.length >= rate / 10) {
					const samples = Float32Array.from(chunk.splice(0, chunk.length));
					const target = openSession(live.current);
					if (!target) return;
					safeSend(() =>
						target.sendRealtimeInput({
							audio: {
								data: toBase64(floatToPcm16(samples)),
								mimeType: `audio/pcm;rate=${rate}`,
							},
						}),
					);
				}
			};

			setRemainingMs(token.remainingMs);
			// Si se cortó mientras cargaba y ya está reconectando, no se pisa.
			setStatus((st) => (st === "reconnecting" ? st : "live"));
		} catch (e) {
			if (cancelled()) return;
			// Cortó la usuaria mientras conectaba: no es un error.
			if (e instanceof Error && e.message === "Conexión de voz descartada") {
				outCtx.close().catch(() => {});
				return;
			}
			stop("error");
			if (!out.current) outCtx.close().catch(() => {});
			callbacks.current.onError(
				e instanceof Error ? e.message : "No se pudo iniciar la voz",
			);
		}
	}, [connect, stop]);

	// Reloj: tope de 8 minutos, indicador de habla y silencios largos.
	useEffect(() => {
		if (status !== "live") return;
		const id = setInterval(() => {
			const s = st.current;
			const now = Date.now();
			if (now - s.lastStudentChunk > SPEAKING_WINDOW_MS)
				setStudentSpeaking(false);
			const left = Math.max(0, s.deadline - now);
			setRemainingMs(left);
			if (left === 0) {
				stop();
				callbacks.current.onEnd();
				return;
			}
			if (examining.current) {
				s.lastActivity = now;
				return;
			}
			const patientPlaying = (out.current?.sources.size ?? 0) > 0;
			const studentActive = now - s.lastStudentChunk < SPEAKING_WINDOW_MS;
			const quietFor = now - s.lastActivity;
			if (
				!patientPlaying &&
				!studentActive &&
				!s.silenceReported &&
				quietFor > LONG_SILENCE_MS
			) {
				s.silenceReported = true;
				event("silencio_largo", quietFor);
				// El paciente vuelve a hablar tras el silencio, según su personalidad.
				const target = openSession(live.current);
				if (target)
					safeSend(() =>
						target.sendClientContent({
							turns: [
								{
									role: "user",
									parts: [
										{
											text: "(El estudiante lleva un rato en silencio. Reaccioná según tu personalidad: preguntá si pasa algo, mostrate impaciente o esperá con un comentario breve.)",
										},
									],
								},
							],
							turnComplete: true,
						}),
					);
			}
		}, 500);
		return () => clearInterval(id);
	}, [status, event, stop]);

	// Al salir de la pantalla se corta la llamada.
	useEffect(() => () => stop(), [stop]);

	// Nivel de voz del paciente de 0 a 1. Pensado para leerlo en un
	// requestAnimationFrame del avatar, sin re-renderizar.
	const readPatientLevel = useCallback(() => {
		const o = out.current;
		if (!o) return 0;
		o.analyser.getByteTimeDomainData(o.buf);
		let sum = 0;
		for (const v of o.buf) sum += ((v - 128) / 128) ** 2;
		return Math.min(1, Math.sqrt(sum / o.buf.length) * 4);
	}, []);

	// Voz del paciente como MediaStream, para mover los labios del avatar.
	// Existe desde que arranca la voz hasta que se corta.
	const patientStream = useCallback(() => out.current?.stream ?? null, []);

	// Contexto para el paciente sin hacerlo hablar (turnComplete false): por
	// ejemplo, que el estudiante terminó de revisarlo.
	const sendNote = useCallback(
		(note: string) =>
			deliverNote(`(Nota interna, no la digas en voz alta: ${note})`),
		[deliverNote],
	);

	// Algo que el paciente tiene que decir ya (turnComplete true): por
	// ejemplo, "sí" o "no" cuando el estudiante le toca la rodilla (Persona 3).
	const say = useCallback((text: string) => {
		const target = openSession(live.current);
		if (!target) return;
		safeSend(() =>
			target.sendClientContent({
				turns: [{ role: "user", parts: [{ text }] }],
				turnComplete: true,
			}),
		);
	}, []);

	const setExamining = useCallback((value: boolean) => {
		examining.current = value;
		st.current.lastActivity = Date.now();
	}, []);

	return {
		setExamining,
		status,
		remainingMs,
		studentSpeaking,
		patientSpeaking,
		start,
		stop,
		drain,
		readPatientLevel,
		patientStream,
		sendNote,
		say,
	};
}
