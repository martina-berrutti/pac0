// Límite por IP para crear invitados y consultas: sin él, alguien podía crear
// invitados sin fin y saltear el tope de consultas por usuario, gastando el
// tope diario de todos. Los topes son altos porque un salón entero comparte la
// IP de la facultad. La IP no se guarda: se guarda un hash con SESSION_SECRET.
import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

import { HttpError } from "./auth";
import { store } from "./store";

const HOUR_MS = 60 * 60 * 1000;

function limitFromEnv(name: string, fallback: number) {
	const n = Number(process.env[name]);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function ipLimits() {
	return {
		guests: limitFromEnv("MAX_GUESTS_PER_IP_PER_HOUR", 50),
		sessions: limitFromEnv("MAX_SESSIONS_PER_IP_PER_HOUR", 100),
		generate: limitFromEnv("MAX_GENERATED_PER_IP_PER_HOUR", 60),
	};
}

// En Vercel, x-forwarded-for la pone la plataforma (pisa la del cliente).
export async function clientIp(): Promise<string> {
	const h = await headers();
	return (
		h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		h.get("x-real-ip")?.trim() ||
		"local"
	);
}

function ipKey(action: string, ip: string) {
	const secret = process.env.SESSION_SECRET ?? "desarrollo-local";
	const hash = createHmac("sha256", secret).update(ip).digest("hex");
	return `${action}:${hash.slice(0, 32)}`;
}

const MESSAGES = {
	guests: "Se crearon demasiados invitados desde esta red. Probá en un rato.",
	sessions:
		"Se empezaron demasiadas consultas desde esta red. Probá en un rato.",
	generate:
		"Se pidieron demasiados pacientes desde esta red. Probá en un rato.",
};

export async function limitByIp(action: "guests" | "sessions" | "generate") {
	const max = ipLimits()[action];
	const key = ipKey(action, await clientIp());
	// Si Convex todavía no tiene la función (falta npx convex deploy), no se
	// frena a nadie: siguen los topes por usuario y por día.
	const ok = await store.hitRate(key, HOUR_MS, max).catch((error) => {
		console.error("No se pudo contar el límite por IP", error);
		return true;
	});
	if (!ok) throw new HttpError(429, MESSAGES[action]);
}
