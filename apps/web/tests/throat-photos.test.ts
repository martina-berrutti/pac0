import { describe, expect, test } from "vitest";

import { caseBank } from "@/cases";
import { CLINICAL_TEMPLATES } from "@/cases/templates";
import { OROPHARYNX_PHOTOS } from "@/lib/exam/oropharynx";

// Que el archivo exista, esté en CREDITS.md y sus zonas caigan dentro de la
// foto lo controla tests/oropharynx.test.ts. Acá: que ningún caso de
// garganta se quede sin foto.
const throats = [
	...caseBank.map((c) => ({ id: c.id, zone: c.exam.orofaringe })),
	...CLINICAL_TEMPLATES.map((t) => ({ id: t.id, zone: t.exam.orofaringe })),
].filter((x) => x.zone !== undefined);

describe("fotos de garganta de los casos", () => {
	test("hay casos de garganta para revisar", () => {
		expect(throats.length).toBeGreaterThan(0);
	});

	test.each(throats)("$id: la apertura completa tiene foto", ({ zone }) => {
		const photo = zone && OROPHARYNX_PHOTOS[zone.variants.completa];
		expect(photo).toBeDefined();
		// Cada zona del caso está ubicada sobre la foto.
		for (const key of zone?.hotspots ?? []) {
			expect(photo?.spots[key], key).toBeDefined();
		}
	});
});
