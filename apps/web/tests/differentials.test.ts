// Los diferenciales que escribe al cerrar: cómo se separan y qué se avisa.
import { describe, expect, test } from "vitest";

import {
	differentialsNotice,
	MAX_DIFFERENTIALS,
	prepareDifferentials,
	splitDifferentials,
} from "@/lib/consulta/differentials";

describe("diagnósticos diferenciales del cierre", () => {
	test("se separan por coma, punto y coma, renglón, «y» u «o»", () => {
		expect(
			splitDifferentials(
				"gripe, rinitis alérgica; mononucleosis\nfaringitis estreptocócica y sinusitis o reflujo.",
			),
		).toEqual([
			"gripe",
			"rinitis alérgica",
			"mononucleosis",
			"faringitis estreptocócica",
			"sinusitis",
			"reflujo",
		]);
		// Una palabra que empieza con «y» u «o» no se corta.
		expect(splitDifferentials("otitis media, yodo")).toEqual([
			"otitis media",
			"yodo",
		]);
		expect(splitDifferentials(" , ;  ")).toEqual([]);
	});

	test("hasta 10 y de hasta 100 caracteres, con aviso de lo que no entra", () => {
		const many = Array.from({ length: 12 }, (_, i) => `dx${i + 1}`).join(", ");
		const r = prepareDifferentials(many);
		expect(r.list).toHaveLength(MAX_DIFFERENTIALS);
		expect(r.dropped).toBe(2);
		expect(differentialsNotice(many)).toContain("los últimos 2 no entran");

		const long = `gripe, ${"a".repeat(120)}`;
		expect(prepareDifferentials(long).list[1]).toHaveLength(100);
		expect(differentialsNotice(long)).toContain("Uno es muy largo");

		expect(differentialsNotice("gripe, mononucleosis")).toBe("");
	});
});
