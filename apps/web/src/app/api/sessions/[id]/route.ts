import { requireViewer } from "@/server/auth";
import { getSessionView } from "@/server/consultation";
import { handle } from "@/server/http";

export async function GET(
	_req: Request,
	ctx: RouteContext<"/api/sessions/[id]">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		return getSessionView(viewer, id);
	});
}
