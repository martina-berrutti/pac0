// Límite por IP para invitados y consultas.
import { afterEach, describe, expect, test, vi } from "vitest";

let ip = "203.0.113.1";
vi.mock("next/headers", () => ({
	headers: async () => new Headers({ "x-forwarded-for": `${ip}, 10.0.0.1` }),
}));

import { clientIp, limitByIp } from "@/server/rate-limit";
import { store } from "@/server/store";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("límite por IP", () => {
	test("usa la primera IP de x-forwarded-for", async () => {
		ip = "198.51.100.7";
		expect(await clientIp()).toBe("198.51.100.7");
	});

	test("frena al pasar el tope, por IP y por acción, y vuelve al pasar la hora", async () => {
		vi.useFakeTimers();
		vi.stubEnv("MAX_GUESTS_PER_IP_PER_HOUR", "2");
		ip = "203.0.113.10";
		await limitByIp("guests");
		await limitByIp("guests");
		await expect(limitByIp("guests")).rejects.toMatchObject({ status: 429 });
		// Otra acción y otra IP tienen su propio contador.
		await limitByIp("sessions");
		ip = "203.0.113.11";
		await limitByIp("guests");
		ip = "203.0.113.10";
		vi.advanceTimersByTime(60 * 60 * 1000);
		await limitByIp("guests");
	});

	test("la IP no se guarda en la clave", async () => {
		ip = "203.0.113.20";
		const spy = vi.spyOn(store, "hitRate");
		await limitByIp("sessions");
		expect(spy.mock.calls[0]?.[0]).not.toContain("203.0.113.20");
	});

	test("si el almacenamiento falla, deja pasar", async () => {
		vi.spyOn(store, "hitRate").mockRejectedValue(new Error("sin función"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(limitByIp("guests")).resolves.toBeUndefined();
	});
});
