// Banco de casos: Lucía (garganta) y Diego (oído), con dos problemas cada
// uno. Para sumar uno: crear el JSON y agregarlo a BANK. Cada caso valida
// contra caseSchema al cargar; si no valida, el build falla.
// hipertension-01.json no está en el banco: lo usa solo el generador
// (templates.ts) para los pacientes de presión.
import "server-only";

import garganta02 from "./garganta-02.json";
import garganta03 from "./garganta-03.json";
import oido01 from "./oido-01.json";
import oido02 from "./oido-02.json";
import { type ClinicalCase, caseSchema } from "./schema";

const BANK: unknown[] = [garganta02, garganta03, oido01, oido02];

export const caseBank: ClinicalCase[] = BANK.map((raw) =>
	caseSchema.parse(raw),
);
