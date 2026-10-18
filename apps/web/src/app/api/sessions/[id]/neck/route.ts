import { requireViewer } from "@/server/auth";
import { handle } from "@/server/http";
import { palpateNeck } from "@/server/neck";

// Palpa los ganglios del cuello: registra el examen y devuelve el hallazgo.
export async function POST(
	_req: Request,
	ctx: RouteContext<"/api/sessions/[id]/neck">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		return palpateNeck(viewer, id);
	});
}
