// Si un modelo de Gemini se cuelga o se queda sin cuota, se saltea un rato y
// los pedidos siguientes van directo al que anda (server/ai.ts).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const genai = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
	ThinkingLevel: { LOW: "LOW" },
	GoogleGenAI: class {
		models = { generateContent: genai.generateContent };
	},
}));

import {
	BENCH_MS,
	CHAT_TIMEOUT_MS,
	chat,
	JSON_TIMEOUT_MS,
	modelsToTry,
	resetBench,
} from "@/server/ai";

const abort = () =>
	Object.assign(new Error("This operation was aborted"), {
		name: "AbortError",
	});
const modelOf = (i: number) =>
	(genai.generateContent.mock.calls[i]?.[0] as { model?: string } | undefined)
		?.model;

beforeEach(() => {
	resetBench();
	genai.generateContent.mockReset();
	vi.stubEnv("GEMINI_API_KEY", "AIza-test");
	vi.stubEnv("AI_MODEL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("modelos de Gemini que fallan", () => {
	test("el modelo colgado se saltea: solo el primer pedido pierde el tope", async () => {
		genai.generateContent.mockImplementation(async ({ model }) => {
			if (model === "gemini-3.8-flash") throw abort();
			return { text: "Hola, doc." };
		});
		expect(await chat([{ role: "user", content: "hola" }])).toBe("Hola, doc.");
		expect(genai.generateContent).toHaveBeenCalledTimes(2);

		expect(await chat([{ role: "user", content: "¿y?" }])).toBe("Hola, doc.");
		// El segundo pedido va directo al que anda.
		expect(genai.generateContent).toHaveBeenCalledTimes(3);
		expect(modelOf(2)).toBe("gemini-3.5-flash-lite");
	});

	test("sin cuota (429) también se saltea; un error cualquiera no", async () => {
		genai.generateContent.mockRejectedValueOnce(
			new Error(
				'{"error":{"code":429,"message":"You exceeded your current quota"}}',
			),
		);
		genai.generateContent.mockResolvedValueOnce({ text: "ok" });
		await chat([{ role: "user", content: "hola" }]);
		expect(modelsToTry(["gemini-3.8-flash", "gemini-3.5-flash-lite"])).toEqual([
			"gemini-3.5-flash-lite",
		]);

		resetBench();
		genai.generateContent.mockRejectedValueOnce(new Error("respuesta rara"));
		genai.generateContent.mockResolvedValueOnce({ text: "ok" });
		await chat([{ role: "user", content: "hola" }]);
		expect(
			modelsToTry(["gemini-3.5-flash-lite", "gemini-3.8-flash"]),
		).toHaveLength(2);
	});

	test("si están todos en pausa, falla enseguida sin llamar; a los 5 minutos se vuelven a probar", async () => {
		genai.generateContent.mockRejectedValue(abort());
		await expect(chat([{ role: "user", content: "hola" }])).rejects.toThrow();
		expect(genai.generateContent).toHaveBeenCalledTimes(2);
		await expect(chat([{ role: "user", content: "¿y?" }])).rejects.toThrow(
			"en pausa",
		);
		expect(genai.generateContent).toHaveBeenCalledTimes(2);
		const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
		expect(modelsToTry(models, "chat", Date.now() + BENCH_MS + 1)).toEqual(
			models,
		);
	});

	test("que el evaluador se pase de tiempo no deja al paciente sin IA", async () => {
		const { completeJson } = await import("@/server/ai");
		const { z } = await import("zod");
		genai.generateContent.mockImplementation(async ({ config }) => {
			if (config.responseMimeType === "application/json") throw abort();
			return { text: "Hola, doc." };
		});
		await expect(
			completeJson("x", z.object({ ok: z.boolean() })),
		).rejects.toThrow();
		const models = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
		expect(modelsToTry(models, "json")).toEqual([]);
		expect(modelsToTry(models, "chat")).toEqual(models);
		expect(await chat([{ role: "user", content: "hola" }])).toBe("Hola, doc.");
	});

	test("sin cuota se pausa para los dos tipos de pedido", async () => {
		genai.generateContent.mockRejectedValueOnce(
			new Error("RESOURCE_EXHAUSTED: quota"),
		);
		genai.generateContent.mockResolvedValueOnce({ text: "ok" });
		await chat([{ role: "user", content: "hola" }]);
		expect(modelsToTry(["gemini-3.8-flash"], "json")).toEqual([]);
	});

	test("piensa poco; si el modelo no acepta la opción, se reintenta sin ella", async () => {
		genai.generateContent.mockImplementation(async ({ config }) => {
			if (config.thinkingConfig)
				throw new Error(
					"400 INVALID_ARGUMENT: thinking_level is not supported",
				);
			return { text: "ok" };
		});
		expect(await chat([{ role: "user", content: "hola" }])).toBe("ok");
		const configs = genai.generateContent.mock.calls.map(
			(c) => (c[0] as { config: { thinkingConfig?: unknown } }).config,
		);
		expect(configs[0]?.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
		expect(configs[1]?.thinkingConfig).toBeUndefined();
		// Ya sabe que ese modelo no la acepta: no la vuelve a mandar.
		await chat([{ role: "user", content: "¿y?" }]);
		const third = genai.generateContent.mock.calls[2]?.[0] as
			| { config: { thinkingConfig?: unknown } }
			| undefined;
		expect(third?.config.thinkingConfig).toBeUndefined();
	});

	test("el evaluador (JSON) tiene más tiempo que el chat", async () => {
		const { completeJson } = await import("@/server/ai");
		const { z } = await import("zod");
		const timeout = vi.spyOn(AbortSignal, "timeout");
		genai.generateContent.mockResolvedValue({ text: '{"ok":true}' });
		await chat([{ role: "user", content: "hola" }]);
		await completeJson("x", z.object({ ok: z.boolean() }));
		expect(timeout.mock.calls.map((c) => c[0])).toEqual([
			CHAT_TIMEOUT_MS,
			JSON_TIMEOUT_MS,
		]);
		timeout.mockRestore();
	});
});

describe("motivo del juez por reglas", () => {
	test("tiempo, cuota, formato u otro, sin el mensaje del proveedor", async () => {
		const { fallbackReason } = await import("@/lib/scoring/ai-evaluate");
		const { z } = await import("zod");
		expect(fallbackReason(abort())).toBe("tiempo");
		expect(fallbackReason(new Error("Los modelos de IA están en pausa"))).toBe(
			"tiempo",
		);
		expect(fallbackReason(new Error('{"code":429,"quota"}'))).toBe("cuota");
		expect(fallbackReason(new SyntaxError("Unexpected token"))).toBe("formato");
		expect(
			fallbackReason(z.object({ a: z.string() }).safeParse({}).error),
		).toBe("formato");
		expect(fallbackReason(new Error("algo raro"))).toBe("otro");
	});
});

describe("tope del evaluador con IA", () => {
	test("si no termina a tiempo, sale el juez por reglas con el motivo", async () => {
		const { evaluateWithAi } = await import("@/lib/scoring/ai-evaluate");
		const { averageStudent } = await import("./helpers");
		const report = await evaluateWithAi(
			averageStudent(),
			() => new Promise(() => {}),
			50,
		);
		expect(report.judge).toBe("reglas");
		expect(report.judgeFallback).toBe("tiempo");
	});
});
