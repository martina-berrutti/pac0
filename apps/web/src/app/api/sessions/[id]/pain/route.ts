import { z } from "zod";

import { KNEE_SPOTS } from "@/cases/schema";
import { requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { locatePain } from "@/server/pain";

const bodySchema = z.object({
	side: z.enum(["derecha", "izquierda"]),
	spot: z.enum(KNEE_SPOTS),
});

// "¿Te duele acá?": la pista de la paciente para la zona tocada.
export async function POST(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/pain">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return locatePain(viewer, id, body.side, body.spot);
	});
}
