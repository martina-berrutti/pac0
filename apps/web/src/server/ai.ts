// Cliente mínimo de OpenAI por fetch. Sin OPENAI_API_KEY la app sigue
// funcionando con el paciente por reglas y el juez por reglas.
// La clave solo se lee acá, en el servidor (AGENTS.md).
import "server-only";

import type { z } from "zod";

const API = "https://api.openai.com/v1/chat/completions";

export function aiEnabled() {
	return Boolean(process.env.OPENAI_API_KEY);
}

function model() {
	return process.env.AI_MODEL || "gpt-4o-mini";
}

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

async function call(messages: ChatMessage[], json: boolean): Promise<string> {
	const key = process.env.OPENAI_API_KEY;
	if (!key) throw new Error("Sin OPENAI_API_KEY");
	const res = await fetch(API, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: model(),
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
