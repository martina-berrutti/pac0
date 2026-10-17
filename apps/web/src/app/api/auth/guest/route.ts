import { guestAlias, setViewer } from "@/server/auth";
import { handle } from "@/server/http";
import { limitByIp } from "@/server/rate-limit";
import { newId } from "@/server/store";

// Entrar como invitado: alias temporal, sin pedir nada (menos de 10 s).
export async function POST() {
	return handle(async () => {
		await limitByIp("guests");
		const viewer = {
			uid: newId("gst"),
			alias: guestAlias(),
			careerYear: null,
			guest: true,
		};
		await setViewer(viewer);
		return { alias: viewer.alias };
	});
}
