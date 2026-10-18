import { describe, expect, test, vi } from "vitest";

import { createPendingCloses } from "@/lib/consulta/pending-closes";

describe("cierres de examen antes del informe", () => {
	test("el informe espera a que el examen termine de guardar", async () => {
		const closes = createPendingCloses();
		expect(closes.request()).toBe(true);
		let settled = false;
		const wait = closes.settled().then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		closes.closed();
		await wait;
		expect(settled).toBe(true);
	});

	test("un segundo pedido con uno en curso no arranca otro", () => {
		const closes = createPendingCloses();
		expect(closes.request()).toBe(true);
		expect(closes.request()).toBe(false);
		closes.closed();
		expect(closes.request()).toBe(true);
	});

	test("un guardado que no vuelve no traba el informe", async () => {
		vi.useFakeTimers();
		try {
			const closes = createPendingCloses(1000);
			closes.request();
			const wait = closes.settled();
			vi.advanceTimersByTime(1000);
			await expect(wait).resolves.toBeUndefined();
			// Y después se puede pedir otro cierre.
			expect(closes.request()).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	test("sin cierres pendientes, el informe sale enseguida", async () => {
		await expect(createPendingCloses().settled()).resolves.toBeUndefined();
	});
});
