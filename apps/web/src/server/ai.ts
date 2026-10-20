// IA de texto (paciente por texto y generador de personas). Usa Gemini si
// hay GEMINI_API_KEY (la misma clave de la voz); si no, OpenAI si hay
// OPENAI_API_KEY; sin ninguna, la app sigue con el paciente por reglas.
// Las claves solo se leen acá, en el servidor (AGENTS.md).
import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";

export function aiEnabled() {
	return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

// Tope por pedido: el chat del paciente tiene que ser rápido; el evaluador
// manda la lista de cotejo y toda la conversación, y tarda más.
export const CHAT_TIMEOUT_MS = 10_000;
export const JSON_TIMEOUT_MS = 30_000;

// Un modelo que se colgó o se quedó sin cuota se saltea un rato: si no, cada
// pedido pierde el tope entero esperándolo antes de pasar al que anda (con
// gemini-3.5-flash-lite colgado, cada respuesta tardaba 11 s y el evaluador
// con IA terminaba en el juez por reglas).
export const BENCH_MS = 5 * 60_000;
const benchedUntil = new Map<string, number>();

function isBenchable(error: unknown) {
	const text = String(error);
	return (
		(error instanceof Error &&
			(error.name === "AbortError" || error.name === "TimeoutError")) ||
		/aborted|timed? ?out|\b429\b|RESOURCE_EXHAUSTED|quota|\b503\b|UNAVAILABLE|overloaded/i.test(
			text,
		)
	);
}

// Los modelos a probar, sin los que están en pausa. Si están todos en pausa,
// ninguno: el pedido falla enseguida y la app sigue al instante con el
// paciente y el evaluador por reglas, en vez de esperar el tope en cada turno.
export function modelsToTry(models: string[], now = Date.now()) {
	return models.filter((m) => (benchedUntil.get(m) ?? 0) <= now);
}

export function benchModel(model: string, now = Date.now()) {
	benchedUntil.set(model, now + BENCH_MS);
}

// Para los tests.
export function resetBench() {
	benchedUntil.clear();
}

async function callGemini(
	apiKey: string,
	messages: ChatMessage[],
	json: boolean,
) {
	const ai = new GoogleGenAI({ apiKey });
	const system = messages
		.filter((m) => m.role === "system")
		.map((m) => m.content)
		.join("\n");
	const contents = messages
		.filter((m) => m.role !== "system")
		.map((m) => ({
			role: m.role === "assistant" ? "model" : "user",
			parts: [{ text: m.content }],
		}));
	// Primero el modelo liviano, que responde rápido (el paciente y el
	// generador no necesitan más); si falla, el de AI_MODEL.
	const models = [
		...new Set([
			"gemini-3.5-flash-lite",
			process.env.AI_MODEL || "gemini-3.8-flash",
		]),
	];

	let lastError: unknown = new Error(
		"Los modelos de IA están en pausa por fallar hace poco",
	);
	for (const model of modelsToTry(models)) {
		try {
			const res = await ai.models.generateContent({
				model,
				contents,
				config: {
					...(system ? { systemInstruction: system } : {}),
					temperature: json ? 0.2 : 0.8,
					...(json ? { responseMimeType: "application/json" } : {}),
					abortSignal: AbortSignal.timeout(
						json ? JSON_TIMEOUT_MS : CHAT_TIMEOUT_MS,
					),
				},
			});
			if (res.text) return res.text;
			lastError = new Error("Gemini no devolvió texto");
		} catch (error) {
			lastError = error;
			console.error(`Gemini ${model}`, String(error).slice(0, 200));
			if (isBenchable(error)) benchModel(model);
		}
	}
	throw lastError;
}

async function callOpenAI(
	apiKey: string,
	messages: ChatMessage[],
	json: boolean,
) {
	const res = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: process.env.OPENAI_MODEL || "gpt-4o-mini",
			messages,
			temperature: json ? 0.2 : 0.8,
			...(json ? { response_format: { type: "json_object" } } : {}),
		}),
		signal: AbortSignal.timeout(json ? JSON_TIMEOUT_MS : 20_000),
	});
	if (!res.ok) throw new Error(`OpenAI respondió ${res.status}`);
	const data = (await res.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	const content = data.choices?.[0]?.message?.content;
	if (!content) throw new Error("OpenAI no devolvió contenido");
	return content;
}

async function call(messages: ChatMessage[], json: boolean): Promise<string> {
	const gemini = process.env.GEMINI_API_KEY;
	if (gemini) return callGemini(gemini, messages, json);
	const openai = process.env.OPENAI_API_KEY;
	if (openai) return callOpenAI(openai, messages, json);
	throw new Error("Sin clave de IA");
}

export async function chat(messages: ChatMessage[]): Promise<string> {
	return call(messages, false);
}

// Pide JSON y lo valida con zod. Lanza si no hay clave o no valida.
export async function completeJson<T>(
	prompt: string,
	schema: z.ZodType<T>,
): Promise<T> {
	const raw = await call([{ role: "user", content: prompt }], true);
	// A veces el modelo envuelve el JSON en ```json ... ```.
	const unfenced = raw
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "");
	return schema.parse(JSON.parse(unfenced));
}
