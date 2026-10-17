/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { canReadReport } from "../convex/lib/access";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

// Caso de prueba con datos inventados.
const testCase = {
	slug: "prueba-01",
	title: "Dolor de garganta",
	patient: { name: "Paciente de prueba", age: 30, occupation: "ficticia" },
	personality: {
		cooperacion: 0.9,
		ansiedad: 0.3,
		locuacidad: 0.6,
		desconfianza: 0.1,
		paciencia: 0.7,
		audicion: "normal" as const,
	},
	chiefComplaint: "Me duele la garganta",
	profile: { vive: "sola" },
	hiddenHistory: { fiebre: "sí" },
	vitals: { pa: [110, 70], fc: 80, fr: 16, tax: 37 },
	exam: {},
	expectedChecklist: [],
	notApplicable: [],
	criticalErrors: [],
	truth: { diagnosis: "SECRETO", acceptable: [], differentials: [] },
	published: true,
};

async function setup() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const now = Date.now();
		const ana = await ctx.db.insert("users", {
			alias: "Ana",
			careerYear: "3",
			role: "estudiante",
			createdAt: now,
		});
		const beto = await ctx.db.insert("users", {
			alias: "Beto",
			careerYear: "2",
			role: "estudiante",
			createdAt: now,
		});
		const docente = await ctx.db.insert("users", {
			alias: "Profe",
			role: "docente",
			createdAt: now,
		});
		const sinAlias = await ctx.db.insert("users", {
			role: "estudiante",
			createdAt: now,
		});
		const caseId = await ctx.db.insert("cases", testCase);
		return { ana, beto, docente, sinAlias, caseId };
	});
	const as = (userId: Id<"users">) =>
		t.withIdentity({ subject: `${userId}|sesion-de-prueba` });
	return { t, ids, as };
}

describe("identidad", () => {
	test("sin sesión, viewer devuelve null y el resto falla", async () => {
		const { t, ids } = await setup();
		expect(await t.query(api.users.viewer, {})).toBeNull();
		await expect(t.query(api.cases.list, {})).rejects.toThrow("No autenticado");
		await expect(t.query(api.sessions.listMine, {})).rejects.toThrow(
			"No autenticado",
		);
		await expect(
			t.mutation(api.sessions.start, { caseId: ids.caseId }),
		).rejects.toThrow("No autenticado");
		await expect(
			t.mutation(api.users.completeProfile, { alias: "X1", careerYear: "1" }),
		).rejects.toThrow("No autenticado");
	});

	test("viewer devuelve solo alias, año, rol e invitado", async () => {
		const { ids, as } = await setup();
		const viewer = await as(ids.ana).query(api.users.viewer, {});
		expect(viewer).toEqual({
			_id: ids.ana,
			alias: "Ana",
			careerYear: "3",
			role: "estudiante",
			isAnonymous: false,
		});
	});
});

describe("sesiones", () => {
	test("una sesión solo la ve su dueño", async () => {
		const { ids, as } = await setup();
		const sessionId = await as(ids.ana).mutation(api.sessions.start, {
			caseId: ids.caseId,
		});
		const own = await as(ids.ana).query(api.sessions.get, { sessionId });
		expect(own.alias).toBe("Ana");
		await expect(
			as(ids.beto).query(api.sessions.get, { sessionId }),
		).rejects.toThrow("Sesión no encontrada");
		expect(await as(ids.beto).query(api.sessions.listMine, {})).toEqual([]);
		expect(await as(ids.ana).query(api.sessions.listMine, {})).toHaveLength(1);
	});

	test("hace falta un alias para empezar", async () => {
		const { ids, as } = await setup();
		await expect(
			as(ids.sinAlias).mutation(api.sessions.start, { caseId: ids.caseId }),
		).rejects.toThrow("Falta elegir un alias");
	});

	test("la sesión guarda el alias y nada más del estudiante", async () => {
		const { t, ids, as } = await setup();
		const sessionId = await as(ids.ana).mutation(api.sessions.start, {
			caseId: ids.caseId,
		});
		const session = await t.run((ctx) => ctx.db.get(sessionId));
		expect(session?.alias).toBe("Ana");
		expect(session).not.toHaveProperty("careerYear");
	});
});

describe("casos", () => {
	test("la lista no expone el diagnóstico ni la historia oculta", async () => {
		const { ids, as } = await setup();
		const cases = await as(ids.ana).query(api.cases.list, {});
		expect(cases).toHaveLength(1);
		const json = JSON.stringify(cases);
		expect(json).not.toContain("SECRETO");
		expect(json).not.toContain("hiddenHistory");
		expect(json).not.toContain("expectedChecklist");
	});
});

describe("informes", () => {
	test("lo leen su dueño y los docentes, nadie más", async () => {
		const { t, ids, as } = await setup();
		const sessionId = await as(ids.ana).mutation(api.sessions.start, {
			caseId: ids.caseId,
		});
		await t.run(async (ctx) => {
			const reportId = await ctx.db.insert("reports", {
				sessionId,
				userId: ids.ana,
				scores: { anamnesis: 0, examen: 0, razonamiento: 0, comunicacion: 0 },
				total: 0,
				verdict: "a_repasar",
				items: [],
				mistakes: [],
				summary: "",
				createdAt: Date.now(),
			});
			const report = await ctx.db.get(reportId);
			const [ana, beto, docente] = await Promise.all([
				ctx.db.get(ids.ana),
				ctx.db.get(ids.beto),
				ctx.db.get(ids.docente),
			]);
			if (!report || !ana || !beto || !docente) throw new Error("faltan datos");
			expect(canReadReport(ana, report)).toBe(true);
			expect(canReadReport(docente, report)).toBe(true);
			expect(canReadReport(beto, report)).toBe(false);
		});
	});
});

describe("perfil", () => {
	test("guarda alias y año de carrera", async () => {
		const { ids, as } = await setup();
		await as(ids.sinAlias).mutation(api.users.completeProfile, {
			alias: "  Doc   Martina ",
			careerYear: "internado",
		});
		const viewer = await as(ids.sinAlias).query(api.users.viewer, {});
		expect(viewer?.alias).toBe("Doc Martina");
		expect(viewer?.careerYear).toBe("internado");
	});

	test.each([
		["a", "entre 2 y 24"],
		["ana@correo.com", "solo puede tener"],
		["Juan 4.123.456-7", "cédula"],
		["099 123 456", "cédula"],
	])("rechaza el alias %s", async (alias, message) => {
		const { ids, as } = await setup();
		await expect(
			as(ids.ana).mutation(api.users.completeProfile, {
				alias,
				careerYear: "1",
			}),
		).rejects.toThrow(message);
	});
});

describe("invitados", () => {
	test("se borran a las 24 horas con todo lo suyo", async () => {
		const { t, ids, as } = await setup();
		const old = Date.now() - 25 * 60 * 60 * 1000;
		const { viejo, nuevo } = await t.run(async (ctx) => ({
			viejo: await ctx.db.insert("users", {
				isAnonymous: true,
				alias: "Invitado 1111",
				role: "estudiante",
				createdAt: old,
			}),
			nuevo: await ctx.db.insert("users", {
				isAnonymous: true,
				alias: "Invitado 2222",
				role: "estudiante",
				createdAt: Date.now(),
			}),
		}));
		const sessionId = await as(viejo).mutation(api.sessions.start, {
			caseId: ids.caseId,
		});
		await t.run(async (ctx) => {
			await ctx.db.insert("turns", {
				sessionId,
				speaker: "estudiante",
				text: "Hola",
				startMs: 0,
				endMs: 500,
				overlap: false,
			});
			await ctx.db.insert("mistakeProfile", {
				userId: viejo,
				tag: "alergias",
				count: 1,
				lastSeenAt: old,
			});
		});

		expect(await t.mutation(internal.users.purgeExpiredGuests, {})).toBe(1);

		await t.run(async (ctx) => {
			expect(await ctx.db.get(viejo)).toBeNull();
			expect(await ctx.db.get(sessionId)).toBeNull();
			expect(await ctx.db.query("turns").collect()).toEqual([]);
			expect(await ctx.db.query("mistakeProfile").collect()).toEqual([]);
			expect(await ctx.db.get(nuevo)).not.toBeNull();
			expect(await ctx.db.get(ids.ana)).not.toBeNull();
		});
	});
});
