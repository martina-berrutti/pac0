import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, verifyViewer } from "@/server/token";

// Todo es privado salvo el inicio y la pantalla de entrada. Las rutas de
// /api validan al usuario por su cuenta.
const PUBLIC = new Set(["/", "/entrar"]);

export default async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const viewer = await verifyViewer(request.cookies.get(SESSION_COOKIE)?.value);
	if (pathname === "/entrar" && viewer) {
		return NextResponse.redirect(new URL("/casos", request.url));
	}
	if (!PUBLIC.has(pathname) && !viewer) {
		return NextResponse.redirect(new URL("/entrar", request.url));
	}
	return NextResponse.next();
}

export const config = {
	// Páginas solamente: sin /api, archivos estáticos ni internos de Next.
	matcher: ["/((?!api|_next|.*\\..*).*)"],
};
