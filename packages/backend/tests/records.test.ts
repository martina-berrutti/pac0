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
});
