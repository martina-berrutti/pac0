// Almacenamiento de la app web en Convex (apps/web/src/server/store.ts).
// Solo lo llama el servidor de Next.js, que ya validó al usuario con su
// cookie; cada función exige STORE_SECRET, que el navegador nunca ve.
import { ConvexError, v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";

export const recordKind = v.union(
	v.literal("case"),
	v.literal("session"),
	v.literal("turn"),
	v.literal("event"),
	v.literal("exam"),
	v.literal("vitals"),
	v.literal("report"),
);

function checkSecret(secret: string) {
	const expected = process.env.STORE_SECRET;
	if (!expected || secret !== expected) {
		throw new ConvexError("No autorizado");
	}
}

// Crea o reemplaza un registro por (kind, appId).
export const put = mutation({
	args: {
		secret: v.string(),
		kind: recordKind,
		appId: v.string(),
		sessionId: v.optional(v.string()),
		ownerId: v.optional(v.string()),
		data: v.any(),
	},
	handler: async (ctx, { secret, kind, appId, sessionId, ownerId, data }) => {
		checkSecret(secret);
		const existing = await ctx.db
			.query("records")
			.withIndex("by_kind_and_appId", (q) =>
				q.eq("kind", kind).eq("appId", appId),
			)
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, { data, sessionId, ownerId });
		} else {
			await ctx.db.insert("records", { kind, appId, sessionId, ownerId, data });
		}
	},
});

export const get = query({
	args: { secret: v.string(), kind: recordKind, appId: v.string() },
	handler: async (ctx, { secret, kind, appId }) => {
		checkSecret(secret);
		const doc = await ctx.db
			.query("records")
			.withIndex("by_kind_and_appId", (q) =>
				q.eq("kind", kind).eq("appId", appId),
			)
			.unique();
		return doc?.data ?? null;
	},
});

// Todo lo de una sesión, en orden de creación (turnos, eventos, exámenes).
export const listBySession = query({
	args: { secret: v.string(), kind: recordKind, sessionId: v.string() },
	handler: async (ctx, { secret, kind, sessionId }) => {
		checkSecret(secret);
		const docs = await ctx.db
			.query("records")
			.withIndex("by_kind_and_sessionId", (q) =>
				q.eq("kind", kind).eq("sessionId", sessionId),
			)
			.take(2000);
		return docs.map((d) => d.data);
	},
});

// Lo de un usuario (sus sesiones, sus casos generados).
export const listByOwner = query({
	args: { secret: v.string(), kind: recordKind, ownerId: v.string() },
	handler: async (ctx, { secret, kind, ownerId }) => {
		checkSecret(secret);
		const docs = await ctx.db
			.query("records")
			.withIndex("by_kind_and_ownerId", (q) =>
				q.eq("kind", kind).eq("ownerId", ownerId),
			)
			.order("desc")
			.take(200);
		return docs.map((d) => d.data);
	},
});

// Hoy todos los usuarios de la app web son invitados con cookie de 24 horas:
// pasado ese plazo su uid se pierde y lo guardado queda huérfano. Se borra a
// las 48 horas (plan.md, sección 10: borrar invitados). Cuando haya cuentas
// con Google, esto tiene que mirar solo a los invitados.
export const RECORD_TTL_MS = 48 * 60 * 60 * 1000;
const RECORDS_PER_RUN = 500;

export const purgeExpired = internalMutation({
	args: {},
	handler: async (ctx) => {
		const old = await ctx.db
			.query("records")
			.withIndex("by_creation_time", (q) =>
				q.lt("_creationTime", Date.now() - RECORD_TTL_MS),
			)
			.take(RECORDS_PER_RUN);
		for (const doc of old) {
			await ctx.db.delete(doc._id);
		}
		return old.length;
	},
});
