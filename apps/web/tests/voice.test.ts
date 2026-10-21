import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// SDK de Google simulado: registra la clave usada y los tokens pedidos.
const genai = vi.hoisted(() => ({
	create: vi.fn(),
	keys: [] as string[],
	timeouts: [] as (number | undefined)[],
}));
vi.mock("@google/genai", () => ({
	Modality: { AUDIO: "AUDIO" },
	GoogleGenAI: class {
		authTokens = { create: genai.create };
		constructor(opts: { apiKey: string; httpOptions?: { timeout?: number } }) {
			genai.keys.push(opts.apiKey);
			genai.timeouts.push(opts.httpOptions?.timeout);
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
	genai.timeouts.length = 0;
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
			lucia.exam.orofaringe?.variants.completa,
		);
		// Al modelo no le llega el hallazgo.
		expect(JSON.stringify(completa.output)).not.toContain("eritema");
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
		const [pas, pad] = lucia.vitals.pa;
		expect(saved?.shown).toEqual({ pas, pad });
		// Ni el modelo ni la pantalla reciben el valor: lo mide el estudiante.
		expect(JSON.stringify(run.output)).not.toContain(String(pas));
		// Los valores, no el JSON entero: el id aleatorio de la medición a veces
		// contiene "112" y el test fallaba de a ratos.
		expect(run.ui).not.toHaveProperty("shown");
		expect(Object.values(run.ui)).not.toContain(pas);
		expect(Object.values(run.ui)).not.toContain(pad);
		expect(run.ui.kind === "vitals" && run.ui.measurementId).toBe(saved?.id);
		const bad = measure([112, 70], [], null, 26);
		expect(bad.shown.pas).toBeGreaterThan(112);
		expect(bad.techniqueErrors).toContain("piernas-cruzadas");
	});

	test("la confianza alcanzada por voz queda marcada para seguir por texto", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await store.changeSession(id, {
			set: {
				state: { confianza: 0.3, ansiedad: 0.3, dolor: 0.5, paciencia: 0.7 },
			},
		});
		await runTool(ana, id, "actualizar_estado", {
			delta: { confianza: 0.3 },
			motivo: "empatía",
		});
		expect((await store.getSession(id))?.trustReached).toBe(true);
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

	test("examinar el oído izquierdo abre ese lado", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		const r = await runTool(ana, id, "examinar", {
			zona: "oído izquierdo",
			claridad: "media",
			consentimiento: true,
		});
		expect(r.ui).toEqual({ kind: "otoscope", side: "izquierdo" });
	});

	test.each(["garganta", "oído"])(
		"mostrar_region con %s manda a examinar, sin decir que no está",
		async (region) => {
			const id = await startSession(ana, lucia.id, "caso");
			const r = await runTool(ana, id, "mostrar_region", { region });
			expect(r.ui.kind).toBe("none");
			expect(r.output.disponible).toBe(true);
			expect(String(r.output.mensaje)).toContain("examinar");
		},
	);

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
		expect(pickVariations(lucia, () => 0.99).fiebre).toBe(
			lucia.variations.fiebre?.at(-1),
		);
		const id = await startSession(ana, lucia.id, "caso");
		const fiebre = (await store.getSession(id))?.historyOverrides.fiebre;
		// Si tocó un varón, las opciones son las de "otroSexo".
		expect([
			...(lucia.variations.fiebre ?? []),
			...(lucia.patients?.otroSexo?.variations.fiebre ?? []),
		]).toContain(fiebre);
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
		// El cambio de ánimo queda acotado a ±0,3 por llamada.
		expect(state?.confianza).toBeCloseTo(0.6);
		const exam = await runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "Alta",
		});
		expect(exam.output.variante).toBe("completa");
		const bp = await runTool(ana, id, "medir_presion", {
			pasos_cumplidos: [...BP_STEPS, "paso_inventado"],
		});
		// El paso inventado no hace fallar la herramienta y no se guarda.
		expect(bp.ui.kind).toBe("vitals");
		expect((await store.listVitals(id))[0]?.stepsCompleted).toEqual([
			...BP_STEPS,
		]);
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

	test("el generador siempre crea mujeres, aunque pidan 'él' o 'varón'", async () => {
		const { generateCase } = await import("@/lib/patient/generator");
		for (const text of [
			"un paciente con dolor de garganta, que sea él",
			"un varón con dolor de garganta",
		]) {
			const { clinicalCase } = await generateCase({ text }, () => 0);
			expect(clinicalCase.patient.sex).toBe("f");
			expect(clinicalCase.patient.name).toBe("Valentina");
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

	test("un turno de voz largo se guarda recortado, no se pierde", async () => {
		const id = await startSession(ana, lucia.id, "mayor");
		const { turn } = await recordVoiceTurn(
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

describe("consentimiento de punta a punta (voz y evaluador)", () => {
	const finishFor = async (id: string) => {
		const { finishSession } = await import("@/server/consultation");
		return finishSession(ana, id, "faringitis", []);
	};
	const critical = (r: Awaited<ReturnType<typeof finishFor>>) =>
		r.mistakes.some((m) => m.tag === "examen-sin-consentimiento");

	test("pedir permiso después de examinar sigue siendo error crítico", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "alta",
			consentimiento: false,
		});
		// El permiso llega 5 segundos después del examen (en el test todo pasa
		// en el mismo milisegundo, y "a la vez" cuenta como con permiso).
		const startedAt = (await store.getSession(id))?.startedAt ?? Date.now();
		await store.updateSession(id, { startedAt: startedAt - 5000 });
		await recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"¿Me das permiso para revisarte la garganta?",
			false,
		);
		expect((await store.getSession(id))?.consentGiven).toBe(true);
		expect(critical(await finishFor(id))).toBe(true);
	});

	test("con permiso antes de examinar no hay error crítico", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"¿Te puedo revisar la garganta?",
			false,
		);
		await runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "alta",
			consentimiento: true,
		});
		expect(critical(await finishFor(id))).toBe(false);
	});
});

test("una medición empezada antes de los 8 minutos se puede terminar", async () => {
	const { markReading, placeCuff, startMeasurement } = await import(
		"@/server/vitals"
	);
	const id = await startSession(ana, lucia.id, "caso");
	const { measurementId } = await startMeasurement(ana, id);
	await placeCuff(ana, id, measurementId, "adecuado", false);
	// Pasaron 8 minutos y 20 segundos: se puede marcar, no empezar otra.
	await store.updateSession(id, {
		startedAt: Date.now() - (8 * 60 + 20) * 1000,
	});
	await expect(
		markReading(ana, id, measurementId, { pas: 110, pad: 70 }),
	).resolves.toEqual({ ok: true });
	await expect(startMeasurement(ana, id)).rejects.toThrow("8 minutos");
});

test("un docente ve la consulta de otro en solo lectura", async () => {
	const { getSessionView } = await import("@/server/consultation");
	const docente: Viewer = {
		uid: "ggl_docente",
		alias: "Profe",
		careerYear: "recibido",
		guest: false,
		exp: Date.now() + 1e6,
	};
	vi.stubEnv("DOCENTES", "ggl_docente");
	const id = await startSession(ana, lucia.id, "caso");
	expect((await getSessionView(ana, id)).readOnly).toBe(false);
	expect((await getSessionView(docente, id)).readOnly).toBe(true);
	await expect(getSessionView(beto, id)).rejects.toThrow(
		"Sesión no encontrada",
	);
});

test("el perfil que inventa la IA queda acotado", async () => {
	const { personaSchema } = await import("@/lib/patient/generator");
	const profile = Object.fromEntries(
		Array.from({ length: 20 }, (_, i) => [`dato${i}`, "x"]),
	);
	const ok = personaSchema.parse({
		name: "Ana",
		occupation: "docente",
		chiefComplaint: "Me duele la garganta",
		profile,
	});
	expect(Object.keys(ok.profile)).toHaveLength(6);
	expect(() =>
		personaSchema.parse({
			name: "Ana",
			occupation: "docente",
			chiefComplaint: "Me duele la garganta",
			profile: { vive: "a".repeat(500) },
		}),
	).toThrow();
});

test("el token de Gemini se pide con tope", async () => {
	vi.stubEnv("GEMINI_API_KEY", "AIza-test-servidor");
	genai.create.mockResolvedValueOnce({ name: "auth_tokens/t" });
	const id = await startSession(ana, lucia.id, "caso");
	await createLiveSession(ana, id);
	expect(genai.timeouts[0]).toBeGreaterThan(0);
	expect(genai.timeouts[0]).toBeLessThan(15_000);
});

describe("repetir cuando el paciente lo pide no es una pregunta repetida", () => {
	const ask = "¿Desde cuándo te duele la garganta?";
	const run = async (patientSays: string) => {
		const { finishSession } = await import("@/server/consultation");
		const id = await startSession(ana, lucia.id, "mayor");
		await recordVoiceTurn(ana, id, "estudiante", ask, false);
		await recordVoiceTurn(ana, id, "paciente", patientSays, false);
		await recordVoiceTurn(ana, id, "estudiante", ask, false);
		const events = await store.listEvents(id);
		const report = await finishSession(ana, id, "faringitis", []);
		return {
			stateRepeat: events.some((e) => e.motivo?.includes("repitió")),
			reportRepeat: report.mistakes.some((m) => m.tag === "repite-pregunta"),
		};
	};

	test("después de '¿cómo? no le escuché', repetir no penaliza", async () => {
		expect(
			await run("¿Cómo? Perdón, no le escuché bien. ¿Me lo repite?"),
		).toEqual({
			stateRepeat: false,
			reportRepeat: false,
		});
	});

	test("repetir sin que lo pida sigue contando", async () => {
		const r = await run("Desde hace dos días.");
		expect(r.stateRepeat).toBe(true);
	});
});

describe("revisión independiente", () => {
	test("el id de un caso generado no revela la plantilla y el otoscopio sigue andando", async () => {
		const { generateCase } = await import("@/lib/patient/generator");
		const { startOtoscopy } = await import("@/server/otoscopy");
		const { toSummary } = await import("@/cases/schema");
		const { clinicalCase } = await generateCase({
			text: "un paciente con dolor de oído",
		});
		expect(clinicalCase.id).not.toContain("otitis");
		expect(JSON.stringify(toSummary(clinicalCase))).not.toContain("otitis");
		await store.addGeneratedCase(ana.uid, clinicalCase);
		const id = await startSession(ana, clinicalCase.id, "caso");
		const { appearance } = await startOtoscopy(ana, id, "derecho");
		expect(appearance.canal).toBe("secrecion");
	});

	test("las claves que inventa el modelo quedan en ASCII (Convex no acepta otras)", async () => {
		const { asciiKey } = await import("@/lib/patient/keys");
		expect(asciiKey("Año de nacimiento")).toBe("ano_de_nacimiento");
		expect(asciiKey("$ocupación")).toBe("ocupacion");
		expect(asciiKey("¿?")).toBe("dato");
		const id = await startSession(ana, lucia.id, "caso");
		await runTool(ana, id, "anotar_dato", {
			clave: "con quién vive",
			valor: "con mi hermana",
		});
		const keys = Object.keys((await store.getSession(id))?.inventedFacts ?? {});
		expect(keys).toEqual(["con_quien_vive"]);
		const { personaSchema } = await import("@/lib/patient/generator");
		const persona = personaSchema.parse({
			name: "Ana",
			occupation: "docente",
			chiefComplaint: "Me duele la garganta",
			profile: { "situación laboral": "docente" },
		});
		expect(Object.keys(persona.profile)).toEqual(["situacion_laboral"]);
	});

	test("si el cierre se corta después de guardar el informe, leer el informe lo completa", async () => {
		const mistakes = await import("@/server/mistakes");
		const { finishSession, getReport } = await import("@/server/consultation");
		const id = await startSession(ana, lucia.id, "caso");
		const original = store.changeSession.bind(store);
		const spy = vi
			.spyOn(store, "changeSession")
			.mockImplementation(async (sid, change) => {
				if (
					change.ifStatus === "finalizada" &&
					change.set?.status === "evaluada"
				)
					throw new Error("Convex caído");
				return original(sid, change);
			});
		await expect(finishSession(ana, id, "faringitis", [])).rejects.toThrow(
			"Convex caído",
		);
		expect((await store.getSession(id))?.status).toBe("finalizada");
		spy.mockRestore();
		const record = vi.spyOn(mistakes, "recordMistakes");
		await getReport(ana, id);
		await getReport(ana, id);
		await finishSession(ana, id, "faringitis", []);
		expect(record).toHaveBeenCalledTimes(1);
		expect((await store.getSession(id))?.status).toBe("evaluada");
		record.mockRestore();
	});

	test("dos cierres a la vez suman los errores una sola vez", async () => {
		const mistakes = await import("@/server/mistakes");
		const { finishSession } = await import("@/server/consultation");
		const id = await startSession(ana, lucia.id, "caso");
		const record = vi.spyOn(mistakes, "recordMistakes");
		const results = await Promise.allSettled([
			finishSession(ana, id, "faringitis", []),
			finishSession(ana, id, "faringitis", []),
		]);
		expect(results.some((r) => r.status === "fulfilled")).toBe(true);
		expect(record).toHaveBeenCalledTimes(1);
		expect((await store.getSession(id))?.status).toBe("evaluada");
		record.mockRestore();
	});
});

test("el cupo por IP se cuenta solo si la consulta se va a crear", async () => {
	const counted = vi.fn(async () => {});
	await expect(
		startSession(ana, "caso-que-no-existe", "caso", counted),
	).rejects.toThrow("Caso no encontrado");
	expect(counted).not.toHaveBeenCalled();
	vi.stubEnv("MAX_SESSIONS_PER_USER_PER_DAY", "1");
	const carla: Viewer & { alias: string } = { ...ana, uid: "usr_carla" };
	await startSession(carla, lucia.id, "caso", counted);
	expect(counted).toHaveBeenCalledTimes(1);
	// Llegó a su tope diario: el pedido falla sin gastar el cupo del salón.
	await expect(startSession(carla, lucia.id, "caso", counted)).rejects.toThrow(
		"tope",
	);
	expect(counted).toHaveBeenCalledTimes(1);
});

describe("pedidos simultáneos a la misma consulta", () => {
	test("el consentimiento se da una sola vez", async () => {
		const { giveConsent } = await import("@/server/consultation");
		const id = await startSession(ana, lucia.id, "hostil");
		const session = await store.getSession(id);
		if (!session) throw new Error("sin sesión");
		await Promise.all([giveConsent(session, 1000), giveConsent(session, 1000)]);
		const events = await store.listEvents(id);
		expect(events.filter((e) => e.type === "consentimiento")).toHaveLength(1);
		expect(events.filter((e) => e.motivo === "consentimiento")).toHaveLength(1);
	});

	test("un solo cambio de ánimo del modelo por turno", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		await recordVoiceTurn(ana, id, "estudiante", "Hola, ¿cómo estás?", false);
		const before = (await store.getSession(id))?.state.confianza ?? 0;
		const runs = await Promise.all([
			runTool(ana, id, "actualizar_estado", {
				delta: { confianza: -0.1 },
				motivo: "a",
			}),
			runTool(ana, id, "actualizar_estado", {
				delta: { confianza: -0.1 },
				motivo: "b",
			}),
		]);
		expect(runs.filter((r) => r.output.ok === true)).toHaveLength(1);
		const after = (await store.getSession(id))?.state.confianza ?? 0;
		expect(after).toBeCloseTo(before - 0.1);
	});
});

describe("revisión exhaustiva", () => {
	test("si Google no da el token, la conexión reservada se devuelve", async () => {
		vi.stubEnv("GEMINI_API_KEY", "AIza-test");
		genai.create.mockRejectedValue(new Error("Google caído"));
		const id = await startSession(ana, lucia.id, "caso");
		for (let i = 0; i < 8; i++)
			await expect(createLiveSession(ana, id)).rejects.toThrow("No pudimos");
		expect((await store.getSession(id))?.voiceStarts ?? 0).toBe(0);
		genai.create.mockReset();
	});

	test("los tiempos del examen no tocan una otoscopia", async () => {
		const { saveExamTimes } = await import("@/server/consultation");
		const { startOtoscopy } = await import("@/server/otoscopy");
		const id = await startSession(ana, lucia.id, "caso");
		const { actionId } = await startOtoscopy(ana, id, "derecho");
		await expect(saveExamTimes(ana, id, actionId, {})).rejects.toThrow(
			"no encontrada",
		);
	});

	test("paciente por reglas: preguntas de la entrevista no son pedir el diagnóstico", async () => {
		const { ruleRespond } = await import("@/lib/patient/rule-responder");
		const { buildPatientBrief } = await import("@/lib/patient/brief");
		const b = buildPatientBrief(lucia, lucia.personality, "");
		const st = { confianza: 0.9, ansiedad: 0.3, dolor: 0.5, paciencia: 0.7 };
		const fishing = "para eso vine";
		expect(
			ruleRespond(b, st, "hace cuanto que tenes fiebre", 1).text,
		).not.toContain(fishing);
		expect(
			ruleRespond(b, st, "¿tenés algún diagnóstico previo?", 1).text,
		).not.toContain(fishing);
		expect(ruleRespond(b, st, "¿Qué tenés?", 1).text).toContain(fishing);
		expect(ruleRespond(b, st, "¿cuál es tu diagnóstico?", 1).text).toContain(
			fishing,
		);
	});

	test("generador: negaciones y 'abuela ansiosa'", async () => {
		const { generateCase } = await import("@/lib/patient/generator");
		const poco = await generateCase(
			{ text: "dolor de garganta, poco colaborador" },
			() => 0,
		);
		expect(poco.clinicalCase.personality.cooperacion).toBeLessThan(0.5);
		const callado = await generateCase(
			{ text: "dolor de garganta, que no hable mucho" },
			() => 0,
		);
		expect(callado.clinicalCase.personality.locuacidad).toBeLessThan(0.5);
		const abuela = await generateCase(
			{ text: "una abuela ansiosa con dolor de garganta" },
			() => 0,
		);
		expect(abuela.clinicalCase.patient.age).toBeGreaterThanOrEqual(68);
		expect(abuela.clinicalCase.personality.ansiedad).toBeGreaterThan(0.8);
	});

	test("clasificador: pedidos de repetir, empatía en preguntas y 'de verdad'", async () => {
		const { askedToRepeat, classifyStudentTurn, isLeadingQuestion } =
			await import("@/lib/patient/turn-classifier");
		for (const t of ["¿Qué?", "¿Eh?", "¿Perdón?", "¿Cómo dijo, doctor?"])
			expect(askedToRepeat(t), t).toBe(true);
		expect(askedToRepeat("¿Qué tal?")).toBe(false);
		expect(
			classifyStudentTurn("¿Es normal que tengas fiebre?", []).tags,
		).not.toContain("empatia");
		expect(isLeadingQuestion("¿De verdad?")).toBe(false);
		expect(classifyStudentTurn("tenes fiebre", []).tags).toContain(
			"pregunta_cerrada",
		);
	});
});

describe("pedidos simultáneos del mismo usuario", () => {
	test("el manguito se coloca una sola vez", async () => {
		const { placeCuff, startMeasurement } = await import("@/server/vitals");
		const id = await startSession(ana, lucia.id, "caso");
		const { measurementId } = await startMeasurement(ana, id);
		const results = await Promise.allSettled([
			placeCuff(ana, id, measurementId, "adecuado", false),
			placeCuff(ana, id, measurementId, "grande", false),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
	});

	test("la otoscopia se termina una sola vez", async () => {
		const { finishOtoscopy, startOtoscopy } = await import("@/server/otoscopy");
		const id = await startSession(ana, lucia.id, "caso");
		const { actionId } = await startOtoscopy(ana, id, "derecho");
		const record = {
			hand: "derecha" as const,
			prep: [],
			speculum: "adulto" as const,
			traction: "arriba-atras" as const,
			roughInsertions: 0,
			maxDepth: 10,
			canalMs: 1000,
			tympanumMs: 1000,
		};
		const results = await Promise.allSettled([
			finishOtoscopy(ana, id, actionId, record),
			finishOtoscopy(ana, id, actionId, record),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
	});

	test("dos consultas cerradas a la vez suman los errores de las dos", async () => {
		const { recordMistakes, getMistakes } = await import("@/server/mistakes");
		const report = (tag: string) =>
			({ mistakes: [{ tag, what: tag, critical: false }] }) as never;
		const uid = "usr_dos_pestanas";
		await Promise.all([
			recordMistakes(uid, report("a")),
			recordMistakes(uid, report("b")),
			recordMistakes(uid, report("a")),
		]);
		const entries = await getMistakes(uid);
		expect(entries.find((e) => e.tag === "a")?.count).toBe(2);
		expect(entries.find((e) => e.tag === "b")?.count).toBe(1);
	});

	test("el tope diario de consultas no se saltea con pedidos en paralelo", async () => {
		vi.stubEnv("MAX_SESSIONS_PER_USER_PER_DAY", "2");
		const dora: Viewer & { alias: string } = { ...ana, uid: "usr_dora" };
		const results = await Promise.allSettled(
			Array.from({ length: 5 }, () => startSession(dora, lucia.id, "caso")),
		);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
	});
});

test("la vista de la consulta no muestra la técnica de la otoscopia antes del informe", async () => {
	const { getSessionView } = await import("@/server/consultation");
	const { finishOtoscopy, startOtoscopy } = await import("@/server/otoscopy");
	const id = await startSession(ana, lucia.id, "caso");
	const { actionId } = await startOtoscopy(ana, id, "derecho");
	await finishOtoscopy(ana, id, actionId, {
		hand: "derecha",
		prep: [],
		speculum: "adulto",
		traction: "abajo-atras",
		roughInsertions: 3,
		maxDepth: 90,
		canalMs: 500,
		tympanumMs: 0,
	});
	expect((await store.listExamActions(id))[0]?.technique).toBeDefined();
	const view = await getSessionView(ana, id);
	expect(JSON.stringify(view.examActions)).not.toContain("technique");
});

test("Convex: un paciente de oído generado se puede guardar (claves con tilde)", async () => {
	const { convexToJson } = await import("convex/values");
	const { decodeKeys, encodeKeys } = await import("@/server/store");
	const { generateCase } = await import("@/lib/patient/generator");
	const { clinicalCase } = await generateCase({
		text: "un paciente con dolor de oído",
	});
	// Tal cual, Convex lo rechaza: así fallaba en producción.
	expect(() => convexToJson(clinicalCase as never)).toThrow("ASCII");
	const encoded = encodeKeys(clinicalCase);
	expect(() => convexToJson(encoded as never)).not.toThrow();
	expect(decodeKeys(encoded)).toEqual(clinicalCase);
	// Las claves comunes no cambian: los datos viejos se leen igual.
	expect(encodeKeys({ fiebre: "sí", $x: 1 })).toEqual({
		fiebre: "sí",
		"~k~%24x": 1,
	});
});
