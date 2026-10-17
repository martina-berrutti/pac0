import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { recordVoiceEvent, VOICE_EVENTS } from "@/server/voice";

const bodySchema = z.object({
	type: z.enum(VOICE_EVENTS),
	durationMs: z.number().int().min(0).max(600_000).optional(),
});

// Interrupciones y silencios que detecta el navegador durante la voz.
export async function POST(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/events">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		const body = await readBody(req, bodySchema);
		await recordVoiceEvent(viewer, id, body.type, body.durationMs);
	});
}
