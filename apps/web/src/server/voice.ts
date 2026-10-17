// Consulta por voz con OpenAI Realtime por WebRTC (Persona 1).
// El servidor pide una clave efímera con las instrucciones del paciente (sin
// el diagnóstico) y ejecuta las herramientas; el navegador solo conecta el
// audio y reenvía transcripciones y llamadas.
import "server-only";

import type { ExamResult, VitalsMeasurement } from "@/lib/contracts/exam";
import type {
	PatientState,
	SessionEventType,
	Turn,
	VoiceUsage,
} from "@/lib/contracts/session";
import { bloodPressureReading } from "@/lib/patient/blood-pressure";
import { buildPatientPrompt } from "@/lib/patient/brief";
import { decideExam } from "@/lib/patient/exam-instruction";
import { isToolName, PATIENT_TOOLS, toolArgs } from "@/lib/patient/tools";

import { HttpError } from "./auth";
import {
	activeSession,
	brief,
	defaultZone,
	noteConsent,
	ownSession,
	recordExam,
} from "./consultation";
import { newId, store } from "./store";
import type { Viewer } from "./token";

// Margen para que lleguen las últimas transcripciones después de los 8 min.
const VOICE_GRACE_MS = 30_000;

export function realtimeModel() {
	return process.env.REALTIME_MODEL || "gpt-realtime-2.1";
}

const VOICE_RULES = [
	"Reglas de la voz:",
	"- Hablá como en una consulta real: frases cortas, pausas, muletillas rioplatenses.",
	"- Cuando el estudiante te pida examinarte, llamá a la herramienta examinar y reaccioná según lo que te devuelva. Nunca describas hallazgos médicos de tu cuerpo.",
	"- Si te mide la presión, llamá a medir_presion con los pasos de preparación que te indicó.",
	"- Si te pide mostrar otra parte del cuerpo, llamá a mostrar_region.",
	"- Si algo que hace el estudiante te cae bien o mal, llamá a actualizar_estado con un cambio chico.",
	"- Si el estudiante se despide o da por terminada la consulta, llamá a terminar_consulta.",
	"- Si inventás un dato sobre vos que no estaba en tu historia, llamá a anotar_dato.",
].join("\n");

export function voiceInstructions(viewer: Viewer, sessionId: string) {
	const { session } = activeSession(viewer, sessionId);
	const b = brief(session);
	const hearing =
		b.personality.audicion === "reducida"
			? "\n- No escuchás bien: cada tanto pedí que te repitan."
			: "";
	const impatient =
		b.personality.paciencia < 0.4
			? "\n- Sos impaciente: si el estudiante tarda o repite preguntas, apurate o interrumpí."
			: "";
	return `${buildPatientPrompt(b)}\n${VOICE_RULES}${hearing}${impatient}`;
}

async function sha256(text: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(text),
	);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

// Pide la clave efímera. La clave real (OPENAI_API_KEY) no sale de acá.
export async function createRealtimeSession(viewer: Viewer, sessionId: string) {
	const key = process.env.OPENAI_API_KEY;
	if (!key)
		throw new HttpError(
			503,
			"La voz no está configurada (falta OPENAI_API_KEY). Usá la versión por texto.",
		);
	const { session, elapsed } = activeSession(viewer, sessionId);
	const instructions = voiceInstructions(viewer, sessionId);
	const impatient = session.personality.paciencia < 0.4;

	const body = (withEagerness: boolean) => ({
		session: {
			type: "realtime",
			model: realtimeModel(),
			instructions,
			audio: {
				input: {
					// Solo se guarda la transcripción, nunca el audio (plan.md, sección 2).
					transcription: {
						model: process.env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
					},
					turn_detection: {
						type: "semantic_vad",
						// Paciente impaciente: detección de turno más rápida (sección 5).
						...(withEagerness
							? { eagerness: impatient ? "high" : "auto" }
							: {}),
					},
				},
				output: { voice: process.env.REALTIME_VOICE || "marin" },
			},
			tools: PATIENT_TOOLS,
			tool_choice: "auto",
		},
	});

	const safetyId = await sha256(viewer.uid);
	const send = (withEagerness: boolean) =>
		fetch("https://api.openai.com/v1/realtime/client_secrets", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
				// Identificador estable que no revela al usuario.
				"OpenAI-Safety-Identifier": safetyId,
			},
			body: JSON.stringify(body(withEagerness)),
			signal: AbortSignal.timeout(15_000),
		});

	let res = await send(true);
	// Si esta versión de la API no acepta eagerness, se reintenta sin él.
	if (res.status === 400) res = await send(false);
	if (!res.ok) {
		console.error(
			"OpenAI client_secrets",
			res.status,
			await res.text().catch(() => ""),
		);
		throw new HttpError(
			502,
			"No pudimos abrir la sesión de voz. Usá la versión por texto.",
		);
	}
	const data = (await res.json()) as { value?: string; expires_at?: number };
	if (!data.value)
		throw new HttpError(502, "OpenAI no devolvió la clave efímera");
	return {
		clientSecret: data.value,
		model: realtimeModel(),
		remainingMs: Math.max(0, 8 * 60 * 1000 - elapsed),
	};
}

export type ToolUi =
	| { kind: "exam"; exam: ExamResult }
	| { kind: "vitals"; vitals: VitalsMeasurement }
	| { kind: "region"; region: string; available: boolean }
	| { kind: "end" }
	| { kind: "none" };

export type ToolRun = { output: Record<string, unknown>; ui: ToolUi };

function zoneFor(requested: string, available: string[]) {
	const r = requested.toLowerCase();
	const aliases: Record<string, string[]> = {
		orofaringe: [
			"orofaringe",
			"garganta",
			"boca",
			"faringe",
			"amígdala",
			"amigdala",
		],
	};
	return available.find(
		(z) => z === r || (aliases[z] ?? []).some((a) => r.includes(a)),
	);
}

// Ejecuta una herramienta que pidió el modelo. El resultado va al modelo
// (output) y a la pantalla (ui). El caso decide qué se ve.
export function runTool(
	viewer: Viewer,
	sessionId: string,
	name: string,
	rawArgs: unknown,
): ToolRun {
	if (!isToolName(name))
		throw new HttpError(400, `Herramienta desconocida: ${name}`);
	const { session, clinicalCase, elapsed } = activeSession(
		viewer,
		sessionId,
		VOICE_GRACE_MS,
	);

	switch (name) {
		case "examinar": {
			const args = toolArgs.examinar.parse(rawArgs);
			// Sin zona clara, se examina la zona principal del caso.
			const zone = args.zona.trim()
				? zoneFor(args.zona, Object.keys(clinicalCase.exam))
				: defaultZone(clinicalCase);
			if (!zone) {
				return {
					output: {
						disponible: false,
						mensaje: "Esa parte no se puede examinar en esta consulta.",
					},
					ui: { kind: "none" },
				};
			}
			let current = session;
			if (args.consentimiento && !current.consentGiven) {
				store.addEvent({
					id: newId("evt"),
					sessionId,
					type: "consentimiento",
					atMs: elapsed,
				});
				current = store.updateSession(sessionId, { consentGiven: true });
			}
			const variant = decideExam(
				args.claridad,
				current.personality,
				current.consentGiven,
			);
			const exam = recordExam(
				clinicalCase,
				sessionId,
				zone,
				{ clarity: args.claridad, variant },
				elapsed,
			);
			const output =
				variant === "negado"
					? {
							variante: "negado",
							que_pasa:
								"No abrís la boca. Pedí que te expliquen para qué y que te pidan permiso.",
						}
					: variant === "parcial"
						? {
								variante: "parcial",
								que_pasa:
									"Abrís un poco la boca, solo se ven labios y dientes. Si te piden abrir más o decir aaa, hacelo.",
							}
						: {
								variante: "completa",
								que_pasa: "Abrís bien la boca, sacás la lengua y decís aaa.",
							};
			return { output, ui: { kind: "exam", exam } };
		}
		case "medir_presion": {
			const args = toolArgs.medir_presion.parse(rawArgs);
			const reading = bloodPressureReading(
				clinicalCase.vitals.pa,
				args.pasos_cumplidos,
			);
			const vitals: VitalsMeasurement = {
				id: newId("vit"),
				sessionId,
				...reading,
				marked: null,
				atMs: elapsed,
			};
			store.addVitals(vitals);
			// El paciente no sabe su presión: el valor va solo a la pantalla.
			return {
				output: {
					ok: true,
					que_pasa: "Te están midiendo la presión. Quedate quieto.",
				},
				ui: { kind: "vitals", vitals },
			};
		}
		case "mostrar_region": {
			const args = toolArgs.mostrar_region.parse(rawArgs);
			const available =
				zoneFor(args.region, Object.keys(clinicalCase.exam)) !== undefined;
			return {
				output: available
					? { disponible: true }
					: {
							disponible: false,
							mensaje:
								"Esa parte del cuerpo no está disponible en esta versión.",
						},
				ui: { kind: "region", region: args.region, available },
			};
		}
		case "actualizar_estado": {
			const args = toolArgs.actualizar_estado.parse(rawArgs);
			const clamp = (n: number) => Math.min(1, Math.max(0, n));
			const next: PatientState = { ...session.state };
			for (const [k, d] of Object.entries(args.delta) as [
				keyof PatientState,
				number | undefined,
			][]) {
				if (d !== undefined) next[k] = clamp(next[k] + d);
			}
			store.updateSession(sessionId, { state: next });
			store.addEvent({
				id: newId("evt"),
				sessionId,
				type: "cambio_animo",
				atMs: elapsed,
				delta: args.delta,
				motivo: args.motivo,
			});
			return { output: { ok: true, estado: next }, ui: { kind: "none" } };
		}
		case "anotar_dato": {
			const args = toolArgs.anotar_dato.parse(rawArgs);
			const facts = { ...session.inventedFacts };
			// Solo datos nuevos: lo que ya estaba en la historia no se pisa.
			if (
				Object.keys(facts).length < 40 &&
				!(args.clave in clinicalCase.hiddenHistory)
			) {
				facts[args.clave] = args.valor;
				store.updateSession(sessionId, { inventedFacts: facts });
			}
			return { output: { ok: true }, ui: { kind: "none" } };
		}
		case "terminar_consulta": {
			toolArgs.terminar_consulta.parse(rawArgs ?? {});
			return { output: { ok: true }, ui: { kind: "end" } };
		}
	}
}

export function recordVoiceTurn(
	viewer: Viewer,
	sessionId: string,
	speaker: Turn["speaker"],
	text: string,
	overlap: boolean,
): Turn {
	const { session, elapsed } = activeSession(viewer, sessionId, VOICE_GRACE_MS);
	const clean = text.trim().slice(0, 2000);
	if (!clean) throw new HttpError(400, "Transcripción vacía");
	const turn: Turn = {
		id: newId("turn"),
		sessionId,
		speaker,
		text: clean,
		startMs: elapsed,
		endMs: elapsed,
		overlap,
	};
	store.addTurn(turn);
	if (speaker === "estudiante") noteConsent(session, clean, elapsed);
	return turn;
}

export const VOICE_EVENTS = [
	"interrupcion_estudiante",
	"interrupcion_paciente",
	"silencio_largo",
] as const satisfies readonly SessionEventType[];

export function recordVoiceEvent(
	viewer: Viewer,
	sessionId: string,
	type: (typeof VOICE_EVENTS)[number],
	durationMs?: number,
) {
	const { elapsed } = activeSession(viewer, sessionId, VOICE_GRACE_MS);
	store.addEvent({
		id: newId("evt"),
		sessionId,
		type,
		atMs: elapsed,
		...(durationMs === undefined ? {} : { durationMs }),
	});
}

type UsageInput = Omit<VoiceUsage, "responses">;

// Suma los tokens de cada respuesta de la voz para medir el costo por sesión.
export function recordVoiceUsage(
	viewer: Viewer,
	sessionId: string,
	usage: UsageInput,
) {
	const { session } = ownSession(viewer, sessionId);
	const prev = session.voiceUsage ?? {
		responses: 0,
		inputTokens: 0,
		outputTokens: 0,
		inputAudioTokens: 0,
		outputAudioTokens: 0,
		cachedTokens: 0,
	};
	const next: VoiceUsage = {
		responses: prev.responses + 1,
		inputTokens: prev.inputTokens + usage.inputTokens,
		outputTokens: prev.outputTokens + usage.outputTokens,
		inputAudioTokens: prev.inputAudioTokens + usage.inputAudioTokens,
		outputAudioTokens: prev.outputAudioTokens + usage.outputAudioTokens,
		cachedTokens: prev.cachedTokens + usage.cachedTokens,
	};
	store.updateSession(sessionId, { voiceUsage: next });
	return next;
}
