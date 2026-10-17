/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const secret = "secreto-de-prueba";

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

describe("records (almacenamiento de la app web)", () => {
	test("sin STORE_SECRET correcto no se lee ni se escribe", async () => {
		vi.stubEnv("STORE_SECRET", secret);
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(api.records.put, {
				secret: "otro",
				kind: "session",
				appId: "s1",
				data: {},
			}),
		).rejects.toThrow("No autorizado");
		await expect(
			t.query(api.records.get, {
				secret: "otro",
				kind: "session",
				appId: "s1",
			}),
		).rejects.toThrow("No autorizado");
	});

	test("guarda, reemplaza y lista por sesión y por dueño", async () => {
		vi.stubEnv("STORE_SECRET", secret);
		const t = convexTest(schema, modules);
		await t.mutation(api.records.put, {
			secret,
			kind: "session",
			appId: "s1",
			ownerId: "gst_a",
			guest: true,
			data: { v: 1 },
		});
		await t.mutation(api.records.put, {
			secret,
			kind: "session",
			appId: "s1",
			ownerId: "gst_a",
			guest: true,
			data: { v: 2 },
		});
		await t.mutation(api.records.put, {
			secret,
			kind: "turn",
			appId: "t1",
			sessionId: "s1",
			data: { n: 1 },
		});
		await t.mutation(api.records.put, {
			secret,
			kind: "turn",
			appId: "t2",
			sessionId: "s1",
			data: { n: 2 },
		});
		expect(
			await t.query(api.records.get, { secret, kind: "session", appId: "s1" }),
		).toEqual({ v: 2 });
		expect(
			await t.query(api.records.listBySession, {
				secret,
				kind: "turn",
				sessionId: "s1",
			}),
		).toEqual([{ n: 1 }, { n: 2 }]);
		expect(
			await t.query(api.records.listByOwner, {
				secret,
				kind: "session",
				ownerId: "gst_a",
			}),
		).toEqual([{ v: 2 }]);
	});

	test("a las 24 horas se borra lo de los invitados, no lo de otros usuarios", async () => {
		vi.stubEnv("STORE_SECRET", secret);
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const put = (args: Record<string, unknown>) =>
			t.mutation(api.records.put, { secret, data: {}, ...args } as never);
		await put({
			kind: "session",
			appId: "vieja",
			ownerId: "gst_a",
			guest: true,
		});
		await put({ kind: "turn", appId: "t1", sessionId: "vieja" });
		await put({ kind: "report", appId: "vieja", sessionId: "vieja" });
		await put({ kind: "case", appId: "gen-1", ownerId: "gst_a", guest: true });
		await put({ kind: "session", appId: "google", ownerId: "ggl_b" });

		vi.advanceTimersByTime(25 * 60 * 60 * 1000);
		await put({
			kind: "session",
			appId: "nueva",
			ownerId: "gst_c",
			guest: true,
		});

		expect(await t.mutation(internal.records.purgeExpiredGuests, {})).toBe(4);
		const get = (kind: string, appId: string) =>
			t.query(api.records.get, { secret, kind, appId } as never);
		expect(await get("session", "vieja")).toBeNull();
		expect(await get("turn", "t1")).toBeNull();
		expect(await get("case", "gen-1")).toBeNull();
		expect(await get("session", "google")).not.toBeNull();
		expect(await get("session", "nueva")).not.toBeNull();
	});

	test("retención: sin TRANSCRIPT_RETENTION_DAYS no se borra nada; con la variable, solo lo vencido de las cuentas", async () => {
		vi.stubEnv("STORE_SECRET", secret);
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const put = (args: Record<string, unknown>) =>
			t.mutation(api.records.put, { secret, data: {}, ...args } as never);
		await put({
			kind: "session",
			appId: "vieja",
			ownerId: "ggl_a",
			guest: false,
		});
		await put({ kind: "turn", appId: "t1", sessionId: "vieja" });
		await put({ kind: "user", appId: "ggl_a", ownerId: "ggl_a", guest: false });

		vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);
		await put({
			kind: "session",
			appId: "nueva",
			ownerId: "ggl_a",
			guest: false,
		});

		expect(await t.mutation(internal.records.purgeOldSessions, {})).toBe(0);
		vi.stubEnv("TRANSCRIPT_RETENTION_DAYS", "30");
		expect(await t.mutation(internal.records.purgeOldSessions, {})).toBe(2);
		const get = (kind: string, appId: string) =>
			t.query(api.records.get, { secret, kind, appId } as never);
		expect(await get("session", "vieja")).toBeNull();
		expect(await get("turn", "t1")).toBeNull();
		expect(await get("session", "nueva")).not.toBeNull();
		// El perfil no es una transcripción: se queda.
		expect(await get("user", "ggl_a")).not.toBeNull();
	});

	test("lista las últimas sesiones y cuenta las del día", async () => {
		vi.stubEnv("STORE_SECRET", secret);
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const put = (appId: string, guest: boolean) =>
			t.mutation(api.records.put, {
				secret,
				kind: "session",
				appId,
				ownerId: guest ? "gst_a" : "ggl_b",
				guest,
				data: { id: appId },
			});
		await put("ayer", true);
		vi.advanceTimersByTime(25 * 60 * 60 * 1000);
		const since = Date.now();
		await put("hoy-1", false);
		vi.advanceTimersByTime(1000);
		await put("hoy-2", true);

		expect(
			await t.query(api.records.countSessionsSince, {
				secret,
				since,
				max: 100,
			}),
		).toBe(2);
		expect(
			await t.query(api.records.listRecentSessions, { secret, limit: 2 }),
		).toEqual([{ id: "hoy-2" }, { id: "hoy-1" }]);
		await expect(
			t.query(api.records.listRecentSessions, { secret: "otro", limit: 2 }),
		).rejects.toThrow("No autorizado");
	});
});

describe("changeSession (cambios atómicos)", () => {
	test("suma deltas, reserva voz, respeta ifStatus y exige el secreto", async () => {
		vi.stubEnv("STORE_SECRET", secret);
		const t = convexTest(schema, modules);
		await t.mutation(api.records.put, {
			secret,
			kind: "session",
			appId: "s1",
			ownerId: "gst_a",
			data: { status: "activa", state: { confianza: 0.5 }, inventedFacts: {} },
		});
		const change = (c: Record<string, unknown>, s = secret) =>
			t.mutation(api.records.changeSession, {
				secret: s,
				appId: "s1",
				change: c,
			});
		await Promise.all([
			change({ stateDelta: { confianza: 0.2 } }),
			change({ stateDelta: { confianza: 0.2 }, incVoiceStarts: true }),
		]);
		const after = (await change({ facts: { a: "1" } })) as {
			state: { confianza: number };
			voiceStarts: number;
			inventedFacts: Record<string, string>;
		};
		expect(after.state.confianza).toBeCloseTo(0.9, 5);
		expect(after.voiceStarts).toBe(1);
		expect(after.inventedFacts).toEqual({ a: "1" });
		expect(
			await change({ ifStatus: "evaluada", set: { status: "x" } }),
		).toBeNull();
		await expect(change({}, "otro")).rejects.toThrow("No autorizado");
	});

	test("hitRate: cuenta por clave, frena en el tope y se reinicia con la ventana", async () => {
		vi.stubEnv("STORE_SECRET", secret);
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const hit = (key: string, s = secret) =>
			t.mutation(api.records.hitRate, {
				secret: s,
				key,
				windowMs: 1000,
				max: 2,
			});
		expect(await hit("a")).toBe(true);
		expect(await hit("a")).toBe(true);
		expect(await hit("a")).toBe(false);
		expect(await hit("b")).toBe(true);
		vi.advanceTimersByTime(1000);
		expect(await hit("a")).toBe(true);
		await expect(hit("a", "otro")).rejects.toThrow("No autorizado");
	});
});
