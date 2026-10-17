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

import type { Turn } from "@/lib/contracts/session";
import { createWriteQueue } from "@/lib/voice/queue";
import type { ToolRun, ToolUi } from "@/server/voice";

export type VoiceStatus = "idle" | "connecting" | "live" | "ended" | "error";

// Silencio largo: sin nadie hablando durante este tiempo (plan.md, sección 5).
const LONG_SILENCE_MS = 20_000;
// Se considera que el estudiante sigue hablando si llegó transcripción hace menos de esto.
const SPEAKING_WINDOW_MS = 900;
const OUTPUT_RATE = 24_000;

type Options = {
	sessionId: string;
	onTurn: (turn: Turn) => void;
	onTool: (ui: ToolUi) => void;
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
			signal: AbortSignal.timeout(POST_TIMEOUT_MS),
		});
	} catch {
		throw new Error("El servidor no respondió. Revisá la conexión.");
	}
	const data = (await res.json().catch(() => ({}))) as T & { error?: string };
	if (!res.ok) throw new Error(data.error ?? "Error de la API");
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

export function useVoice({
	sessionId,
	onTurn,
	onTool,
	onEnd,
	onError,
}: Options) {
	const [status, setStatus] = useState<VoiceStatus>("idle");
	const [remainingMs, setRemainingMs] = useState<number | null>(null);
	const [studentSpeaking, setStudentSpeaking] = useState(false);
	const [patientSpeaking, setPatientSpeaking] = useState(false);

	const live = useRef<LiveSession | null>(null);
	const mic = useRef<MediaStream | null>(null);
	const inCtx = useRef<AudioContext | null>(null);
	const out = useRef<{
		ctx: AudioContext;
		analyser: AnalyserNode;
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
	const callbacks = useRef({ onTurn, onTool, onEnd, onError });
	callbacks.current = { onTurn, onTool, onEnd, onError };

	// Todo lo que se manda al servidor va en fila (lib/voice/queue.ts).
	const [queue] = useState(createWriteQueue);
	const enqueue = queue.enqueue;
	// Espera a que se guarde todo lo pendiente (antes de cerrar la consulta).
	const drain = queue.drain;

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

	const event = useCallback(
		(
			type:
				| "interrupcion_estudiante"
				| "interrupcion_paciente"
				| "silencio_largo",
			durationMs?: number,
		) =>
			enqueue(() =>
				post(`/api/sessions/${sessionId}/events`, { type, durationMs }),
			).catch(() => {}),
		[sessionId, enqueue],
	);

	const saveTurn = useCallback(
		(speaker: Turn["speaker"], text: string, overlap: boolean) => {
			if (!text.trim()) return;
			enqueue(async () => {
				try {
					const { turn } = await post<{ turn: Turn }>(
						`/api/sessions/${sessionId}/voice-turns`,
						{ speaker, text, overlap },
					);
					callbacks.current.onTurn(turn);
				} catch (e) {
					callbacks.current.onError(
						e instanceof Error ? e.message : "No se guardó un turno",
					);
				}
			});
		},
		[sessionId, enqueue],
	);

	const flushStudent = useCallback(() => {
		const s = st.current;
		if (s.studentText.trim()) saveTurn("estudiante", s.studentText, false);
		s.studentText = "";
	}, [saveTurn]);

	const flushPatient = useCallback(
		(overlap: boolean) => {
			const s = st.current;
			if (s.patientText.trim()) saveTurn("paciente", s.patientText, overlap);
			s.patientText = "";
			s.patientTurnStarted = false;
		},
		[saveTurn],
	);

	// Cada start es un intento; stop lo invalida. Si se corta mientras conecta
	// (cambio de pantalla, botón), lo que llegue después se cierra solo.
	const attempt = useRef(0);

	const stop = useCallback(
		(reason: "ended" | "error" = "ended") => {
			attempt.current++;
			// Lo que se estaba diciendo al cortar también queda en la transcripción.
			if (live.current) {
				flushStudent();
				flushPatient(false);
			}
			stopPlayback();
			const session = live.current;
			live.current = null;
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
		[flushPatient, flushStudent, stopPlayback],
	);

	const playChunk = useCallback((base64: string) => {
		const o = out.current;
		if (!o) return;
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

	const runTools = useCallback(
		async (
			calls: { id?: string; name?: string; args?: Record<string, unknown> }[],
		) => {
			// La respuesta va a la sesión que pidió la herramienta, no a una
			// reconexión posterior (otra sesión de Gemini, con otros ids).
			const target = live.current;
			const myAttempt = attempt.current;
			const functionResponses: FunctionResponse[] = [];
			for (const call of calls) {
				let output: Record<string, unknown>;
				try {
					const run = await enqueue(() => {
						// Si la voz se cortó mientras esperaba en la fila, no se ejecuta.
						if (attempt.current !== myAttempt)
							return Promise.reject(new Error("La voz se cortó"));
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
				functionResponses.push({
					id: call.id,
					name: call.name,
					response: output,
				});
			}
			if (target && live.current === target)
				safeSend(() => target.sendToolResponse({ functionResponses }));
		},
		[sessionId, enqueue],
	);

	const onMessage = useCallback(
		(m: LiveServerMessage) => {
			const s = st.current;
			const now = Date.now();
			const content = m.serverContent;

			if (content?.inputTranscription?.text) {
				s.studentText += content.inputTranscription.text;
				s.lastStudentChunk = now;
				s.lastActivity = now;
				s.silenceReported = false;
				setStudentSpeaking(true);
			}
			if (content?.interrupted) {
				// El estudiante habló encima del paciente: se corta el audio. Solo
				// cuenta como interrupción (y penaliza) si el paciente ya se
				// escuchaba; si el audio no había empezado, no interrumpió a nadie.
				const wasPlaying = (out.current?.sources.size ?? 0) > 0;
				stopPlayback();
				if (wasPlaying) event("interrupcion_estudiante");
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
					flushStudent();
				}
				playChunk(data);
			}
			if (content?.outputTranscription?.text)
				s.patientText += content.outputTranscription.text;
			if (content?.turnComplete) {
				flushStudent();
				flushPatient(false);
			}
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

	const start = useCallback(async () => {
		setStatus("connecting");
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
			await Promise.all([outCtx.resume(), ctx.resume()]);

			const token = await post<{
				token: string;
				apiVersion: string;
				model: string;
				remainingMs: number;
			}>("/api/voice/session", { sessionId });
			if (cancelled()) {
				outCtx.close().catch(() => {});
				return;
			}

			// Salida del paciente, con un AnalyserNode para el avatar.
			const analyser = outCtx.createAnalyser();
			analyser.fftSize = 512;
			analyser.connect(outCtx.destination);
			out.current = {
				ctx: outCtx,
				analyser,
				buf: new Uint8Array(analyser.fftSize),
				sources: new Set(),
				playHead: 0,
			};

			// Antes de conectar: lo que llegue de esta sesión arranca de cero.
			st.current = {
				studentText: "",
				patientText: "",
				lastStudentChunk: 0,
				patientTurnStarted: false,
				lastActivity: Date.now(),
				silenceReported: false,
				deadline: Date.now() + token.remainingMs,
			};

			const ai = new GoogleGenAI({
				apiKey: token.token,
				httpOptions: { apiVersion: token.apiVersion },
			});
			const session = await ai.live.connect({
				model: token.model,
				// La configuración real va fijada en el token.
				config: { responseModalities: [Modality.AUDIO] },
				callbacks: {
					// Después de close() pueden llegar mensajes que ya venían en
					// camino: se ignoran, o una herramienta (examinar) correría en
					// el servidor con la consulta ya cortada.
					onmessage: (m) => {
						if (!cancelled()) onMessage(m);
					},
					onerror: () =>
						callbacks.current.onError("Se cortó la conexión de voz."),
					onclose: () => {
						// Si se cortó sin que lo pidiéramos, avisar para reconectar
						// (el paciente recibe lo ya hablado).
						if (live.current && !cancelled()) {
							stop();
							callbacks.current.onError(
								"Se cortó la conexión con el paciente. Tocá de nuevo “hablar por voz” para seguir.",
							);
						}
					},
				},
			});
			if (cancelled()) {
				session.close();
				return;
			}
			live.current = session;

			// Entrada: el micrófono a la frecuencia del navegador.
			const url = URL.createObjectURL(
				new Blob([CAPTURE_WORKLET], { type: "application/javascript" }),
			);
			await ctx.audioWorklet.addModule(url);
			URL.revokeObjectURL(url);
			if (cancelled()) return;
			const node = new AudioWorkletNode(ctx, "p0-capture");
			ctx.createMediaStreamSource(stream).connect(node);
			const rate = ctx.sampleRate;
			const chunk: number[] = [];
			node.port.onmessage = (e: MessageEvent<Float32Array>) => {
				for (const v of e.data) chunk.push(v);
				// Envía de a ~100 ms.
				if (chunk.length >= rate / 10) {
					const samples = Float32Array.from(chunk.splice(0, chunk.length));
					const target = live.current;
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
			setStatus("live");
		} catch (e) {
			if (cancelled()) return;
			stop("error");
			// stop() solo cierra la salida si ya estaba armada.
			outCtx.close().catch(() => {});
			callbacks.current.onError(
				e instanceof Error ? e.message : "No se pudo iniciar la voz",
			);
		}
	}, [onMessage, sessionId, stop]);

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
				const target = live.current;
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

	return {
		status,
		remainingMs,
		studentSpeaking,
		patientSpeaking,
		start,
		stop,
		drain,
		readPatientLevel,
	};
}
