"use client";

// Consulta por voz con OpenAI Realtime por WebRTC (Persona 1).
// El navegador conecta micrófono y audio; transcripciones, herramientas,
// interrupciones y silencios se mandan a nuestro servidor.
import { useCallback, useEffect, useRef, useState } from "react";

import type { Turn } from "@/lib/contracts/session";
import type { ToolRun, ToolUi } from "@/server/voice";

export type VoiceStatus = "idle" | "connecting" | "live" | "ended" | "error";

// Silencio largo: sin nadie hablando durante este tiempo (plan.md, sección 5).
const LONG_SILENCE_MS = 20_000;

type Options = {
	sessionId: string;
	onTurn: (turn: Turn) => void;
	onTool: (ui: ToolUi) => void;
	onEnd: () => void;
	onError: (message: string) => void;
};

async function post<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const data = (await res.json().catch(() => ({}))) as T & { error?: string };
	if (!res.ok) throw new Error(data.error ?? "Error de la API");
	return data;
}

type RealtimeEvent = {
	type: string;
	transcript?: string;
	response?: {
		status?: string;
		output?: {
			type: string;
			name?: string;
			call_id?: string;
			arguments?: string;
		}[];
	};
};

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

	const pc = useRef<RTCPeerConnection | null>(null);
	const dc = useRef<RTCDataChannel | null>(null);
	const mic = useRef<MediaStream | null>(null);
	const audio = useRef<HTMLAudioElement | null>(null);
	const flags = useRef({
		student: false,
		patient: false,
		overlap: false,
		lastActivity: 0,
		silenceReported: false,
		deadline: 0,
	});
	const callbacks = useRef({ onTurn, onTool, onEnd, onError });
	callbacks.current = { onTurn, onTool, onEnd, onError };

	const stop = useCallback((reason: "ended" | "error" = "ended") => {
		dc.current?.close();
		pc.current?.close();
		for (const track of mic.current?.getTracks() ?? []) track.stop();
		dc.current = null;
		pc.current = null;
		mic.current = null;
		setStudentSpeaking(false);
		setPatientSpeaking(false);
		setStatus(reason);
	}, []);

	const sendEvent = useCallback((event: Record<string, unknown>) => {
		if (dc.current?.readyState === "open")
			dc.current.send(JSON.stringify(event));
	}, []);

	const event = useCallback(
		(
			type:
				| "interrupcion_estudiante"
				| "interrupcion_paciente"
				| "silencio_largo",
			durationMs?: number,
		) =>
			post(`/api/sessions/${sessionId}/events`, { type, durationMs }).catch(
				() => {},
			),
		[sessionId],
	);

	const saveTurn = useCallback(
		async (speaker: Turn["speaker"], text: string, overlap: boolean) => {
			if (!text.trim()) return;
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
		},
		[sessionId],
	);

	const runTools = useCallback(
		async (calls: { name: string; call_id: string; arguments: string }[]) => {
			for (const call of calls) {
				let output: Record<string, unknown>;
				try {
					const args = call.arguments ? JSON.parse(call.arguments) : {};
					const run = await post<ToolRun>(`/api/sessions/${sessionId}/tools`, {
						name: call.name,
						arguments: args,
					});
					output = run.output;
					callbacks.current.onTool(run.ui);
				} catch (e) {
					output = {
						error: e instanceof Error ? e.message : "falló la herramienta",
					};
				}
				sendEvent({
					type: "conversation.item.create",
					item: {
						type: "function_call_output",
						call_id: call.call_id,
						output: JSON.stringify(output),
					},
				});
			}
			// Que el paciente reaccione al resultado.
			sendEvent({ type: "response.create" });
		},
		[sessionId, sendEvent],
	);

	const onMessage = useCallback(
		(raw: MessageEvent) => {
			let e: RealtimeEvent;
			try {
				e = JSON.parse(String(raw.data));
			} catch {
				return;
			}
			const f = flags.current;
			const now = Date.now();
			switch (e.type) {
				case "input_audio_buffer.speech_started":
					// El estudiante empieza a hablar mientras habla el paciente.
					if (f.patient) {
						f.overlap = true;
						event("interrupcion_estudiante");
					}
					f.student = true;
					f.lastActivity = now;
					f.silenceReported = false;
					setStudentSpeaking(true);
					break;
				case "input_audio_buffer.speech_stopped":
					f.student = false;
					f.lastActivity = now;
					setStudentSpeaking(false);
					break;
				case "conversation.item.input_audio_transcription.completed":
					saveTurn("estudiante", e.transcript ?? "", f.overlap);
					f.overlap = false;
					break;
				case "response.created":
					// El paciente arranca a hablar mientras habla el estudiante.
					if (f.student) event("interrupcion_paciente");
					f.patient = true;
					setPatientSpeaking(true);
					break;
				case "output_audio_buffer.started":
					f.patient = true;
					setPatientSpeaking(true);
					break;
				case "output_audio_buffer.stopped":
					f.patient = false;
					f.lastActivity = now;
					setPatientSpeaking(false);
					break;
				case "response.output_audio_transcript.done":
					saveTurn("paciente", e.transcript ?? "", false);
					break;
				case "response.done": {
					if (e.response?.status === "cancelled") {
						f.patient = false;
						setPatientSpeaking(false);
					}
					const calls = (e.response?.output ?? [])
						.filter((o) => o.type === "function_call" && o.name && o.call_id)
						.map((o) => ({
							name: o.name as string,
							call_id: o.call_id as string,
							arguments: o.arguments ?? "{}",
						}));
					if (calls.length > 0) runTools(calls);
					break;
				}
				case "error":
					console.error("Realtime", e);
					break;
			}
		},
		[event, runTools, saveTurn],
	);

	const start = useCallback(async () => {
		setStatus("connecting");
		try {
			const session = await post<{ clientSecret: string; remainingMs: number }>(
				"/api/realtime/session",
				{ sessionId },
			);
			const peer = new RTCPeerConnection();
			pc.current = peer;
			const player = audio.current ?? new Audio();
			player.autoplay = true;
			audio.current = player;
			peer.ontrack = (t) => {
				player.srcObject = t.streams[0] ?? null;
			};
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mic.current = stream;
			for (const track of stream.getTracks()) peer.addTrack(track, stream);
			const channel = peer.createDataChannel("oai-events");
			dc.current = channel;
			channel.onmessage = onMessage;
			const offer = await peer.createOffer();
			await peer.setLocalDescription(offer);
			const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
				method: "POST",
				body: offer.sdp,
				headers: {
					Authorization: `Bearer ${session.clientSecret}`,
					"Content-Type": "application/sdp",
				},
			});
			if (!answer.ok)
				throw new Error("No se pudo conectar el audio con el paciente");
			await peer.setRemoteDescription({
				type: "answer",
				sdp: await answer.text(),
			});
			flags.current = {
				student: false,
				patient: false,
				overlap: false,
				lastActivity: Date.now(),
				silenceReported: false,
				deadline: Date.now() + session.remainingMs,
			};
			setRemainingMs(session.remainingMs);
			setStatus("live");
		} catch (e) {
			stop("error");
			callbacks.current.onError(
				e instanceof Error ? e.message : "No se pudo iniciar la voz",
			);
		}
	}, [onMessage, sessionId, stop]);

	// Reloj: tope de 8 minutos y silencios largos.
	useEffect(() => {
		if (status !== "live") return;
		const id = setInterval(() => {
			const f = flags.current;
			const now = Date.now();
			const left = Math.max(0, f.deadline - now);
			setRemainingMs(left);
			if (left === 0) {
				stop();
				callbacks.current.onEnd();
				return;
			}
			const quietFor = now - f.lastActivity;
			if (
				!f.student &&
				!f.patient &&
				!f.silenceReported &&
				quietFor > LONG_SILENCE_MS
			) {
				f.silenceReported = true;
				event("silencio_largo", quietFor);
				// El paciente vuelve a hablar tras el silencio, según su personalidad.
				sendEvent({
					type: "response.create",
					response: {
						instructions:
							"El estudiante lleva un rato en silencio. Reaccioná según tu personalidad: preguntá si pasa algo, mostrate impaciente o esperá con un comentario breve.",
					},
				});
			}
		}, 1000);
		return () => clearInterval(id);
	}, [status, event, sendEvent, stop]);

	// Al salir de la pantalla se corta la llamada.
	useEffect(() => () => stop(), [stop]);

	return { status, remainingMs, studentSpeaking, patientSpeaking, start, stop };
}
