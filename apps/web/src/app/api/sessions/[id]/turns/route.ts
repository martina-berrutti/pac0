import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { sendTurn } from "@/server/consultation";
import { handle, readBody } from "@/server/http";

const bodySchema = z.object({ text: z.string().min(1).max(1000) });

// Versión por texto de la consulta (respaldo de la voz).
export async function POST(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/turns">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return sendTurn(viewer, id, body.text);
	});
}
