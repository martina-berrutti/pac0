// "¿Te duele acá?" (rodilla): el estudiante toca una zona y la paciente
// contesta con una pista. La zona correcta es el diagnóstico (menisco,
// cruzado, colateral), así que se compara acá y no en el navegador.
import "server-only";

import type { PainZone } from "@/cases/schema";
import { painHint } from "@/lib/exam/pain-zones";

import { HttpError } from "./auth";
import { activeSession } from "./consultation";
import type { Viewer } from "./token";

export async function locatePain(
	viewer: Viewer,
	sessionId: string,
	side: PainZone["side"],
	spot: PainZone["spot"],
): Promise<{ hint: string; found: boolean }> {
	const { clinicalCase } = await activeSession(viewer, sessionId);
	const zone = clinicalCase.painZone;
	if (!zone) throw new HttpError(404, "Este caso no tiene zona de dolor");
	return {
		hint: painHint(zone, side, spot),
		found: side === zone.side && spot === zone.spot,
	};
}
