import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { caseBank } from "@/cases";
import {
	HIDDEN_RATE,
	lightRate,
	OROPHARYNX_PHOTOS,
	type OropharynxPhoto,
	SCHEMATIC_SPOTS,
	spotFor,
	ZONE_LABELS,
} from "@/lib/exam/oropharynx";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const credits = readFileSync(
	fileURLToPath(new URL("../../../CREDITS.md", import.meta.url)),
	"utf8",
);

describe("abatelenguas", () => {
	test("sin abatelenguas, las amígdalas y la pared posterior cuentan la mitad", () => {
		for (const zone of ["amigdala-izq", "amigdala-der", "pared-posterior"]) {
			expect(lightRate(zone, false)).toBe(HIDDEN_RATE);
			expect(lightRate(zone, true)).toBe(1);
		}
	});

	test("el resto de las zonas no cambia", () => {
		for (const zone of ["uvula", "paladar", "lengua"]) {
			expect(lightRate(zone, false)).toBe(1);
			expect(lightRate(zone, true)).toBe(1);
		}
	});
});

describe("fotos de la orofaringe", () => {
	const photos = Object.entries(OROPHARYNX_PHOTOS);

	test.each(photos)("%s: el archivo existe y está en CREDITS.md", (_, p) => {
		expect(p.src.startsWith("/exam/")).toBe(true);
		expect(existsSync(`${publicDir}${p.src}`)).toBe(true);
		expect(credits).toContain(`apps/web/public${p.src}`);
		expect(p.credit.trim()).not.toBe("");
	});

	test.each(photos)("%s: zonas conocidas y dentro de la foto", (_, p) => {
		for (const [zone, spot] of Object.entries(p.spots)) {
			expect(ZONE_LABELS[zone], zone).toBeDefined();
			for (const v of [spot?.x, spot?.y]) {
				expect(v).toBeGreaterThanOrEqual(0);
				expect(v).toBeLessThanOrEqual(100);
			}
			expect(spot?.r).toBeGreaterThan(0);
		}
	});

	test("las zonas de los casos tienen lugar en el esquema", () => {
		for (const c of caseBank) {
			for (const zone of c.exam.orofaringe?.hotspots ?? []) {
				expect(SCHEMATIC_SPOTS[zone], `${c.id}: ${zone}`).toBeDefined();
			}
		}
	});

	test("sin foto, o sin la zona en la foto, se usa el esquema", () => {
		const photo: OropharynxPhoto = {
			src: "/exam/x.webp",
			alt: "",
			credit: "",
			spots: { uvula: { x: 1, y: 2, r: 3 } },
		};
		expect(spotFor("uvula", photo)).toEqual({ x: 1, y: 2, r: 3 });
		expect(spotFor("lengua", photo)).toEqual(SCHEMATIC_SPOTS.lengua);
		expect(spotFor("uvula", null)).toEqual(SCHEMATIC_SPOTS.uvula);
	});
});
