// Login con Google por OAuth (Persona 1). Solo se pide "openid": Google no
// nos da nombre, correo ni foto, y del identificador de la cuenta se guarda
// un hash (AGENTS.md: sin datos personales).
import "server-only";

import { HttpError } from "./auth";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const OAUTH_STATE_COOKIE = "p0_oauth_state";
export const ACCOUNT_PREFIX = "ggl_";

export function googleConfigured() {
	return Boolean(
		process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
	);
}

export function callbackUrl(origin: string) {
	return `${origin}/api/auth/google/callback`;
}

export function authorizationUrl(origin: string, state: string) {
	const params = new URLSearchParams({
		client_id: process.env.GOOGLE_CLIENT_ID ?? "",
		redirect_uri: callbackUrl(origin),
		response_type: "code",
		scope: "openid",
		state,
		prompt: "select_account",
	});
	return `${AUTH_URL}?${params}`;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
	const part = jwt.split(".")[1];
	if (!part) throw new HttpError(502, "Google devolvió un token inválido");
	const json = Buffer.from(
		part.replace(/-/g, "+").replace(/_/g, "/"),
		"base64",
	).toString("utf8");
	return JSON.parse(json) as Record<string, unknown>;
}

async function sha256Hex(text: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(text),
	);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

// Cambia el código por el id_token y devuelve nuestro id de usuario. El
// id_token llega directo de Google por HTTPS con nuestro secreto, así que no
// hace falta verificar la firma (OpenID Connect, sección 3.1.3.7); igual se
// controlan emisor, audiencia y vencimiento.
export async function exchangeCodeForUid(
	code: string,
	origin: string,
): Promise<string> {
	const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
			redirect_uri: callbackUrl(origin),
			grant_type: "authorization_code",
		}),
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) {
		console.error("Google token", res.status, await res.text().catch(() => ""));
		throw new HttpError(502, "Google no aceptó el inicio de sesión");
	}
	const { id_token: idToken } = (await res.json()) as { id_token?: string };
	if (!idToken) throw new HttpError(502, "Google no devolvió el token");
	const claims = decodeJwtPayload(idToken);
	const issuerOk =
		claims.iss === "https://accounts.google.com" ||
		claims.iss === "accounts.google.com";
	const audienceOk = claims.aud === clientId;
	const fresh =
		typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
	if (!issuerOk || !audienceOk || !fresh || typeof claims.sub !== "string") {
		throw new HttpError(401, "Token de Google inválido");
	}
	// Solo un hash del identificador: no se puede volver a la cuenta.
	return `${ACCOUNT_PREFIX}${(await sha256Hex(`pac0:${claims.sub}`)).slice(0, 32)}`;
}
