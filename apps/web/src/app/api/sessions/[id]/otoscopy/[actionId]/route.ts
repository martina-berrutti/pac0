import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { finishOtoscopy } from "@/server/otoscopy";

const ms = z
	.number()
	.min(0)
	.max(8 * 60 * 1000);

const bodySchema = z.object({
	hand: z.enum(["derecha", "izquierda"]),
	prep: z
		.array(z.enum(["higiene", "inspeccion-externa", "verificar-luz"]))
		.max(3),
	speculum: z.enum(["pediatrico", "adulto"]).nullable(),
	traction: z.enum(["arriba-atras", "abajo-atras", "otra"]).nullable(),
	roughInsertions: z.number().int().min(0).max(1000),
	maxDepth: z.number().min(0).max(100),
	canalMs: ms,
	tympanumMs: ms,
});

// Termina la otoscopia con lo que hizo el estudiante; el servidor evalúa.
export async function PATCH(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/otoscopy/[actionId]">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id, actionId } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return finishOtoscopy(viewer, id, actionId, body);
	});
}
