import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { authorizationUrl, exchangeCodeForUid } from "@/server/google";

function idToken(claims: Record<string, unknown>) {
	const b64 = (o: unknown) =>
		Buffer.from(JSON.stringify(o)).toString("base64url");
	return `${b64({ alg: "RS256" })}.${b64(claims)}.firma`;
}

const valid = {
	iss: "https://accounts.google.com",
	aud: "cliente-de-prueba",
	sub: "1234567890",
	exp: Math.floor(Date.now() / 1000) + 3600,
};

beforeEach(() => {
	vi.stubEnv("GOOGLE_CLIENT_ID", "cliente-de-prueba");
	vi.stubEnv("GOOGLE_CLIENT_SECRET", "secreto-de-prueba");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("login con Google", () => {
	test("solo pide openid: ni nombre, ni correo, ni foto", () => {
		const url = new URL(authorizationUrl("https://pac0.example", "estado"));
		expect(url.searchParams.get("scope")).toBe("openid");
		expect(url.searchParams.get("redirect_uri")).toBe(
			"https://pac0.example/api/auth/google/callback",
		);
		expect(url.searchParams.get("state")).toBe("estado");
	});

	test("devuelve un id con hash, estable y sin el sub de Google", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ id_token: idToken(valid) })),
		);
		const uid = await exchangeCodeForUid("codigo", "https://pac0.example");
		expect(uid).toMatch(/^ggl_[0-9a-f]{32}$/);
		expect(uid).not.toContain(valid.sub);
		expect(await exchangeCodeForUid("codigo", "https://pac0.example")).toBe(
			uid,
		);
	});

	test.each([
		["otra audiencia", { ...valid, aud: "otra-app" }],
		["otro emisor", { ...valid, iss: "https://malicioso.example" }],
		["vencido", { ...valid, exp: Math.floor(Date.now() / 1000) - 10 }],
	])("rechaza un token con %s", async (_, claims) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ id_token: idToken(claims) })),
		);
		await expect(
			exchangeCodeForUid("codigo", "https://pac0.example"),
		).rejects.toThrow("inválido");
	});

	test("si Google rechaza el código, falla con un mensaje claro", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("bad", { status: 400 })),
		);
		await expect(
			exchangeCodeForUid("codigo", "https://pac0.example"),
		).rejects.toThrow("no aceptó");
	});
});
