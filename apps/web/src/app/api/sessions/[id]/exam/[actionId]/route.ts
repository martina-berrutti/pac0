import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { saveExamTimes } from "@/server/consultation";
import { handle, readBody } from "@/server/http";

const bodySchema = z.object({
	hotspotTimesMs: z.record(z.string(), z.number()),
});

// La vista de examen manda cuánto tiempo estuvo la luz sobre cada zona.
export async function PATCH(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/exam/[actionId]">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id, actionId } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return { action: saveExamTimes(viewer, id, actionId, body.hotspotTimesMs) };
	});
}
