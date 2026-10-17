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
	// Si el modelo principal está saturado (503), se prueba el de respaldo.
	const models = [
		...new Set([
			process.env.AI_MODEL || "gemini-3.8-flash",
			"gemini-3.5-flash-lite",
		]),
	];
	let lastError: unknown;
	for (const model of models) {
		try {
			const res = await ai.models.generateContent({
				model,
				contents,
				config: {
					...(system ? { systemInstruction: system } : {}),
					temperature: json ? 0.2 : 0.8,
					...(json ? { responseMimeType: "application/json" } : {}),
					abortSignal: AbortSignal.timeout(20_000),
				},
			});
			if (res.text) return res.text;
			lastError = new Error("Gemini no devolvió texto");
		} catch (error) {
			lastError = error;
			console.error(`Gemini ${model}`, String(error).slice(0, 200));
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
		signal: AbortSignal.timeout(20_000),
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
	return schema.parse(JSON.parse(raw));
}
