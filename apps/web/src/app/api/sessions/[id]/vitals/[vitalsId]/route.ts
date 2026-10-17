import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { saveMarkedVitals } from "@/server/consultation";
import { handle, readBody } from "@/server/http";

const mmHg = z.number().int().min(20).max(300);
const bodySchema = z.object({ marked: z.object({ pas: mmHg, pad: mmHg }) });

// El tensiómetro (Persona 2) guarda la PAS y la PAD que marcó el estudiante.
export async function PATCH(
	req: Request,
	ctx: RouteContext<"/api/sessions/[id]/vitals/[vitalsId]">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id, vitalsId } = await ctx.params;
		const body = await readBody(req, bodySchema);
		return {
			vitals: await saveMarkedVitals(viewer, id, vitalsId, body.marked),
		};
	});
}
