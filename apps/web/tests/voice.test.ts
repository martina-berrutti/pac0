import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// SDK de Google simulado: registra la clave usada y los tokens pedidos.
const genai = vi.hoisted(() => ({ create: vi.fn(), keys: [] as string[] }));
vi.mock("@google/genai", () => ({
	Modality: { AUDIO: "AUDIO" },
	GoogleGenAI: class {
		authTokens = { create: genai.create };
		constructor(opts: { apiKey: string }) {
			genai.keys.push(opts.apiKey);
		}
	},
}));

import { bloodPressureReading } from "@/lib/patient/blood-pressure";
import { BP_STEPS } from "@/lib/patient/tools";
import { startSession } from "@/server/consultation";
import { store } from "@/server/store";
import type { Viewer } from "@/server/token";
import {
	createLiveSession,
	recordVoiceTurn,
	runTool,
	voiceInstructions,
} from "@/server/voice";

import { lucia } from "./helpers";

const ana: Viewer & { alias: string } = {
	uid: "usr_ana",
	alias: "Ana",
	careerYear: "3",
	guest: true,
	exp: Date.now() + 1e6,
};
const beto: Viewer = {
	uid: "usr_beto",
	alias: "Beto",
	careerYear: "2",
	guest: true,
	exp: Date.now() + 1e6,
};

beforeEach(() => {
	genai.create.mockReset();
	genai.keys.length = 0;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("sesión de voz (Gemini Live)", () => {
	test("sin GEMINI_API_KEY avisa qué falta configurar", async () => {
		vi.stubEnv("GEMINI_API_KEY", "");
		const id = await startSession(ana, lucia.id, "caso");
		await expect(createLiveSession(ana, id)).rejects.toThrow(
			"falta GEMINI_API_KEY",
		);
	});

	test("el token efímero fija las instrucciones sin el diagnóstico y con las herramientas", async () => {
		vi.stubEnv("GEMINI_API_KEY", "AIza-test-servidor");
		genai.create.mockResolvedValueOnce({ name: "auth_tokens/efimero" });
		const id = await startSession(ana, lucia.id, "caso");

		const result = await createLiveSession(ana, id);

		expect(result.token).toBe("auth_tokens/efimero");
		expect(result.model).toBe("gemini-3.8-live");
		expect(JSON.stringify(result)).not.toContain("AIza-test-servidor");
		expect(genai.keys).toContain("AIza-test-servidor");
		const { config } = (genai.create.mock.calls[0] ?? [])[0] as {
			config: {
				uses: number;
				liveConnectConstraints: { config: Record<string, unknown> };
			};
		};
		expect(config.uses).toBe(1);
		const live = config.liveConnectConstraints.config as {
			systemInstruction: string;
			inputAudioTranscription: object;
			outputAudioTranscription: object;
			tools: { functionDeclarations: { name: string }[] }[];
		};
		expect(live.systemInstruction).not.toContain(lucia.truth.diagnosis);
		expect(JSON.stringify(live)).not.toContain(
			lucia.exam.orofaringe?.expected ?? "-",
		);
		// Se guarda la transcripción, no el audio.
		expect(live.inputAudioTranscription).toEqual({});
		expect(live.outputAudioTranscription).toEqual({});
		expect(live.tools[0]?.functionDeclarations.map((t) => t.name)).toEqual([
			"examinar",
			"medir_presion",
			"mostrar_region",
			"actualizar_estado",
			"terminar_consulta",
			"anotar_dato",
		]);
	});

	test("si v1beta falla, prueba v1alpha; paciente impaciente toma el turno antes", async () => {
		vi.stubEnv("GEMINI_API_KEY", "AIza-test");
		genai.create
			.mockRejectedValueOnce(new Error("no soportado"))
			.mockResolvedValueOnce({ name: "auth_tokens/2" });
		const id = await startSession(ana, lucia.id, "hostil");
		const result = await createLiveSession(ana, id);
		expect(result.apiVersion).toBe("v1alpha");
		const live = (
			(genai.create.mock.calls[1] ?? [])[0] as {
				config: {
					liveConnectConstraints: {
						config: {
							realtimeInputConfig: {
								automaticActivityDetection: { silenceDurationMs: number };
							};
						};
					};
				};
			}
		).config.liveConnectConstraints.config;
		expect(
			live.realtimeInputConfig.automaticActivityDetection.silenceDurationMs,
		).toBe(500);
	});

	test("las instrucciones de voz siguen sin el diagnóstico", async () => {
		const id = await startSession(ana, lucia.id, "mayor");
		const text = await voiceInstructions(ana, id);
		expect(text).not.toContain(lucia.truth.diagnosis);
		expect(text).toContain("repitan");
	});
});

describe("herramientas del paciente", () => {
	test("examinar: la claridad decide la apertura", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		const parcial = await runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "media",
			consentimiento: true,
		});
		expect(parcial.output.variante).toBe("parcial");
		const completa = await runTool(ana, id, "examinar", {
			zona: "orofaringe",
			claridad: "alta",
			consentimiento: true,
		});
		expect(completa.output.variante).toBe("completa");
		expect(completa.ui.kind === "exam" && completa.ui.exam.assetKey).toBe(
			"throat-exudate-01",
		);
		// Al modelo no le llega el hallazgo.
		expect(JSON.stringify(completa.output)).not.toContain("exudado");
		expect(await store.listExamActions(id)).toHaveLength(2);
	});

	test("examinar: el paciente hostil no abre sin permiso", async () => {
		const id = await startSession(ana, lucia.id, "hostil");
		expect(
			(
				await runTool(ana, id, "examinar", {
					zona: "boca",
					claridad: "alta",
					consentimiento: false,
				})
			).output.variante,
		).toBe("negado");
		expect(
			(
				await runTool(ana, id, "examinar", {
					zona: "boca",
					claridad: "alta",
					consentimiento: true,
				})
			).output.variante,
		).toBe("completa");
		expect((await store.getSession(id))?.consentGiven).toBe(true);
	});

	test("medir_presion: el valor lo calcula el código y no va al modelo", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		const run = await runTool(ana, id, "medir_presion", {
			pasos_cumplidos: [...BP_STEPS],
		});
		expect(run.ui.kind === "vitals" && run.ui.vitals.shown).toEqual({
			pas: 112,
			pad: 70,
		});
		expect(JSON.stringify(run.output)).not.toContain("112");
		const bad = bloodPressureReading([112, 70], []);
		expect(bad.shown.pas).toBeGreaterThan(112);
		expect(bad.techniqueErrors).toContain("piernas cruzadas");
	});

	test("actualizar_estado: queda entre 0 y 1 y se registra el evento", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await runTool(ana, id, "actualizar_estado", {
			delta: { confianza: 0.5 },
			motivo: "empatía",
		});
		expect((await store.getSession(id))?.state.confianza).toBe(1);
		expect(
			(await store.listEvents(id)).some((e) => e.type === "cambio_animo"),
		).toBe(true);
	});

	test("mostrar_region y terminar_consulta", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		expect(
			(await runTool(ana, id, "mostrar_region", { region: "rodilla" })).output
				.disponible,
		).toBe(false);
		expect((await runTool(ana, id, "terminar_consulta", {})).ui.kind).toBe(
			"end",
		);
	});

	test("una herramienta desconocida o de otra persona se rechaza", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await expect(runTool(ana, id, "dar_diagnostico", {})).rejects.toThrow(
			"desconocida",
		);
		await expect(
			runTool(beto, id, "examinar", {
				zona: "boca",
				claridad: "alta",
				consentimiento: true,
			}),
		).rejects.toThrow("Sesión no encontrada");
	});
});

describe("turnos de voz", () => {
	test("se guarda la transcripción y el permiso pedido por voz", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"¿Te puedo revisar la garganta?",
			false,
		);
		expect((await store.listTurns(id))[0]?.text).toContain("revisar");
		expect((await store.getSession(id))?.consentGiven).toBe(true);
	});

	test("después de los 8 minutos (más el margen) no se acepta", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await store.updateSession(id, { startedAt: Date.now() - 9 * 60 * 1000 });
		await expect(
			recordVoiceTurn(ana, id, "estudiante", "hola", false),
		).rejects.toThrow("8 minutos");
	});
});

describe("pendientes de la Persona 1", () => {
	test("el generador entiende pedidos de personalidad con palabras", async () => {
		const { generateCase } = await import("@/lib/patient/generator");
		const { clinicalCase, personalityKey } = await generateCase({
			text: "un paciente con dolor de garganta que hable mucho y no quiera abrir la boca",
		});
		expect(personalityKey).toBe("caso");
		expect(clinicalCase.personality.locuacidad).toBeGreaterThan(0.9);
		expect(clinicalCase.personality.cooperacion).toBeLessThan(0.5);
		expect(clinicalCase.personalityStyle).toContain("No te dejás examinar");
		// La sesión usa la personalidad ajustada: no abre sin permiso.
		await store.addGeneratedCase(ana.uid, clinicalCase);
		const id = await startSession(ana, clinicalCase.id, personalityKey);
		expect(
			(
				await runTool(ana, id, "examinar", {
					zona: "boca",
					claridad: "alta",
					consentimiento: false,
				})
			).output.variante,
		).toBe("negado");
	});

	test("variación controlada: se sortea un valor del caso y llega al paciente", async () => {
		const { pickVariations } = await import("@/server/consultation");
		expect(pickVariations(lucia, () => 0.99).fiebre).toBe("tuve 39 anoche");
		const id = await startSession(ana, lucia.id, "caso");
		const fiebre = (await store.getSession(id))?.historyOverrides.fiebre;
		expect(lucia.variations.fiebre).toContain(fiebre);
		expect(await voiceInstructions(ana, id)).toContain(fiebre);
	});

	test("anotar_dato: lo inventado queda en las instrucciones y no pisa la historia", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await runTool(ana, id, "anotar_dato", {
			clave: "hermanos",
			valor: "tengo dos hermanos",
		});
		await runTool(ana, id, "anotar_dato", {
			clave: "fiebre",
			valor: "nunca tuve fiebre",
		});
		const facts = (await store.getSession(id))?.inventedFacts;
		expect(facts).toEqual({ hermanos: "tengo dos hermanos" });
		expect(await voiceInstructions(ana, id)).toContain("tengo dos hermanos");
	});

	test("los tokens de la voz se suman por sesión", async () => {
		const { recordVoiceUsage } = await import("@/server/voice");
		const id = await startSession(ana, lucia.id, "caso");
		const u = {
			inputTokens: 100,
			outputTokens: 50,
			inputAudioTokens: 80,
			outputAudioTokens: 40,
			cachedTokens: 10,
		};
		await recordVoiceUsage(ana, id, u);
		expect(await recordVoiceUsage(ana, id, u)).toEqual({
			responses: 2,
			inputTokens: 200,
			outputTokens: 100,
			inputAudioTokens: 160,
			outputAudioTokens: 80,
			cachedTokens: 20,
			peak: { inputTokens: 100, outputTokens: 50 },
		});
		// Si fuera acumulado, el pico tiene el total sin contar dos veces.
		const acumulado = await recordVoiceUsage(ana, id, {
			...u,
			inputTokens: 300,
		});
		expect(acumulado.peak?.inputTokens).toBe(300);
		await expect(recordVoiceUsage(beto, id, u)).rejects.toThrow(
			"Sesión no encontrada",
		);
	});
});

describe("bugs de la Persona 1", () => {
	test("pedir permiso para otra cosa no autoriza el examen", async () => {
		const id = await startSession(ana, lucia.id, "hostil");
		await recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"¿Puedo preguntarte cuántos años tenés?",
			false,
		);
		expect((await store.getSession(id))?.consentGiven).toBe(false);
		await recordVoiceTurn(ana, id, "estudiante", "¿Me das permiso?", false);
		expect((await store.getSession(id))?.consentGiven).toBe(true);
	});

	test("'palabra' o 'cabra' no son pedidos de examen", async () => {
		const { isExamRequest } = await import("@/lib/patient/exam-instruction");
		expect(isExamRequest("contame en tus palabras")).toBe(false);
		expect(isExamRequest("Abrí la boca")).toBe(true);
		expect(isExamRequest("¿me abrís la boca?")).toBe(true);
	});

	test("argumentos fuera del esquema se corrigen en vez de fallar", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await runTool(ana, id, "actualizar_estado", {
			delta: { confianza: -0.9, paciencia: "mucho" },
		});
		const state = (await store.getSession(id))?.state;
		expect(state?.confianza).toBeCloseTo(0.4);
		const exam = await runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "Alta",
		});
		expect(exam.output.variante).toBe("completa");
		const bp = await runTool(ana, id, "medir_presion", {
			pasos_cumplidos: [...BP_STEPS, "paso_inventado"],
		});
		expect(bp.ui.kind === "vitals" && bp.ui.vitals.shown.pas).toBe(112);
	});

	test("nombres heredados de Object no son herramientas", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		for (const name of ["toString", "constructor", "__proto__"]) {
			await expect(runTool(ana, id, name, {})).rejects.toThrow("desconocida");
		}
	});

	test("anotar_dato no pisa el perfil del paciente", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		const [key] = Object.keys(lucia.profile);
		await runTool(ana, id, "anotar_dato", { clave: key, valor: "otra cosa" });
		expect((await store.getSession(id))?.inventedFacts).toEqual({});
	});

	test("al reconectar la voz, el paciente recibe lo que ya se habló", async () => {
		vi.stubEnv("GEMINI_API_KEY", "AIza-test-servidor");
		genai.create.mockResolvedValueOnce({ name: "auth_tokens/otro" });
		const id = await startSession(ana, lucia.id, "caso");
		await recordVoiceTurn(ana, id, "estudiante", "Hola, soy Ana", false);
		await recordVoiceTurn(ana, id, "paciente", "Hola, me duele", false);
		const now = Date.now();
		await createLiveSession(ana, id);
		const { config } = (genai.create.mock.calls[0] ?? [])[0] as {
			config: {
				expireTime: string;
				liveConnectConstraints: { config: { systemInstruction: string } };
			};
		};
		const instructions = config.liveConnectConstraints.config.systemInstruction;
		expect(instructions).toContain("Estudiante: Hola, soy Ana");
		expect(instructions).toContain("Vos: Hola, me duele");
		expect(instructions).not.toContain(lucia.truth.diagnosis);
		// El token no dura más que la consulta (8 min) y el margen.
		expect(new Date(config.expireTime).getTime() - now).toBeLessThanOrEqual(
			8.5 * 60 * 1000 + 1000,
		);
	});

	test("el generador entiende 'él' y 'varón'", async () => {
		const { generateCase } = await import("@/lib/patient/generator");
		for (const text of [
			"un paciente con dolor de garganta, que sea él",
			"un varón con dolor de garganta",
		]) {
			const { clinicalCase } = await generateCase({ text }, () => 0);
			expect([
				"Mateo",
				"Santiago",
				"Joaquín",
				"Nicolás",
				"Diego",
				"Juan",
				"Carlos",
				"Raúl",
				"Jorge",
				"Pablo",
			]).toContain(clinicalCase.patient.name);
		}
	});
});

describe("prevención de errores (segunda pasada)", () => {
	test("la vista de la sesión no manda la historia sorteada ni lo inventado", async () => {
		const { getSessionView } = await import("@/server/consultation");
		const id = await startSession(ana, lucia.id, "caso");
		await runTool(ana, id, "anotar_dato", {
			clave: "hermanos",
			valor: "tengo dos hermanos",
		});
		const view = JSON.stringify(await getSessionView(ana, id));
		const fiebre = (await store.getSession(id))?.historyOverrides.fiebre ?? "";
		expect(fiebre).not.toBe("");
		expect(view).not.toContain(fiebre);
		expect(view).not.toContain("tengo dos hermanos");
		expect(view).not.toContain("historyOverrides");
		expect(view).not.toContain(lucia.truth.diagnosis);
	});

	test("hay tope de conexiones de voz por consulta", async () => {
		const { MAX_VOICE_CONNECTIONS } = await import("@/server/voice");
		vi.stubEnv("GEMINI_API_KEY", "AIza-test-servidor");
		genai.create.mockResolvedValue({ name: "auth_tokens/x" });
		const id = await startSession(ana, lucia.id, "caso");
		for (let i = 0; i < MAX_VOICE_CONNECTIONS; i++)
			await createLiveSession(ana, id);
		await expect(createLiveSession(ana, id)).rejects.toThrow("reconectaste");
	});

	test("un turno de voz largo se guarda recortado, no se pierde", async () => {
		const id = await startSession(ana, lucia.id, "mayor");
		const turn = await recordVoiceTurn(
			ana,
			id,
			"paciente",
			"y bueno ".repeat(1000),
			false,
		);
		expect(turn.text.length).toBeLessThanOrEqual(4000);
	});

	test("los tiempos del examen solo guardan zonas del caso", async () => {
		const { saveExamTimes } = await import("@/server/consultation");
		const id = await startSession(ana, lucia.id, "caso");
		const run = await runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "alta",
			consentimiento: true,
		});
		if (run.ui.kind !== "exam") throw new Error("sin examen");
		const [real] = run.ui.exam.hotspots;
		const saved = await saveExamTimes(ana, id, run.ui.exam.action.id, {
			[real as string]: 1200,
			inventada: 5000,
		});
		expect(saved?.hotspotTimesMs).toEqual({ [real as string]: 1200 });
	});

	test("un cuerpo enorme se rechaza antes de llegar al almacenamiento", async () => {
		const { readBody } = await import("@/server/http");
		const { z } = await import("zod");
		const req = new Request("http://x", {
			method: "POST",
			body: JSON.stringify({ text: "a".repeat(100_000) }),
		});
		await expect(readBody(req, z.object({ text: z.string() }))).rejects.toThrow(
			"demasiado grande",
		);
	});

	test("paciente por reglas: 'datos' no es una pregunta por la tos", async () => {
		const { ruleRespond } = await import("@/lib/patient/rule-responder");
		const { buildPatientBrief } = await import("@/lib/patient/brief");
		const b = buildPatientBrief(lucia, lucia.personality, "");
		const state = { confianza: 0.9, ansiedad: 0.3, dolor: 0.5, paciencia: 0.7 };
		const tos = lucia.hiddenHistory.tos ?? "";
		expect(ruleRespond(b, state, "¿Tenés tos?", 1).text).toContain(tos);
		expect(
			ruleRespond(b, state, "¿Me das todos tus datos?", 1).text,
		).not.toContain(tos);
	});
});

test("generador: 'todos los datos' no es tos y '100 años' no es '00'", async () => {
	const { generateCase } = await import("@/lib/patient/generator");
	const { clinicalCase } = await generateCase(
		{
			text: "un paciente con dolor de garganta al tragar, con todos los datos",
		},
		() => 0.99,
	);
	expect(clinicalCase.title).toBe("Dolor de garganta");
	const viejo = await generateCase(
		{ text: "una señora de 100 años con dolor de garganta" },
		() => 0,
	);
	expect(viejo.clinicalCase.patient.age).toBe(95);
});

test("si el evaluador falla, la sesión no queda cerrada sin informe", async () => {
	const evaluateModule = await import("@/lib/scoring/evaluate");
	const { finishSession } = await import("@/server/consultation");
	const id = await startSession(ana, lucia.id, "caso");
	const spy = vi
		.spyOn(evaluateModule, "evaluate")
		.mockImplementationOnce(() => {
			throw new Error("evaluador roto");
		});
	await expect(finishSession(ana, id, "faringitis", [])).rejects.toThrow(
		"evaluador roto",
	);
	expect((await store.getSession(id))?.status).toBe("activa");
	spy.mockRestore();
	const report = await finishSession(ana, id, "faringitis", []);
	expect(report.sessionId).toBe(id);
	expect((await store.getSession(id))?.status).toBe("evaluada");
});

test("tensiómetro: se guarda lo que marcó el estudiante, con controles", async () => {
	const { saveMarkedVitals } = await import("@/server/consultation");
	const id = await startSession(ana, lucia.id, "caso");
	const run = await runTool(ana, id, "medir_presion", {
		pasos_cumplidos: [...BP_STEPS],
	});
	if (run.ui.kind !== "vitals") throw new Error("sin medición");
	const vitalsId = run.ui.vitals.id;
	const saved = await saveMarkedVitals(ana, id, vitalsId, {
		pas: 110,
		pad: 72,
	});
	expect(saved?.marked).toEqual({ pas: 110, pad: 72 });
	expect((await store.listVitals(id))[0]?.marked).toEqual({
		pas: 110,
		pad: 72,
	});
	await expect(
		saveMarkedVitals(ana, id, vitalsId, { pas: 70, pad: 110 }),
	).rejects.toThrow("mayor que la mínima");
	await expect(
		saveMarkedVitals(ana, id, "vit_otra", { pas: 110, pad: 70 }),
	).rejects.toThrow("no encontrada");
	await expect(
		saveMarkedVitals(beto, id, vitalsId, { pas: 110, pad: 70 }),
	).rejects.toThrow("Sesión no encontrada");
});
