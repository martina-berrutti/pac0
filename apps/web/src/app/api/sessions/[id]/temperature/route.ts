import { requireViewer } from "@/server/auth";
import { handle } from "@/server/http";
import { takeTemperature } from "@/server/temperature";

// Toma la temperatura axilar: registra el examen y devuelve los grados.
export async function POST(
	_req: Request,
	ctx: RouteContext<"/api/sessions/[id]/temperature">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		return takeTemperature(viewer, id);
	});
}
