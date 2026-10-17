// Identidad del usuario en las rutas. Hoy: invitado con cookie firmada.
// Al final, Google y los usuarios vuelven a Convex Auth (TODO.md, fase final).
import "server-only";

import { cookies } from "next/headers";

import {
	SESSION_COOKIE,
	SESSION_TTL_MS,
	signViewer,
	type Viewer,
	verifyViewer,
} from "./token";

export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export async function getViewer(): Promise<Viewer | null> {
	const jar = await cookies();
	return verifyViewer(jar.get(SESSION_COOKIE)?.value);
}

export async function requireViewer(): Promise<Viewer> {
	const viewer = await getViewer();
	if (!viewer) throw new HttpError(401, "No autenticado");
	return viewer;
}

// Usuario que ya tiene alias (el invitado lo recibe al entrar).
export async function requireProfile(): Promise<Viewer & { alias: string }> {
	const viewer = await requireViewer();
	if (!viewer.alias) throw new HttpError(403, "Falta elegir un alias");
	return { ...viewer, alias: viewer.alias };
}

export type Role = "estudiante" | "docente";

// Docentes: lista autorizada a mano en DOCENTES (ids de cuenta separados por
// coma, los que muestra /api/me). Se lee en cada pedido, así que sacar a
// alguien de la lista le quita el acceso enseguida. Un invitado nunca es docente.
export function roleOf(viewer: Viewer): Role {
	if (viewer.guest) return "estudiante";
	const teachers = (process.env.DOCENTES ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	return teachers.includes(viewer.uid) ? "docente" : "estudiante";
}

export async function requireTeacher(): Promise<Viewer> {
	const viewer = await requireViewer();
	if (roleOf(viewer) !== "docente")
		throw new HttpError(403, "Solo para docentes autorizados");
	return viewer;
}

export async function setViewer(
	viewer: Omit<Viewer, "exp"> & { exp?: number },
) {
	const exp = viewer.exp ?? Date.now() + SESSION_TTL_MS;
	const jar = await cookies();
	jar.set(SESSION_COOKIE, await signViewer({ ...viewer, exp }), {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		expires: new Date(exp),
	});
}

export async function clearViewer() {
	const jar = await cookies();
	jar.delete(SESSION_COOKIE);
}

export function guestAlias() {
	return `Invitado ${Math.floor(1000 + Math.random() * 9000)}`;
}

// Mismas reglas que convex/users.ts: sin nombre real, cédula ni teléfono.
export function validateAlias(raw: string) {
	const alias = raw.trim().replace(/\s+/g, " ");
	if (alias.length < 2 || alias.length > 24) {
		throw new HttpError(
			400,
			"El alias tiene que tener entre 2 y 24 caracteres",
		);
	}
	if (!/^[\p{L}\p{N} _.-]+$/u.test(alias)) {
		throw new HttpError(
			400,
			"El alias solo puede tener letras, números, espacios, puntos, guiones y guiones bajos",
		);
	}
	if (/\d{6,}/.test(alias.replace(/[ _.-]/g, ""))) {
		throw new HttpError(
			400,
			"No uses números de cédula ni de teléfono en el alias",
		);
	}
	return alias;
}

export const CAREER_YEARS = [
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"internado",
	"recibido",
] as const;
