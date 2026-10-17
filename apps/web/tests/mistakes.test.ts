import { describe, expect, test } from "vitest";

import type { Report } from "@/lib/contracts/report";
import { finishSession, sendTurn, startSession } from "@/server/consultation";
import { getMistakes, mergeMistakes } from "@/server/mistakes";
import type { Viewer } from "@/server/token";

import { lucia } from "./helpers";

function report(tags: { tag: string; critical?: boolean }[]): Report {
	return {
		mistakes: tags.map((t) => ({
			tag: t.tag,
			what: `error ${t.tag}`,
			why: "",
			nextTime: "",
			critical: t.critical ?? false,
			evidence: [],
		})),
	} as unknown as Report;
}

describe("perfil de errores", () => {
	test("suma una vez por consulta y ordena por lo más repetido", () => {
		let profile = mergeMistakes(
			[],
			report([{ tag: "alergias" }, { tag: "alergias" }, { tag: "fiebre" }]),
			1,
		);
		profile = mergeMistakes(profile, report([{ tag: "alergias" }]), 2);
		expect(profile.map((e) => [e.tag, e.count])).toEqual([
			["alergias", 2],
			["fiebre", 1],
		]);
		expect(profile[0]?.lastSeenAt).toBe(2);
	});

	test("un error crítico queda marcado aunque después no lo sea", () => {
		let profile = mergeMistakes(
			[],
			report([{ tag: "consentimiento", critical: true }]),
		);
		profile = mergeMistakes(profile, report([{ tag: "consentimiento" }]));
		expect(profile[0]?.critical).toBe(true);
	});

	test("cerrar consultas va armando el perfil del usuario, y solo el suyo", async () => {
		const ana: Viewer & { alias: string } = {
			uid: "gst_perfil_ana",
			alias: "Ana",
			careerYear: "3",
			guest: true,
			exp: Date.now() + 1e6,
		};
		for (let i = 0; i < 2; i++) {
			const id = await startSession(ana, lucia.id, "caso");
			await sendTurn(ana, id, "Hola");
			await finishSession(ana, id, "gripe", []);
		}
		const mine = await getMistakes(ana.uid);
		expect(mine.length).toBeGreaterThan(0);
		// Lo que faltó en las dos consultas aparece dos veces.
		expect(mine[0]?.count).toBe(2);
		expect(await getMistakes("gst_otra_persona")).toEqual([]);
	});
});
