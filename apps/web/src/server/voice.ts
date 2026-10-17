// Consulta por voz con la Live API de Gemini (Google AI Studio), Persona 1.
// El servidor crea un token efímero con las instrucciones del paciente (sin
// el diagnóstico) y ejecuta las herramientas; el navegador solo conecta el
// audio y reenvía transcripciones y llamadas.
import "server-only";

import { GoogleGenAI, Modality } from "@google/genai";

import type { ExamResult } from "@/lib/contracts/exam";
import {
	MAX_SESSION_MS,
	type SessionEventType,
	type Turn,
	type VoiceUsage,
} from "@/lib/contracts/session";
import { buildPatientPrompt } from "@/lib/patient/brief";
import { decideExam } from "@/lib/patient/exam-instruction";
import { applyDelta } from "@/lib/patient/state";
import { isToolName, PATIENT_TOOLS, toolArgs } from "@/lib/patient/tools";
import { pickVoice } from "@/lib/patient/voices";

import { HttpError } from "./auth";
import {
	activeSession,
	brief,
	classifyStudent,
	defaultZone,
	giveConsent,
	noteConsent,
	nudgeState,
	ownSession,
	recordExam,
} from "./consultation";
import { newId, store } from "./store";
import type { Viewer } from "./token";
import { type BpStart, createMeasurement } from "./vitals";

// Conexiones de voz por consulta: alcanza para reconectar si se corta y
// evita que alguien gaste la clave pidiendo tokens sin parar.
export const MAX_VOICE_STARTS = 6;

// Margen para que lleguen las últimas transcripciones después de los 8 min.
const VOICE_GRACE_MS = 30_000;
// Turnos anteriores que recibe el paciente al reconectar.
const RESUME_TURNS = 40;

export function liveModel() {
	return process.env.LIVE_MODEL || "gemini-3.8-live";
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

// Si la voz se cortó y se reconecta, el token nuevo lleva lo que ya se habló
// para que el paciente siga desde ahí.
async function resumeContext(sessionId: string, confianza: number) {
	const turns = await store.listTurns(sessionId);
	if (turns.length === 0) return "";
	const lines = turns
		.slice(-RESUME_TURNS)
		.map(
			(t) => `${t.speaker === "estudiante" ? "Estudiante" : "Vos"}: ${t.text}`,
		);
	return [
		"",
		"La llamada se cortó y se retoma. Esto es lo que ya se habló (no te vuelvas a presentar ni repitas lo que ya contaste; seguí desde ahí):",
		...lines,
		`Confianza actual en el estudiante (0 a 1): ${confianza.toFixed(2)}.`,
	].join("\n");
}

export async function voiceInstructions(viewer: Viewer, sessionId: string) {
	const { session, clinicalCase } = await activeSession(viewer, sessionId);
	const b = brief(session, clinicalCase);
	const hearing =
		b.personality.audicion === "reducida"
			? "\n- No escuchás bien: cada tanto pedí que te repitan."
			: "";
	const impatient =
		b.personality.paciencia < 0.4
			? "\n- Sos impaciente: si el estudiante tarda o repite preguntas, apurate o interrumpí."
			: "";
	const resume = await resumeContext(sessionId, session.state.confianza);
	return `${buildPatientPrompt(b)}\n${VOICE_RULES}${hearing}${impatient}${resume}`;
}

// Configuración de la sesión Live de Gemini. Va dentro del token efímero
// (liveConnectConstraints): el navegador no puede cambiar las instrucciones.
export function liveConfig(
	instructions: string,
	impatient: boolean,
	voice = "Kore",
) {
	return {
		responseModalities: [Modality.AUDIO],
		systemInstruction: instructions,
		speechConfig: {
			voiceConfig: {
				// La voz sorteada para esta consulta (lib/patient/voices.ts).
				prebuiltVoiceConfig: { voiceName: voice },
			},
		},
		// Solo se guarda la transcripción, nunca el audio (plan.md, sección 2).
		inputAudioTranscription: {},
		outputAudioTranscription: {},
		realtimeInputConfig: {
			automaticActivityDetection: {
				// Paciente impaciente: toma el turno más rápido (sección 5).
				silenceDurationMs: impatient ? 500 : 800,
			},
		},
		tools: [
			{
				functionDeclarations: PATIENT_TOOLS.map((t) => ({
					name: t.name,
					description: t.description,
					parametersJsonSchema: t.parameters,
				})),
			},
		],
	};
}

// Token efímero de Gemini Live. La clave real (GEMINI_API_KEY) no sale de acá.
export async function createLiveSession(viewer: Viewer, sessionId: string) {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey)
		throw new HttpError(
			503,
			"La voz no está configurada: falta GEMINI_API_KEY en el servidor.",
		);
	const { session, clinicalCase, elapsed } = await activeSession(
		viewer,
		sessionId,
	);
	const model = liveModel();
	const starts = session.voiceStarts ?? 0;
	if (starts >= MAX_VOICE_STARTS)
		throw new HttpError(
			429,
			"Ya reconectaste la voz muchas veces en esta consulta. Terminala y empezá otra.",
		);
	// Consultas anteriores a las voces al azar no tienen voz: se sortea una.
	const voice = session.voice ?? pickVoice(clinicalCase.patient.sex);
	if (!session.voice) await store.updateSession(sessionId, { voice });
	const config = liveConfig(
		await voiceInstructions(viewer, sessionId),
		session.personality.paciencia < 0.4,
		voice,
	);
	const now = Date.now();
	// La documentación web dice v1beta y el SDK dice v1alpha: se prueban las dos.
	for (const apiVersion of ["v1beta", "v1alpha"] as const) {
		try {
			const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion } });
			const token = await ai.authTokens.create({
				config: {
					uses: 1,
					expireTime: new Date(now + 10 * 60 * 1000).toISOString(),
					newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
					// Sin lockAdditionalFields el token fija toda la configuración; con
					// lockAdditionalFields y herramientas Google rechaza el field_mask.
					liveConnectConstraints: { model, config },
				},
			});
			if (token.name) {
				await store.updateSession(sessionId, { voiceStarts: starts + 1 });
				return {
					token: token.name,
					apiVersion,
					model,
					remainingMs: Math.max(0, MAX_SESSION_MS - elapsed),
				};
			}
		} catch (error) {
			console.error(`Gemini authTokens (${apiVersion})`, error);
		}
	}
	throw new HttpError(
		502,
		"No pudimos conectar con el paciente. Probá de nuevo en unos segundos.",
	);
}

export type ToolUi =
	| { kind: "exam"; exam: ExamResult }
	| ({ kind: "vitals" } & BpStart)
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
export async function runTool(
	viewer: Viewer,
	sessionId: string,
	name: string,
	rawArgs: unknown,
): Promise<ToolRun> {
	if (!isToolName(name))
		throw new HttpError(400, `Herramienta desconocida: ${name}`);
	const { session, clinicalCase, elapsed } = await activeSession(
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
			const current = args.consentimiento
				? await giveConsent(session, elapsed)
				: session;
			const variant = decideExam(
				args.claridad,
				current.personality,
				current.consentGiven,
			);
			const exam = await recordExam(
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
			const bp = await createMeasurement(
				clinicalCase,
				sessionId,
				args.pasos_cumplidos,
				elapsed,
			);
			// Ni el paciente ni la pantalla reciben el valor: la pantalla abre el
			// tensiómetro y el estudiante lo mide (Persona 2).
			return {
				output: {
					ok: true,
					que_pasa: "Te están midiendo la presión. Quedate quieto.",
				},
				ui: { kind: "vitals", ...bp },
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
			const next = applyDelta(session.state, args.delta);
			await store.updateSession(sessionId, { state: next });
			await store.addEvent({
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
				await store.updateSession(sessionId, { inventedFacts: facts });
			}
			return { output: { ok: true }, ui: { kind: "none" } };
		}
		case "terminar_consulta": {
			toolArgs.terminar_consulta.parse(rawArgs ?? {});
			return { output: { ok: true }, ui: { kind: "end" } };
		}
	}
}

export async function recordVoiceTurn(
	viewer: Viewer,
	sessionId: string,
	speaker: Turn["speaker"],
	text: string,
	overlap: boolean,
): Promise<{ turn: Turn; stateNote: string | null }> {
	const { session, elapsed } = await activeSession(
		viewer,
		sessionId,
		VOICE_GRACE_MS,
	);
	const clean = text.trim().slice(0, 2000);
	if (!clean) throw new HttpError(400, "Transcripción vacía");
	// El estudiante pasa por el clasificador antes de guardar su turno.
	const classified =
		speaker === "estudiante"
			? await classifyStudent(session, clean, elapsed)
			: null;
	const turn: Turn = {
		id: newId("turn"),
		sessionId,
		speaker,
		text: clean,
		startMs: elapsed,
		endMs: elapsed,
		overlap,
		...(classified ? { tags: classified.tags } : {}),
	};
	await store.addTurn(turn);
	if (classified) await noteConsent(classified.session, clean, elapsed);
	return { turn, stateNote: classified?.stateNote ?? null };
}

export const VOICE_EVENTS = [
	"interrupcion_estudiante",
	"interrupcion_paciente",
	"silencio_largo",
] as const satisfies readonly SessionEventType[];

export async function recordVoiceEvent(
	viewer: Viewer,
	sessionId: string,
	type: (typeof VOICE_EVENTS)[number],
	durationMs?: number,
) {
	const { session, elapsed } = await activeSession(
		viewer,
		sessionId,
		VOICE_GRACE_MS,
	);
	await store.addEvent({
		id: newId("evt"),
		sessionId,
		type,
		atMs: elapsed,
		...(durationMs === undefined ? {} : { durationMs }),
	});
	// Interrumpir o quedarse callado le cae mal al paciente.
	await nudgeState(session, type, elapsed);
}

type UsageInput = Omit<VoiceUsage, "responses">;

// Suma los tokens de cada respuesta de la voz para medir el costo por sesión.
export async function recordVoiceUsage(
	viewer: Viewer,
	sessionId: string,
	usage: UsageInput,
) {
	const { session } = await ownSession(viewer, sessionId);
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
	await store.updateSession(sessionId, { voiceUsage: next });
	return next;
}
