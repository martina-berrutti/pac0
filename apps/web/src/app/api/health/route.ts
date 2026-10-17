import { getViewer, roleOf } from "@/server/auth";
import { sessionLimits } from "@/server/consultation";
import { ipLimits } from "@/server/rate-limit";
import { storeKind } from "@/server/store";

// Diagnóstico sin secretos (nunca valores, solo si existen). Lo público es lo
// mínimo para saber si anda; el detalle de configuración y los topes, solo
// para docentes (son los números que un abuso necesitaría).
export async function GET() {
	const ok = {
		ok: true,
		store: storeKind,
		voz: Boolean(process.env.GEMINI_API_KEY),
		google: Boolean(
			process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
		),
	};
	const viewer = await getViewer();
	if (!viewer || roleOf(viewer) !== "docente") return Response.json(ok);
	return Response.json({
		...ok,
		sessionSecret: Boolean(process.env.SESSION_SECRET),
		convexUrl: Boolean(process.env.CONVEX_URL),
		storeSecret: Boolean(process.env.STORE_SECRET),
		docentes: Boolean(process.env.DOCENTES),
		topes: { ...sessionLimits(), porIpPorHora: ipLimits() },
		entorno: process.env.VERCEL_ENV ?? "local",
	});
}
