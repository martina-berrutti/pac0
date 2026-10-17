import { z } from "zod";

import { toSummary } from "@/cases/schema";
import { GenerationError, generateCase } from "@/lib/patient/generator";
import { HttpError, requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { limitByIp } from "@/server/rate-limit";
import { store } from "@/server/store";

const MAX_GENERATED_PER_USER = 15;

const bodySchema = z.object({
	text: z.string().min(3).max(300),
	personalityKey: z.string().optional(),
});

// "Dame un paciente con algo de garganta, que sea ansioso".
export async function POST(req: Request) {
	return handle(async () => {
		const viewer = await requireViewer();
		const body = await readBody(req, bodySchema);
		// Cada paciente usa la IA: tope por usuario y por día. Con "por día"
		// explícito: los de una cuenta de Google no se borran, y contándolos a
		// todos, la cuenta quedaba sin poder generar nunca más.
		const since = Date.now() - 24 * 60 * 60 * 1000;
		const own = (await store.listCases(viewer.uid)).filter(
			(c) => c.origin === "generado" && (c.createdAt ?? 0) >= since,
		);
		if (own.length >= MAX_GENERATED_PER_USER)
			throw new HttpError(
				429,
				"Ya pediste muchos pacientes. Usá uno de los que tenés.",
			);
		// También por IP: cada invitado nuevo traía otros 15 pedidos a la IA.
		await limitByIp("generate");
		try {
			const { clinicalCase, personalityKey } = await generateCase(body);
			await store.addGeneratedCase(viewer.uid, clinicalCase);
			return { case: toSummary(clinicalCase), personalityKey };
		} catch (error) {
			if (error instanceof GenerationError)
				throw new HttpError(422, error.message);
			throw error;
		}
	});
}
