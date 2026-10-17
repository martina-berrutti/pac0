import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireOwnSession, requireProfile, requireUser } from "./lib/access";
import type { Personality } from "./validators";

// Empieza un intento. Por ahora usa la personalidad propia del caso; los
// arquetipos (ansioso, hostil, mayor) se suman después.
export const start = mutation({
	args: { caseId: v.id("cases") },
	handler: async (ctx, { caseId }) => {
		const user = await requireProfile(ctx);
		const clinicalCase = await ctx.db.get(caseId);
		if (clinicalCase === null || !clinicalCase.published) {
			throw new ConvexError("Caso no encontrado");
		}
		return await ctx.db.insert("sessions", {
			userId: user._id,
			caseId,
			alias: user.alias,
			personalityKey: "caso",
			personality: clinicalCase.personality,
			patientState: initialState(clinicalCase.personality),
			status: "activa",
			startedAt: Date.now(),
		});
	},
});

export const listMine = query({
	args: {},
	handler: async (ctx) => {
		const user = await requireUser(ctx);
		return await ctx.db
			.query("sessions")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.order("desc")
			.take(50);
	},
});

export const get = query({
	args: { sessionId: v.id("sessions") },
	handler: async (ctx, { sessionId }) => {
		const { session } = await requireOwnSession(ctx, sessionId);
		return session;
	},
});

function initialState(p: Personality) {
	return {
		confianza: 1 - p.desconfianza,
		ansiedad: p.ansiedad,
		dolor: 0.5,
		paciencia: p.paciencia,
	};
}
