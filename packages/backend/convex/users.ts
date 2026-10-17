import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	type MutationCtx,
	mutation,
	query,
} from "./_generated/server";
import { requireUser } from "./lib/access";
import { careerYear } from "./validators";

// Perfil del usuario actual, o null si no hay sesión.
export const viewer = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) {
			return null;
		}
		const user = await ctx.db.get(userId);
		if (user === null) {
			return null;
		}
		return {
			_id: user._id,
			alias: user.alias ?? null,
			careerYear: user.careerYear ?? null,
			role: user.role,
			isAnonymous: user.isAnonymous === true,
		};
	},
});

// Primer ingreso: alias y año de carrera. Nada más personal.
export const completeProfile = mutation({
	args: { alias: v.string(), careerYear },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await ctx.db.patch(user._id, {
			alias: validateAlias(args.alias),
			careerYear: args.careerYear,
		});
	},
});

export function validateAlias(raw: string) {
	const alias = raw.trim().replace(/\s+/g, " ");
	if (alias.length < 2 || alias.length > 24) {
		throw new ConvexError("El alias tiene que tener entre 2 y 24 caracteres");
	}
	if (!/^[\p{L}\p{N} _.-]+$/u.test(alias)) {
		throw new ConvexError(
			"El alias solo puede tener letras, números, espacios, puntos, guiones y guiones bajos",
		);
	}
	// Seis o más dígitos seguidos parecen una cédula o un teléfono.
	if (/\d{6,}/.test(alias.replace(/[ _.-]/g, ""))) {
		throw new ConvexError(
			"No uses números de cédula ni de teléfono en el alias",
		);
	}
	return alias;
}

const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
const GUESTS_PER_RUN = 25;

// Borra a los invitados de más de 24 horas y todo lo que cuelga de ellos
// (plan.md, sección 10). Lo corre crons.ts.
export const purgeExpiredGuests = internalMutation({
	args: {},
	handler: async (ctx) => {
		const guests = await ctx.db
			.query("users")
			.withIndex("by_isAnonymous_and_createdAt", (q) =>
				q.eq("isAnonymous", true).lt("createdAt", Date.now() - GUEST_TTL_MS),
			)
			.take(GUESTS_PER_RUN);
		for (const guest of guests) {
			await deleteUserData(ctx, guest._id);
		}
		return guests.length;
	},
});

async function deleteUserData(ctx: MutationCtx, userId: Id<"users">) {
	const sessions = await ctx.db
		.query("sessions")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();
	for (const session of sessions) {
		const sessionId = session._id;
		const children = [
			...(await ctx.db
				.query("turns")
				.withIndex("by_sessionId_and_startMs", (q) =>
					q.eq("sessionId", sessionId),
				)
				.collect()),
			...(await ctx.db
				.query("examActions")
				.withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
				.collect()),
			...(await ctx.db
				.query("vitals")
				.withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
				.collect()),
			...(await ctx.db
				.query("events")
				.withIndex("by_sessionId_and_atMs", (q) => q.eq("sessionId", sessionId))
				.collect()),
		];
		for (const child of children) {
			await ctx.db.delete(child._id);
		}
		await ctx.db.delete(sessionId);
	}

	const owned = [
		...(await ctx.db
			.query("reports")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect()),
		...(await ctx.db
			.query("mistakeProfile")
			.withIndex("by_userId_and_tag", (q) => q.eq("userId", userId))
			.collect()),
		...(await ctx.db
			.query("authAccounts")
			.withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
			.collect()),
	];
	for (const doc of owned) {
		await ctx.db.delete(doc._id);
	}

	const authSessions = await ctx.db
		.query("authSessions")
		.withIndex("userId", (q) => q.eq("userId", userId))
		.collect();
	for (const authSession of authSessions) {
		const tokens = await ctx.db
			.query("authRefreshTokens")
			.withIndex("sessionId", (q) => q.eq("sessionId", authSession._id))
			.collect();
		for (const token of tokens) {
			await ctx.db.delete(token._id);
		}
		await ctx.db.delete(authSession._id);
	}

	await ctx.db.delete(userId);
}
