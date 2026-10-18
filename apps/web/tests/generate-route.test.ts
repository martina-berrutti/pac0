import { describe, expect, test, vi } from "vitest";

const viewer = {
	uid: "gst_generar_1",
	alias: "Estudiante",
	careerYear: "3",
	guest: true,
	exp: Date.now() + 1e7,
};
vi.mock("@/server/auth", async (original) => ({
	...(await original<typeof import("@/server/auth")>()),
	requireViewer: async () => viewer,
}));

// El límite por IP lee los headers del pedido (no hay fuera de Next): se
// cuenta acá para ver que un pedido que no se entiende no lo gasta.
const ipHits = vi.fn(async () => {});
vi.mock("@/server/rate-limit", async (original) => ({
	...(await original<typeof import("@/server/rate-limit")>()),
	limitByIp: () => ipHits(),
}));

const { POST } = await import("@/app/api/cases/generate/route");

function ask(text: string) {
	return POST(
		new Request("http://localhost/api/cases/generate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text }),
		}),
	);
}

describe("generar pacientes", () => {
	test("los pedidos que no se entienden no gastan el cupo del día", async () => {
		for (let i = 0; i < 16; i++)
			expect((await ask("paciente con dolor de cabeza")).status).toBe(422);
		expect(ipHits).not.toHaveBeenCalled();
		expect((await ask("dame un paciente con dolor de oído")).status).toBe(200);
	});
});
