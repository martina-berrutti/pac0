import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { recordVoiceUsage } from "@/server/voice";

const n = z.number().int().min(0).max(1_000_000);
const bodySchema = z.object({
	inputTokens: n,
	outputTokens: n,
	inputAudioTokens: n,
	outputAudioTokens: n,
	cachedTokens: n,
});

// Tokens de cada respuesta de la voz, para medir el costo por sesión.
export async function POST(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/usage">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		return {
			usage: recordVoiceUsage(viewer, id, await readBody(req, bodySchema)),
		};
	});
}
