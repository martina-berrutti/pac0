// Banco de casos: Lucía con faringitis viral (garganta-02) y Valeria con tres
// lesiones de rodilla (rodilla-01 a 03). El avatar es
// una mujer joven: Diego (oído) salió del banco porque no hay avatar varón, y
// la mononucleosis de Lucía (garganta-03, amígdalas con placas) la sacó el
// equipo (Persona 3). Para sumar uno: crear el JSON y agregarlo a BANK. Cada
// caso valida contra caseSchema al cargar; si no valida, el build falla.
// hipertension-01.json, oido-01.json y oido-02.json no están en el banco: los
// usa solo el generador (templates.ts) como plantillas.
import "server-only";

import garganta02 from "./garganta-02.json";
import garganta03 from "./garganta-03.json";
import oido01 from "./oido-01.json";
import oido02 from "./oido-02.json";
import rodilla01 from "./rodilla-01.json";
import rodilla02 from "./rodilla-02.json";
import rodilla03 from "./rodilla-03.json";
import { type ClinicalCase, caseSchema } from "./schema";

// Valeria (rodilla) son borradores: nadie los revisó todavía.
const BANK: unknown[] = [garganta02, rodilla01, rodilla02, rodilla03];

export const caseBank: ClinicalCase[] = BANK.map((raw) =>
	caseSchema.parse(raw),
);

// Fuera del banco (no se ofrecen en Casos), pero se siguen encontrando por
// id: las consultas viejas y sus informes no se rompen, y los tests tienen
// un oído enfermo y una mononucleosis.
export const archivedCases: ClinicalCase[] = [garganta03, oido01, oido02].map(
	(raw) => caseSchema.parse(raw),
);

export function findCase(id: string): ClinicalCase | undefined {
	return (
		caseBank.find((c) => c.id === id) ?? archivedCases.find((c) => c.id === id)
	);
}
