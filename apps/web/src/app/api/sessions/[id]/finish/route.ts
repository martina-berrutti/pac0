import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { finishSession } from "@/server/consultation";
import { handle, readBody } from "@/server/http";

const bodySchema = z.object({
	hypothesis: z.string().trim().min(1, "Escribí tu hipótesis").max(500),
	differentials: z
		.array(z.string().trim().max(100))
		.max(10)
		.default([])
		.transform((list) => list.filter(Boolean)),
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
			report: await finishSession(
				viewer,
				id,
				body.hypothesis,
				body.differentials,
			),
		};
	});
}
