import { requireViewer } from "@/server/auth";
import { getReport } from "@/server/consultation";
import { handle } from "@/server/http";

// Un informe solo lo leen su dueño y los docentes autorizados.
export async function GET(
	_req: Request,
	ctx: RouteContext<"/api/sessions/[id]/report">,
) {
	return handle(async () => {
		const viewer = await requireViewer();
		const { id } = await ctx.params;
		return { report: await getReport(viewer, id) };
	});
}
