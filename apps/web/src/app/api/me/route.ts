import { z } from "zod";

import {
	CAREER_YEARS,
	getViewer,
	requireViewer,
	setViewer,
	validateAlias,
} from "@/server/auth";
import { handle, readBody } from "@/server/http";

// Perfil actual, o null sin sesión.
export async function GET() {
	return handle(async () => {
		const viewer = await getViewer();
		if (!viewer) return { viewer: null };
		return {
			viewer: {
				alias: viewer.alias,
				careerYear: viewer.careerYear,
				guest: viewer.guest,
			},
		};
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
		await setViewer(next);
		return {
			viewer: {
				alias: next.alias,
				careerYear: next.careerYear,
				guest: next.guest,
			},
		};
	});
}
