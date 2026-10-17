import { z } from "zod";

import { toSummary } from "@/cases/schema";
import { GenerationError, generateCase } from "@/lib/patient/generator";
import { HttpError, requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { store } from "@/server/store";

const bodySchema = z.object({
	text: z.string().min(3).max(300),
	personalityKey: z.string().optional(),
});

// "Dame un paciente con algo de garganta, que sea ansioso".
export async function POST(req: Request) {
	return handle(async () => {
		const viewer = await requireViewer();
		const body = await readBody(req, bodySchema);
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
