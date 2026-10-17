import { type NextRequest, NextResponse } from "next/server";

import {
	authorizationUrl,
	googleConfigured,
	OAUTH_STATE_COOKIE,
} from "@/server/google";

// Empieza el login con Google. El state evita que otro sitio complete el
// login en nombre del usuario (CSRF).
export async function GET(request: NextRequest) {
	const origin = request.nextUrl.origin;
	if (!googleConfigured()) {
		return NextResponse.redirect(
			new URL("/entrar?error=google-no-configurado", origin),
		);
	}
	const state = crypto.randomUUID();
	const res = NextResponse.redirect(authorizationUrl(origin, state));
	res.cookies.set(OAUTH_STATE_COOKIE, state, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/api/auth/google",
		maxAge: 10 * 60,
	});
	return res;
}
