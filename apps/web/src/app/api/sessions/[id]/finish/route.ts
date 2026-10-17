import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { finishSession } from "@/server/consultation";
import { handle, readBody } from "@/server/http";

const bodySchema = z.object({
	hypothesis: z.string().min(1).max(500),
	differentials: z.array(z.string().max(100)).max(10).default([]),
});

// Cierra la consulta con hipótesis y diferenciales, y genera el informe.
export async function POST(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/finish">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return {
			report: finishSession(viewer, id, body.hypothesis, body.differentials),
		};
	});
}
