import { z } from "zod";

import { requireProfile, requireViewer } from "@/server/auth";
import { startSession } from "@/server/consultation";
import { handle, readBody } from "@/server/http";
import { limitByIp } from "@/server/rate-limit";
import { store } from "@/server/store";

const bodySchema = z.object({
	caseId: z.string(),
	personalityKey: z.string().default("caso"),
});

export async function POST(req: Request) {
	return handle(async () => {
		const viewer = await requireProfile();
		const body = await readBody(req, bodySchema);
		return {
			sessionId: await startSession(
				viewer,
				body.caseId,
				body.personalityKey,
				// El cupo por IP se cuenta solo si la consulta se va a crear.
				() => limitByIp("sessions"),
			),
		};
	});
}

// Historial propio.
export async function GET() {
	return handle(async () => {
		const viewer = await requireViewer();
		return {
			sessions: (await store.listSessions(viewer.uid)).map((s) => ({
				id: s.id,
				caseId: s.caseId,
				status: s.status,
				startedAt: s.startedAt,
			})),
		};
	});
}
