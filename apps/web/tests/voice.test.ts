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
	test("sin GEMINI_API_KEY avisa que se use el texto", async () => {
		vi.stubEnv("GEMINI_API_KEY", "");
		const id = startSession(ana, lucia.id, "caso");
		await expect(createLiveSession(ana, id)).rejects.toThrow(
			"versión por texto",
		);
	});

	test("el token efímero fija las instrucciones sin el diagnóstico y con las herramientas", async () => {
		vi.stubEnv("GEMINI_API_KEY", "AIza-test-servidor");
		genai.create.mockResolvedValueOnce({ name: "auth_tokens/efimero" });
		const id = startSession(ana, lucia.id, "caso");

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
		const id = startSession(ana, lucia.id, "hostil");
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

	test("las instrucciones de voz siguen sin el diagnóstico", () => {
		const id = startSession(ana, lucia.id, "mayor");
		const text = voiceInstructions(ana, id);
		expect(text).not.toContain(lucia.truth.diagnosis);
		expect(text).toContain("repitan");
	});
});

describe("herramientas del paciente", () => {
	test("examinar: la claridad decide la apertura", () => {
		const id = startSession(ana, lucia.id, "caso");
		const parcial = runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "media",
			consentimiento: true,
		});
		expect(parcial.output.variante).toBe("parcial");
		const completa = runTool(ana, id, "examinar", {
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
		expect(store.listExamActions(id)).toHaveLength(2);
	});

	test("examinar: el paciente hostil no abre sin permiso", () => {
		const id = startSession(ana, lucia.id, "hostil");
		expect(
			runTool(ana, id, "examinar", {
				zona: "boca",
				claridad: "alta",
				consentimiento: false,
			}).output.variante,
		).toBe("negado");
		expect(
			runTool(ana, id, "examinar", {
				zona: "boca",
				claridad: "alta",
				consentimiento: true,
			}).output.variante,
		).toBe("completa");
		expect(store.getSession(id)?.consentGiven).toBe(true);
	});

	test("medir_presion: el valor lo calcula el código y no va al modelo", () => {
		const id = startSession(ana, lucia.id, "caso");
		const run = runTool(ana, id, "medir_presion", {
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

	test("actualizar_estado: queda entre 0 y 1 y se registra el evento", () => {
		const id = startSession(ana, lucia.id, "caso");
		runTool(ana, id, "actualizar_estado", {
			delta: { confianza: 0.5 },
			motivo: "empatía",
		});
		expect(store.getSession(id)?.state.confianza).toBe(1);
		expect(store.listEvents(id).some((e) => e.type === "cambio_animo")).toBe(
			true,
		);
	});

	test("mostrar_region y terminar_consulta", () => {
		const id = startSession(ana, lucia.id, "caso");
		expect(
			runTool(ana, id, "mostrar_region", { region: "rodilla" }).output
				.disponible,
		).toBe(false);
		expect(runTool(ana, id, "terminar_consulta", {}).ui.kind).toBe("end");
	});

	test("una herramienta desconocida o de otra persona se rechaza", () => {
		const id = startSession(ana, lucia.id, "caso");
		expect(() => runTool(ana, id, "dar_diagnostico", {})).toThrow(
			"desconocida",
		);
		expect(() =>
			runTool(beto, id, "examinar", {
				zona: "boca",
				claridad: "alta",
				consentimiento: true,
			}),
		).toThrow("Sesión no encontrada");
	});
});

describe("turnos de voz", () => {
	test("se guarda la transcripción y el permiso pedido por voz", () => {
		const id = startSession(ana, lucia.id, "caso");
		recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"¿Te puedo revisar la garganta?",
			false,
		);
		expect(store.listTurns(id)[0]?.text).toContain("revisar");
		expect(store.getSession(id)?.consentGiven).toBe(true);
	});

	test("después de los 8 minutos (más el margen) no se acepta", () => {
		const id = startSession(ana, lucia.id, "caso");
		store.updateSession(id, { startedAt: Date.now() - 9 * 60 * 1000 });
		expect(() => recordVoiceTurn(ana, id, "estudiante", "hola", false)).toThrow(
			"8 minutos",
		);
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
		store.addGeneratedCase(ana.uid, clinicalCase);
		const id = startSession(ana, clinicalCase.id, personalityKey);
		expect(
			runTool(ana, id, "examinar", {
				zona: "boca",
				claridad: "alta",
				consentimiento: false,
			}).output.variante,
		).toBe("negado");
	});

	test("variación controlada: se sortea un valor del caso y llega al paciente", async () => {
		const { pickVariations } = await import("@/server/consultation");
		expect(pickVariations(lucia, () => 0.99).fiebre).toBe("tuve 39 anoche");
		const id = startSession(ana, lucia.id, "caso");
		const fiebre = store.getSession(id)?.historyOverrides.fiebre;
		expect(lucia.variations.fiebre).toContain(fiebre);
		expect(voiceInstructions(ana, id)).toContain(fiebre);
	});

	test("anotar_dato: lo inventado queda en las instrucciones y no pisa la historia", () => {
		const id = startSession(ana, lucia.id, "caso");
		runTool(ana, id, "anotar_dato", {
			clave: "hermanos",
			valor: "tengo dos hermanos",
		});
		runTool(ana, id, "anotar_dato", {
			clave: "fiebre",
			valor: "nunca tuve fiebre",
		});
		const facts = store.getSession(id)?.inventedFacts;
		expect(facts).toEqual({ hermanos: "tengo dos hermanos" });
		expect(voiceInstructions(ana, id)).toContain("tengo dos hermanos");
	});

	test("los tokens de la voz se suman por sesión", async () => {
		const { recordVoiceUsage } = await import("@/server/voice");
		const id = startSession(ana, lucia.id, "caso");
		const u = {
			inputTokens: 100,
			outputTokens: 50,
			inputAudioTokens: 80,
			outputAudioTokens: 40,
			cachedTokens: 10,
		};
		recordVoiceUsage(ana, id, u);
		expect(recordVoiceUsage(ana, id, u)).toEqual({
			responses: 2,
			inputTokens: 200,
			outputTokens: 100,
			inputAudioTokens: 160,
			outputAudioTokens: 80,
			cachedTokens: 20,
		});
		expect(() => recordVoiceUsage(beto, id, u)).toThrow("Sesión no encontrada");
	});
});
