// Almacenamiento de la app web en Convex (apps/web/src/server/store.ts).
// Solo lo llama el servidor de Next.js, que ya validó al usuario con su
// cookie; cada función exige STORE_SECRET, que el navegador nunca ve.
import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import {
	internalMutation,
	type MutationCtx,
	mutation,
	query,
} from "./_generated/server";

export const recordKind = v.union(
	v.literal("case"),
	v.literal("session"),
	v.literal("turn"),
	v.literal("event"),
	v.literal("exam"),
	v.literal("vitals"),
	v.literal("report"),
	v.literal("user"),
	v.literal("mistakes"),
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

// Últimas sesiones de todos (invitados y cuentas), para los docentes.
export const listRecentSessions = query({
	args: { secret: v.string(), limit: v.number() },
	handler: async (ctx, { secret, limit }) => {
		checkSecret(secret);
		const n = Math.min(Math.max(1, Math.floor(limit)), 200);
		const lists = await Promise.all(
			[true, false].map((guest) =>
				ctx.db
					.query("records")
					.withIndex("by_guest_and_kind", (q) =>
						q.eq("guest", guest).eq("kind", "session"),
					)
					.order("desc")
					.take(n),
			),
		);
		return lists
			.flat()
			.sort((a, b) => b._creationTime - a._creationTime)
			.slice(0, n)
			.map((d) => d.data);
	},
});

// Sesiones creadas desde `since` por todos los usuarios, hasta `max` (para el
// tope diario que cuida los créditos de la voz).
export const countSessionsSince = query({
	args: { secret: v.string(), since: v.number(), max: v.number() },
	handler: async (ctx, { secret, since, max }) => {
		checkSecret(secret);
		let count = 0;
		for (const guest of [true, false]) {
			const docs = await ctx.db
				.query("records")
				.withIndex("by_guest_and_kind", (q) =>
					q
						.eq("guest", guest)
						.eq("kind", "session")
						.gte("_creationTime", since),
				)
				.take(Math.min(Math.max(0, Math.floor(max)), 5000));
			count += docs.length;
		}
		return count;
	},
});

const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PER_RUN = 50;

// Borra una sesión con todo lo que cuelga de ella.
async function deleteSession(ctx: MutationCtx, doc: Doc<"records">) {
	let deleted = 0;
	for (const child of ["turn", "event", "exam", "vitals", "report"] as const) {
		const rows = await ctx.db
			.query("records")
			.withIndex("by_kind_and_sessionId", (q) =>
				q.eq("kind", child).eq("sessionId", doc.appId),
			)
			.take(2000);
		for (const row of rows) await ctx.db.delete(row._id);
		deleted += rows.length;
	}
	await ctx.db.delete(doc._id);
	return deleted + 1;
}

// Borra lo de los invitados de más de 24 horas (plan.md, sección 10): sus
// sesiones con todo lo que cuelga de ellas, sus casos generados y su perfil
// de errores.
export const purgeExpiredGuests = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - GUEST_TTL_MS;
		let deleted = 0;
		for (const kind of ["session", "case", "mistakes"] as const) {
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
					deleted += await deleteSession(ctx, doc);
				} else {
					await ctx.db.delete(doc._id);
					deleted += 1;
				}
			}
		}
		return deleted;
	},
});

// Retención de las transcripciones de las cuentas (plan.md, sección 2): con
// TRANSCRIPT_RETENTION_DAYS cargada, borra las sesiones más viejas con todo
// lo que cuelga de ellas. Sin la variable no borra nada: el plazo lo define
// la facultad (ley 18.331).
export const purgeOldSessions = internalMutation({
	args: {},
	handler: async (ctx) => {
		const days = Number(process.env.TRANSCRIPT_RETENTION_DAYS);
		if (!Number.isFinite(days) || days <= 0) return 0;
		const cutoff = Date.now() - days * DAY_MS;
		const old = await ctx.db
			.query("records")
			.withIndex("by_guest_and_kind", (q) =>
				q.eq("guest", false).eq("kind", "session"),
			)
			.order("asc")
			.take(PER_RUN);
		let deleted = 0;
		for (const doc of old) {
			if (doc._creationTime > cutoff) break;
			deleted += await deleteSession(ctx, doc);
		}
		return deleted;
	},
});
