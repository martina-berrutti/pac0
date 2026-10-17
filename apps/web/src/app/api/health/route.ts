import { sessionLimits } from "@/server/consultation";
import { storeKind } from "@/server/store";

// Diagnóstico sin secretos: qué almacenamiento usa el servidor y qué está
// configurado. Nunca devuelve valores, solo si existen.
export async function GET() {
	return Response.json({
		store: storeKind,
		voz: Boolean(process.env.GEMINI_API_KEY),
		sessionSecret: Boolean(process.env.SESSION_SECRET),
		convexUrl: Boolean(process.env.CONVEX_URL),
		storeSecret: Boolean(process.env.STORE_SECRET),
		google: Boolean(
			process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
		),
		docentes: Boolean(process.env.DOCENTES),
		topes: sessionLimits(),
		entorno: process.env.VERCEL_ENV ?? "local",
	});
}
