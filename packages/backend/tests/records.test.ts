/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

test("los registros sin el secreto no se leen ni se escriben", async () => {
	vi.stubEnv("STORE_SECRET", "secreto-de-prueba");
	const t = convexTest(schema, modules);
	await expect(
		t.mutation(api.records.put, {
			secret: "otro",
			kind: "session",
			appId: "ses_1",
			data: {},
		}),
	).rejects.toThrow("No autorizado");
	await expect(
		t.query(api.records.get, { secret: "otro", kind: "session", appId: "x" }),
	).rejects.toThrow("No autorizado");
});

test("los registros de más de 48 horas se borran y los nuevos quedan", async () => {
	vi.stubEnv("STORE_SECRET", "secreto-de-prueba");
	vi.useFakeTimers();
	const t = convexTest(schema, modules);
	const secret = "secreto-de-prueba";
	vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
	await t.mutation(api.records.put, {
		secret,
		kind: "session",
		appId: "ses_viejo",
		ownerId: "usr_a",
		data: { id: "ses_viejo" },
	});
	vi.setSystemTime(new Date("2026-10-12T09:00:00Z"));
	await t.mutation(api.records.put, {
		secret,
		kind: "session",
		appId: "ses_nuevo",
		ownerId: "usr_b",
		data: { id: "ses_nuevo" },
	});
	vi.setSystemTime(new Date("2026-10-12T11:00:00Z"));
	expect(await t.mutation(internal.records.purgeExpired, {})).toBe(1);
	expect(
		await t.query(api.records.get, {
			secret,
			kind: "session",
			appId: "ses_viejo",
		}),
	).toBeNull();
	expect(
		await t.query(api.records.get, {
			secret,
			kind: "session",
			appId: "ses_nuevo",
		}),
	).toEqual({ id: "ses_nuevo" });
});
