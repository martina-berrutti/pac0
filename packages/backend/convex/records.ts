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
	v.literal("rate"),
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

// Cambio atómico sobre una sesión (apps/web/src/lib/contracts/session-change.ts:
// misma lógica, mantener las dos iguales). Al ser una mutación, dos pedidos
// simultáneos no se pisan. Devuelve la sesión nueva, o null si no existe o no
// se cumple ifStatus.
const MAX_INVENTED_FACTS = 40;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export const changeSession = mutation({
	args: { secret: v.string(), appId: v.string(), change: v.any() },
	handler: async (ctx, { secret, appId, change }) => {
		checkSecret(secret);
		const doc = await ctx.db
			.query("records")
			.withIndex("by_kind_and_appId", (q) =>
				q.eq("kind", "session").eq("appId", appId),
			)
			.unique();
		if (!doc) return null;
		const session = doc.data as Record<string, unknown> & {
			status: string;
			state: Record<string, number>;
			inventedFacts?: Record<string, string>;
			voiceUsage?: Record<string, number> | null;
			voiceStarts?: number;
		};
		if (change.ifStatus && session.status !== change.ifStatus) return null;
		// Igual que ifEquals en apps/web/src/lib/contracts/session-change.ts.
		for (const [k, v] of Object.entries(
			(change.ifEquals ?? {}) as Record<string, unknown>,
		))
			if ((session[k] ?? null) !== (v ?? null)) return null;
		const next = { ...session, ...(change.set ?? {}) };
		if (change.stateDelta) {
			const state = { ...next.state };
			for (const [k, d] of Object.entries(
				change.stateDelta as Record<string, number | undefined>,
			)) {
				if (d !== undefined) state[k] = clamp((state[k] ?? 0) + d);
			}
			next.state = state;
		}
		if (change.usageDelta) {
			const prev = next.voiceUsage ?? {
				responses: 0,
				inputTokens: 0,
				outputTokens: 0,
				inputAudioTokens: 0,
				outputAudioTokens: 0,
				cachedTokens: 0,
			};
			const u = change.usageDelta as Record<string, number>;
			next.voiceUsage = {
				responses: (prev.responses ?? 0) + 1,
				inputTokens: (prev.inputTokens ?? 0) + (u.inputTokens ?? 0),
				outputTokens: (prev.outputTokens ?? 0) + (u.outputTokens ?? 0),
				inputAudioTokens:
					(prev.inputAudioTokens ?? 0) + (u.inputAudioTokens ?? 0),
				outputAudioTokens:
					(prev.outputAudioTokens ?? 0) + (u.outputAudioTokens ?? 0),
				cachedTokens: (prev.cachedTokens ?? 0) + (u.cachedTokens ?? 0),
			};
		}
		if (change.facts) {
			const facts = { ...(next.inventedFacts ?? {}) };
			for (const [k, val] of Object.entries(
				change.facts as Record<string, string>,
			)) {
				if (k in facts || Object.keys(facts).length >= MAX_INVENTED_FACTS)
					continue;
				facts[k] = val;
			}
			next.inventedFacts = facts;
		}
		if (change.incVoiceStarts) next.voiceStarts = (next.voiceStarts ?? 0) + 1;
		await ctx.db.patch(doc._id, { data: next });
		return next;
	},
});

// Compara dos valores sin depender del orden de las claves.
function stable(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.keys(value as Record<string, unknown>)
			.sort()
			.map(
				(k) =>
					`${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`,
			)
			.join(",")}}`;
	return JSON.stringify(value ?? null);
}

// Actualiza campos de un registro (examen, presión) solo si los de ifEquals
// siguen valiendo eso (un campo que falta cuenta como null). Atómico: con dos
// pedidos a la vez, uno solo coloca el manguito o termina la otoscopia.
export const patchIf = mutation({
	args: {
		secret: v.string(),
		kind: recordKind,
		appId: v.string(),
		patch: v.any(),
		ifEquals: v.any(),
	},
	handler: async (ctx, { secret, kind, appId, patch, ifEquals }) => {
		checkSecret(secret);
		const doc = await ctx.db
			.query("records")
			.withIndex("by_kind_and_appId", (q) =>
				q.eq("kind", kind).eq("appId", appId),
			)
			.unique();
		if (!doc) return null;
		const data = doc.data as Record<string, unknown>;
		for (const [k, want] of Object.entries(
			(ifEquals ?? {}) as Record<string, unknown>,
		))
			if (stable(data[k]) !== stable(want)) return null;
		const next = { ...data, ...(patch as Record<string, unknown>) };
		await ctx.db.patch(doc._id, { data: next });
		return next;
	},
});

// Reemplaza un registro solo si sigue igual a `expected` (un registro que
// no existe cuenta como vacío: []). Para leer, combinar y escribir sin pisar a otro pedido (perfil de
// errores con dos consultas cerrándose a la vez).
export const replaceIf = mutation({
	args: {
		secret: v.string(),
		kind: recordKind,
		appId: v.string(),
		ownerId: v.optional(v.string()),
		expected: v.any(),
		data: v.any(),
	},
	handler: async (ctx, { secret, kind, appId, ownerId, expected, data }) => {
		checkSecret(secret);
		const doc = await ctx.db
			.query("records")
			.withIndex("by_kind_and_appId", (q) =>
				q.eq("kind", kind).eq("appId", appId),
			)
			.unique();
		if (stable(doc?.data ?? []) !== stable(expected ?? [])) return false;
		if (doc) await ctx.db.patch(doc._id, { data });
		else
			await ctx.db.insert("records", {
				kind,
				appId,
				ownerId,
				guest: ownerId?.startsWith("gst_") ?? undefined,
				data,
			});
		return true;
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

// Límite por IP (apps/web/src/server/rate-limit.ts): cuenta los pedidos de
// una clave en una ventana fija. Es una mutación, así dos pedidos a la vez no
// se pisan. Devuelve si el pedido entra. La clave es un hash: la IP nunca se
// guarda. Se borran con los invitados (guest: true), a las 24 horas.
export const hitRate = mutation({
	args: {
		secret: v.string(),
		key: v.string(),
		windowMs: v.number(),
		max: v.number(),
	},
	handler: async (ctx, { secret, key, windowMs, max }) => {
		checkSecret(secret);
		const now = Date.now();
		const doc = await ctx.db
			.query("records")
			.withIndex("by_kind_and_appId", (q) =>
				q.eq("kind", "rate").eq("appId", key),
			)
			.unique();
		const data = doc?.data as { start: number; count: number } | undefined;
		if (!doc || !data || now - data.start >= windowMs) {
			// Ventana nueva = documento nuevo: así su _creationTime es el inicio
			// de la ventana y la limpieza de 24 horas nunca borra una abierta
			// (con patch, la IP de la facultad perdía la cuenta a mitad de hora).
			if (doc) await ctx.db.delete(doc._id);
			await ctx.db.insert("records", {
				kind: "rate",
				appId: key,
				guest: true,
				data: { start: now, count: 1 },
			});
			return true;
		}
		if (data.count >= max) return false;
		await ctx.db.patch(doc._id, {
			data: { start: data.start, count: data.count + 1 },
		});
		return true;
	},
});

const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PER_RUN = 20;
// Presupuesto de borrados por corrida. Convex limita cuánto lee y escribe una
// mutación: si una corrida se pasara, fallaría entera y la siguiente volvería
// a tomar las mismas sesiones viejas, así que la limpieza quedaría trabada.
// Con presupuesto, una sesión larga se borra en varias corridas.
const DELETE_BUDGET = 1000;

// Borra una sesión con todo lo que cuelga de ella, sin pasar de `budget`
// borrados. Si no entra entera, borra lo que puede, deja la sesión y avisa
// con done = false (la próxima corrida sigue).
async function deleteSession(
	ctx: MutationCtx,
	doc: Doc<"records">,
	budget: number,
): Promise<{ deleted: number; done: boolean }> {
	let deleted = 0;
	for (const child of ["turn", "event", "exam", "vitals", "report"] as const) {
		const room = budget - deleted;
		if (room <= 0) return { deleted, done: false };
		const rows = await ctx.db
			.query("records")
			.withIndex("by_kind_and_sessionId", (q) =>
				q.eq("kind", child).eq("sessionId", doc.appId),
			)
			.take(room + 1);
		for (const row of rows.slice(0, room)) await ctx.db.delete(row._id);
		deleted += Math.min(rows.length, room);
		if (rows.length > room) return { deleted, done: false };
	}
	if (deleted >= budget) return { deleted, done: false };
	await ctx.db.delete(doc._id);
	return { deleted: deleted + 1, done: true };
}

// Los registros guardados antes de que existiera el campo `guest` no tienen
// valor, y sin él ni la limpieza ni las listas los ven. Se completa de a poco
// desde el dueño (los ids de invitado empiezan con gst_).
const BACKFILL_PER_RUN = 100;

async function backfillGuest(ctx: MutationCtx) {
	for (const kind of ["session", "case", "mistakes"] as const) {
		const rows = await ctx.db
			.query("records")
			.withIndex("by_guest_and_kind", (q) =>
				q.eq("guest", undefined).eq("kind", kind),
			)
			.take(BACKFILL_PER_RUN);
		for (const row of rows) {
			await ctx.db.patch(row._id, {
				guest: row.ownerId?.startsWith("gst_") ?? false,
			});
		}
	}
}

// Borra lo de los invitados de más de 24 horas (plan.md, sección 10): sus
// sesiones con todo lo que cuelga de ellas, sus casos generados y su perfil
// de errores; también los contadores del límite por IP.
export const purgeExpiredGuests = internalMutation({
	args: {},
	handler: async (ctx) => {
		await backfillGuest(ctx);
		const cutoff = Date.now() - GUEST_TTL_MS;
		let deleted = 0;
		for (const kind of ["session", "case", "mistakes", "rate"] as const) {
			// Por índice: solo invitados, del más viejo al más nuevo.
			const old = await ctx.db
				.query("records")
				.withIndex("by_guest_and_kind", (q) =>
					q.eq("guest", true).eq("kind", kind),
				)
				.order("asc")
				.take(PER_RUN);
			for (const doc of old) {
				if (doc._creationTime > cutoff || deleted >= DELETE_BUDGET) break;
				if (kind === "session") {
					const r = await deleteSession(ctx, doc, DELETE_BUDGET - deleted);
					deleted += r.deleted;
					if (!r.done) return deleted;
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
			if (doc._creationTime > cutoff || deleted >= DELETE_BUDGET) break;
			const r = await deleteSession(ctx, doc, DELETE_BUDGET - deleted);
			deleted += r.deleted;
			if (!r.done) break;
		}
		return deleted;
	},
});
