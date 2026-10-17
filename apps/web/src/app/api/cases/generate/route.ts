import { z } from "zod";

import { toSummary } from "@/cases/schema";
import { GenerationError, generateCase } from "@/lib/patient/generator";
import { HttpError, requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
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
		// Cada paciente usa la IA: tope por usuario (los de invitados se borran
		// a las 24 horas, así que en la práctica es por día).
		const own = (await store.listCases(viewer.uid)).filter(
			(c) => c.origin === "generado",
		);
		if (own.length >= MAX_GENERATED_PER_USER)
			throw new HttpError(
				429,
				"Ya pediste muchos pacientes. Usá uno de los que tenés.",
			);
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
