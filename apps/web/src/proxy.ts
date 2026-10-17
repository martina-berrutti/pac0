import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Todo es privado salvo el inicio y la pantalla de entrada.
const isPublicRoute = createRouteMatcher(["/", "/entrar"]);
const isSignInRoute = createRouteMatcher(["/entrar"]);

export default convexAuthNextjsMiddleware(
	async (request, { convexAuth }) => {
		const signedIn = await convexAuth.isAuthenticated();
		if (isSignInRoute(request) && signedIn) {
			return nextjsMiddlewareRedirect(request, "/casos");
		}
		if (!isPublicRoute(request) && !signedIn) {
			return nextjsMiddlewareRedirect(request, "/entrar");
		}
	},
	// Sin maxAge la cookie dura lo que el navegador: al cerrarlo se pierde la sesión.
	{ cookieConfig: { maxAge: 60 * 60 * 24 * 30 } },
);

export const config = {
	// Corre en todo menos archivos estáticos e internos de Next.
	matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
