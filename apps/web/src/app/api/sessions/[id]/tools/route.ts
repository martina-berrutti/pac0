import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { runTool } from "@/server/voice";

const bodySchema = z.object({ name: z.string(), arguments: z.unknown() });

// El navegador reenvía acá cada llamada a herramienta del modelo de voz.
export async function POST(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/tools">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return runTool(viewer, id, body.name, body.arguments);
	});
}
