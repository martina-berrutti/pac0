import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { recordVoiceTurn } from "@/server/voice";

const bodySchema = z.object({
	speaker: z.enum(["estudiante", "paciente"]),
	text: z.string().min(1).max(2000),
	overlap: z.boolean().default(false),
});

// Transcripción de un turno de voz. Se guarda el texto, nunca el audio.
export async function POST(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/voice-turns">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return recordVoiceTurn(viewer, id, body.speaker, body.text, body.overlap);
	});
}
