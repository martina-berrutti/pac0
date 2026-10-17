import { requireViewer } from "@/server/auth";
import { handle } from "@/server/http";
import { startMeasurement } from "@/server/vitals";

// Abre el tensiómetro: evalúa la preparación y devuelve el perímetro del brazo.
export async function POST(
	_req: Request,
	ctx: RouteContext<"/api/sessions/[id]/vitals">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		return startMeasurement(viewer, id);
	});
}
