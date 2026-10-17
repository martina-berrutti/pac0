// Banco de casos. Para sumar uno: crear el JSON y agregarlo a BANK.
// Cada caso valida contra caseSchema al cargar; si no valida, el build falla.
import "server-only";

import garganta01 from "./garganta-01.json";
import { type ClinicalCase, caseSchema } from "./schema";

const BANK: unknown[] = [garganta01];

export const caseBank: ClinicalCase[] = BANK.map((raw) =>
	caseSchema.parse(raw),
);
