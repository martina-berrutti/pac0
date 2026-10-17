import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { markReading, placeCuff } from "@/server/vitals";

const mmHg = z.number().int().min(0).max(300);

const bodySchema = z.union([
	z.object({
		cuffSize: z.enum(["chico", "adecuado", "grande"]),
		overClothes: z.boolean(),
	}),
	z.object({ pas: mmHg, pad: mmHg }),
]);

// Coloca el manguito (devuelve qué marca el manómetro) o guarda PAS y PAD.
export async function PATCH(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/vitals/[vitalId]">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id, vitalId } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return "cuffSize" in body
			? placeCuff(viewer, id, vitalId, body.cuffSize, body.overClothes)
			: markReading(viewer, id, vitalId, body);
	});
}
