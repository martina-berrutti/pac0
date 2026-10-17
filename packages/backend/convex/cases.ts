import { v } from "convex/values";

import { internalQuery, query } from "./_generated/server";
import { requireUser } from "./lib/access";

// Lo que el navegador puede ver de un caso para elegirlo. Nunca truth,
// hiddenHistory, hallazgos esperados ni la lista de cotejo.
export const list = query({
	args: {},
	handler: async (ctx) => {
		await requireUser(ctx);
		const cases = await ctx.db.query("cases").take(50);
		return cases
			.filter((c) => c.published)
			.map((c) => ({
				_id: c._id,
				slug: c.slug,
				title: c.title,
				patient: { name: c.patient.name, age: c.patient.age },
				chiefComplaint: c.chiefComplaint,
			}));
	},
});

// Caso completo, con la verdad. Solo para funciones internas del servidor
// (prompt del paciente sin el diagnóstico, evaluador).
export const getFull = internalQuery({
	args: { caseId: v.id("cases") },
	handler: async (ctx, { caseId }) => {
		return await ctx.db.get(caseId);
	},
});
