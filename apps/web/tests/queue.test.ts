import { describe, expect, test } from "vitest";

import { createWriteQueue } from "@/lib/voice/queue";

const later = <T>(value: T, ms: number) =>
	new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("fila de escrituras de la voz", () => {
	test("respeta el orden aunque la primera tarde más", async () => {
		const q = createWriteQueue();
		const done: string[] = [];
		q.enqueue(() => later("estudiante", 30).then((v) => done.push(v)));
		q.enqueue(() => later("paciente", 1).then((v) => done.push(v)));
		await q.drain();
		expect(done).toEqual(["estudiante", "paciente"]);
	});

	test("una tarea que falla no frena a las siguientes", async () => {
		const q = createWriteQueue();
		const fallo = q.enqueue(() => Promise.reject(new Error("409")));
		const sigue = q.enqueue(() => Promise.resolve("ok"));
		await expect(fallo).rejects.toThrow("409");
		await expect(sigue).resolves.toBe("ok");
	});

	test("drain espera lo encolado al momento de llamarlo", async () => {
		const q = createWriteQueue();
		let saved = false;
		q.enqueue(() =>
			later(null, 20).then(() => {
				saved = true;
			}),
		);
		await q.drain();
		expect(saved).toBe(true);
	});
});
