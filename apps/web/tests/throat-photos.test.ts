import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { caseBank } from "@/cases";
import { CLINICAL_TEMPLATES } from "@/cases/templates";
import { THROAT_PHOTOS } from "@/lib/exam/throat-photos";

const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));

// Garganta con apertura completa en los casos y en las plantillas del generador.
const throats = [
	...caseBank.map((c) => ({ id: c.id, zone: c.exam.orofaringe })),
	...CLINICAL_TEMPLATES.map((t) => ({ id: t.id, zone: t.exam.orofaringe })),
].filter((x) => x.zone !== undefined);

describe("fotos de garganta", () => {
	test("hay casos de garganta para revisar", () => {
		expect(throats.length).toBeGreaterThan(0);
	});

	test.each(throats)("$id: la apertura completa tiene foto", ({ zone }) => {
		const photo = zone && THROAT_PHOTOS[zone.variants.completa];
		expect(photo).toBeDefined();
		// Cada zona del caso está ubicada sobre la foto.
		for (const key of zone?.hotspots ?? []) {
			expect(photo?.spots[key], key).toBeDefined();
		}
	});

	test.each(Object.entries(THROAT_PHOTOS))(
		"%s: el archivo existe y las zonas caen dentro de la foto",
		(_key, photo) => {
			expect(existsSync(PUBLIC + photo.src)).toBe(true);
			for (const s of Object.values(photo.spots)) {
				expect(s.x).toBeGreaterThanOrEqual(0);
				expect(s.x).toBeLessThanOrEqual(100);
				expect(s.y).toBeGreaterThanOrEqual(0);
				expect(s.y).toBeLessThanOrEqual(100);
			}
		},
	);
});
