import { z } from "zod";

import { requireProfile, requireViewer } from "@/server/auth";
import { startSession } from "@/server/consultation";
import { handle, readBody } from "@/server/http";
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
			sessionId: startSession(viewer, body.caseId, body.personalityKey),
		};
	});
}

// Historial propio.
export async function GET() {
	return handle(async () => {
		const viewer = await requireViewer();
		return {
			sessions: store.listSessions(viewer.uid).map((s) => ({
				id: s.id,
				caseId: s.caseId,
				status: s.status,
				startedAt: s.startedAt,
			})),
		};
	});
}
