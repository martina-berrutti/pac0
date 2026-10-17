import { type NextRequest, NextResponse } from "next/server";

import { exchangeCodeForUid, OAUTH_STATE_COOKIE } from "@/server/google";
import { store } from "@/server/store";
import { SESSION_COOKIE, signViewer } from "@/server/token";

// Las cuentas duran 7 días (no hay forma de anular un token robado antes);
// los invitados, 24 horas.
const ACCOUNT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Vuelta de Google: valida el state, obtiene nuestro id y abre la sesión.
export async function GET(request: NextRequest) {
	const origin = request.nextUrl.origin;
	const fail = (reason: string) => {
		const res = NextResponse.redirect(
			new URL(`/entrar?error=${reason}`, origin),
		);
		res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/google" });
		return res;
	};
	const code = request.nextUrl.searchParams.get("code");
	const state = request.nextUrl.searchParams.get("state");
	const expected = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
	if (!code || !state || !expected || state !== expected)
		return fail("google-cancelado");

	try {
		const uid = await exchangeCodeForUid(code, origin);
		const profile = await store.getProfile(uid);
		const exp = Date.now() + ACCOUNT_TTL_MS;
		const token = await signViewer({
			uid,
			alias: profile?.alias ?? null,
			careerYear: profile?.careerYear ?? null,
			guest: false,
			exp,
		});
		// Primer ingreso: elegir alias y año de carrera.
		const res = NextResponse.redirect(
			new URL(profile ? "/casos" : "/perfil", origin),
		);
		res.cookies.set(SESSION_COOKIE, token, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			path: "/",
			expires: new Date(exp),
		});
		res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/google" });
		return res;
	} catch (error) {
		console.error("Login con Google", error);
		return fail("google-fallo");
	}
}
