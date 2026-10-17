import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { startOtoscopy } from "@/server/otoscopy";

const bodySchema = z.object({ ear: z.enum(["derecho", "izquierdo"]) });

// Abre el otoscopio en un oído: devuelve qué se ve en ese oído.
export async function POST(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/otoscopy">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return startOtoscopy(viewer, id, body.ear);
	});
}
