// Control de acceso compartido. Toda función pública de Convex empieza por
// uno de estos helpers (plan.md, sección 10: "cada función de Convex verifica
// el usuario").
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) {
		throw new ConvexError("No autenticado");
	}
	const user = await ctx.db.get(userId);
	if (user === null) {
		throw new ConvexError("No autenticado");
	}
	return user;
}

// Usuario que ya eligió su alias (el invitado lo recibe al entrar).
export async function requireProfile(
	ctx: QueryCtx,
): Promise<Doc<"users"> & { alias: string }> {
	const user = await requireUser(ctx);
	if (user.alias === undefined) {
		throw new ConvexError("Falta elegir un alias");
	}
	return { ...user, alias: user.alias };
}

// Una sesión solo la ve su dueño.
export async function requireOwnSession(
	ctx: QueryCtx,
	sessionId: Id<"sessions">,
) {
	const user = await requireUser(ctx);
	const session = await ctx.db.get(sessionId);
	if (session === null || session.userId !== user._id) {
		// Mismo error si no existe o es de otro: no se revela cuál.
		throw new ConvexError("Sesión no encontrada");
	}
	return { user, session };
}

// Un informe lo leen su dueño y los docentes autorizados.
export function canReadReport(user: Doc<"users">, report: Doc<"reports">) {
	return report.userId === user._id || user.role === "docente";
}

export async function requireReadableReport(
	ctx: QueryCtx,
	reportId: Id<"reports">,
) {
	const user = await requireUser(ctx);
	const report = await ctx.db.get(reportId);
	if (report === null || !canReadReport(user, report)) {
		throw new ConvexError("Informe no encontrado");
	}
	return { user, report };
}
