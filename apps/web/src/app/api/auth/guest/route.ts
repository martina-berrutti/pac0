import { guestAlias, setViewer } from "@/server/auth";
import { handle } from "@/server/http";
import { newId } from "@/server/store";

// Entrar como invitado: alias temporal, sin pedir nada (menos de 10 s).
export async function POST() {
	return handle(async () => {
		const viewer = {
			uid: newId("usr"),
			alias: guestAlias(),
			careerYear: null,
			guest: true,
		};
		await setViewer(viewer);
		return { alias: viewer.alias };
	});
}
