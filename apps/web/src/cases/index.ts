// Banco de casos. Para sumar uno: crear el JSON y agregarlo a BANK.
// Cada caso valida contra caseSchema al cargar; si no valida, el build falla.
import "server-only";

import garganta01 from "./garganta-01.json";
import garganta02 from "./garganta-02.json";
import hipertension01 from "./hipertension-01.json";
import oido01 from "./oido-01.json";
import { type ClinicalCase, caseSchema } from "./schema";

const BANK: unknown[] = [garganta01, hipertension01, oido01, garganta02];

export const caseBank: ClinicalCase[] = BANK.map((raw) =>
	caseSchema.parse(raw),
);
