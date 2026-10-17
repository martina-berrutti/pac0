import { z } from "zod";

import {
	CAREER_YEARS,
	getViewer,
	requireViewer,
	roleOf,
	setViewer,
	validateAlias,
} from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { store } from "@/server/store";
import type { Viewer } from "@/server/token";

// Lo que ve la pantalla. El id de cuenta sirve para pedir el rol de docente
// (DOCENTES); es un hash, no el correo. El invitado no tiene.
function publicViewer(viewer: Viewer) {
	return {
		alias: viewer.alias,
		careerYear: viewer.careerYear,
		guest: viewer.guest,
		role: roleOf(viewer),
		accountId: viewer.guest ? null : viewer.uid,
	};
}

// Perfil actual, o null sin sesión.
export async function GET() {
	return handle(async () => {
		const viewer = await getViewer();
		if (!viewer) return { viewer: null };
		return { viewer: publicViewer(viewer) };
	});
}

const profileSchema = z.object({
	alias: z.string(),
	careerYear: z.enum(CAREER_YEARS),
});

// Alias y año de carrera. Nada más personal.
export async function PATCH(req: Request) {
	return handle(async () => {
		const viewer = await requireViewer();
		const body = await readBody(req, profileSchema);
		const next = {
			...viewer,
			alias: validateAlias(body.alias),
			careerYear: body.careerYear,
		};
		// Las cuentas de Google guardan el perfil para el próximo ingreso; el
		// invitado lo tiene solo en su cookie.
		if (!next.guest) {
			await store.saveProfile(next.uid, {
				alias: next.alias,
				careerYear: next.careerYear,
			});
		}
		await setViewer(next);
		return { viewer: publicViewer(next) };
	});
}
