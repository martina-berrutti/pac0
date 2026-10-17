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
	v.literal("user"),
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
		guest: v.optional(v.boolean()),
		data: v.any(),
	},
	handler: async (
		ctx,
		{ secret, kind, appId, sessionId, ownerId, guest, data },
	) => {
		checkSecret(secret);
		const existing = await ctx.db
			.query("records")
			.withIndex("by_kind_and_appId", (q) =>
				q.eq("kind", kind).eq("appId", appId),
			)
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, { data, sessionId, ownerId, guest });
		} else {
			await ctx.db.insert("records", {
				kind,
				appId,
				sessionId,
				ownerId,
				guest,
				data,
			});
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

const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
const PER_RUN = 50;

// Borra lo de los invitados de más de 24 horas (plan.md, sección 10): sus
// sesiones con todo lo que cuelga de ellas y sus casos generados.
export const purgeExpiredGuests = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - GUEST_TTL_MS;
		let deleted = 0;
		for (const kind of ["session", "case"] as const) {
			// Por índice: solo invitados, del más viejo al más nuevo.
			const old = await ctx.db
				.query("records")
				.withIndex("by_guest_and_kind", (q) =>
					q.eq("guest", true).eq("kind", kind),
				)
				.order("asc")
				.take(PER_RUN);
			for (const doc of old) {
				if (doc._creationTime > cutoff) break;
				if (kind === "session") {
					for (const child of [
						"turn",
						"event",
						"exam",
						"vitals",
						"report",
					] as const) {
						const rows = await ctx.db
							.query("records")
							.withIndex("by_kind_and_sessionId", (q) =>
								q.eq("kind", child).eq("sessionId", doc.appId),
							)
							.take(2000);
						for (const row of rows) await ctx.db.delete(row._id);
						deleted += rows.length;
					}
				}
				await ctx.db.delete(doc._id);
				deleted += 1;
			}
		}
		return deleted;
	},
});
