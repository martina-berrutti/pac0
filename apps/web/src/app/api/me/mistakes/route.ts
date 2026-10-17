import { requireViewer } from "@/server/auth";
import { handle } from "@/server/http";
import { getMistakes } from "@/server/mistakes";

// Perfil de errores del usuario: lo que más se repite primero.
export async function GET() {
	return handle(async () => {
		const viewer = await requireViewer();
		return { mistakes: await getMistakes(viewer.uid) };
	});
}
