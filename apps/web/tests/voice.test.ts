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

import { measure } from "@/lib/exam/blood-pressure";
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
	// Acá Ana empieza muchas consultas: el tope diario se prueba en persona1.test.ts.
	vi.stubEnv("MAX_SESSIONS_PER_USER_PER_DAY", "1000");
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
		const saved = (await store.listVitals(id))[0];
		expect(saved?.shown).toEqual({ pas: 112, pad: 70 });
		// Ni el modelo ni la pantalla reciben el valor: lo mide el estudiante.
		expect(JSON.stringify(run.output)).not.toContain("112");
		expect(JSON.stringify(run.ui)).not.toContain("112");
		expect(run.ui.kind === "vitals" && run.ui.measurementId).toBe(saved?.id);
		const bad = measure([112, 70], [], null, 26);
		expect(bad.shown.pas).toBeGreaterThan(112);
		expect(bad.techniqueErrors).toContain("piernas-cruzadas");
	});

	test("actualizar_estado: queda entre 0 y 1 y se registra el evento", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		const run = await runTool(ana, id, "actualizar_estado", {
			delta: { confianza: 0.5 },
			motivo: "empatía",
		});
		expect((await store.getSession(id))?.state.confianza).toBe(1);
		// La pantalla recibe el ánimo nuevo para la cara del avatar.
		expect(run.ui).toMatchObject({ kind: "state", state: { confianza: 1 } });
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
		});
		await expect(recordVoiceUsage(beto, id, u)).rejects.toThrow(
			"Sesión no encontrada",
		);
	});
});

describe("límite de conexiones de voz", () => {
	test("después de 6 tokens en una consulta, se rechaza", async () => {
		vi.stubEnv("GEMINI_API_KEY", "AIza-test");
		genai.create.mockResolvedValue({ name: "auth_tokens/x" });
		const id = await startSession(ana, lucia.id, "caso");
		for (let i = 0; i < 6; i++) await createLiveSession(ana, id);
		await expect(createLiveSession(ana, id)).rejects.toThrow("muchas veces");
		expect(genai.create).toHaveBeenCalledTimes(6);
	});
});
