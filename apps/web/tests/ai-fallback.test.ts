// Si un modelo de Gemini se cuelga o se queda sin cuota, se saltea un rato y
// los pedidos siguientes van directo al que anda (server/ai.ts).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const genai = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
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
		expect(modelsToTry(models, Date.now() + BENCH_MS + 1)).toEqual(models);
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
