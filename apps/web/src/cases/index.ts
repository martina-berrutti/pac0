// Banco de casos: solo Lucía (garganta), con dos problemas. El avatar es una
// mujer joven: Diego (oído) salió del banco porque no hay avatar varón
// (Persona 3). Para sumar uno: crear el JSON y agregarlo a BANK. Cada caso
// valida contra caseSchema al cargar; si no valida, el build falla.
// hipertension-01.json, oido-01.json y oido-02.json no están en el banco: los
// usa solo el generador (templates.ts) como plantillas.
import "server-only";

import garganta02 from "./garganta-02.json";
import garganta03 from "./garganta-03.json";
import oido01 from "./oido-01.json";
import oido02 from "./oido-02.json";
import { type ClinicalCase, caseSchema } from "./schema";

const BANK: unknown[] = [garganta02, garganta03];

export const caseBank: ClinicalCase[] = BANK.map((raw) =>
	caseSchema.parse(raw),
);

// Fuera del banco (no se ofrecen en Casos), pero se siguen encontrando por
// id: las consultas viejas de Diego y sus informes no se rompen, y los tests
// de la otoscopia tienen un oído enfermo.
export const archivedCases: ClinicalCase[] = [oido01, oido02].map((raw) =>
	caseSchema.parse(raw),
);

export function findCase(id: string): ClinicalCase | undefined {
	return (
		caseBank.find((c) => c.id === id) ?? archivedCases.find((c) => c.id === id)
	);
}
