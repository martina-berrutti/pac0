import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { createRealtimeSession } from "@/server/voice";

const bodySchema = z.object({ sessionId: z.string() });

// Clave efímera para la voz. La clave real nunca sale del servidor.
export async function POST(req: Request) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { sessionId } = await readBody(req, bodySchema);
		return createRealtimeSession(viewer, sessionId);
	});
}
