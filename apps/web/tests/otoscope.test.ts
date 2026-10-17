import { describe, expect, test } from "vitest";

import type { ClinicalCase } from "@/cases/schema";
import { EXAM_KINDS } from "@/cases/schema";
import {
	type ExamAction,
	OTOSCOPY,
	type OtoscopyRecord,
} from "@/lib/contracts/exam";
import type { Turn } from "@/lib/contracts/session";
import { assessOtoscopy, otoscopyScenario } from "@/lib/exam/otoscope";
import { evaluate } from "@/lib/scoring/evaluate";

import { lucia, goodStudent as luciaStudent } from "./helpers";

// Acá se mide solo la técnica: con todos los exámenes indicados, examinar
// algo que no es del problema no resta (eso se prueba en cases.test.ts).
const goodStudent = () => ({
	...luciaStudent(),
	clinicalCase: { ...lucia, relevantExams: [...EXAM_KINDS] },
});

const explained: Turn[] = [
	{
		id: "o1",
		sessionId: "s1",
		speaker: "estudiante",
		text: "Ahora te voy a mirar el oído con el otoscopio, ¿puedo?",
		startMs: 0,
		endMs: 0,
		overlap: false,
	},
];

const perfect: OtoscopyRecord = {
	hand: "derecha",
	prep: ["higiene", "inspeccion-externa", "verificar-luz"],
	speculum: "adulto",
	traction: "arriba-atras",
	roughInsertions: 0,
	maxDepth: 70,
	canalMs: 2000,
	tympanumMs: 3000,
};

const adult = otoscopyScenario("garganta-01", 24);

function otoscopy(errors: ExamAction["technique"]): ExamAction {
	return {
		id: "oto1",
		sessionId: "s1",
		zone: "oido-derecho",
		maneuver: OTOSCOPY,
		clarity: "alta",
		variant: "completa",
		hotspotTimesMs: { conducto: 2000, timpano: 3000 },
		startMs: 110_000,
		endMs: 130_000,
		technique: errors,
	};
}

describe("otoscopio", () => {
	test("técnica completa del afiche: sin errores", () => {
		const r = assessOtoscopy("derecho", perfect, explained, adult);
		expect(r.errors).toEqual([]);
		expect(r.steps).toContain("traccion");
	});

	test("mano cruzada, sin tracción y sin explicar", () => {
		const r = assessOtoscopy(
			"izquierdo",
			{ ...perfect, traction: null, tympanumMs: 0 },
			[],
			adult,
		);
		expect(r.errors).toEqual(
			expect.arrayContaining([
				"sin-explicar",
				"mano-cruzada",
				"sin-traccion",
				"no-observa-timpano",
			]),
		);
	});

	test("preparación que falta, espéculo chico, de golpe y muy hondo", () => {
		const r = assessOtoscopy(
			"derecho",
			{
				...perfect,
				prep: ["higiene"],
				speculum: "pediatrico",
				roughInsertions: 2,
				maxDepth: 95,
			},
			explained,
			adult,
		);
		expect(r.errors).toEqual([
			"sin-inspeccion-externa",
			"sin-verificar-luz",
			"especulo-inadecuado",
			"introduce-brusco",
			"introduce-demasiado",
		]);
	});

	test("en el niño chico la tracción es hacia abajo y atrás", () => {
		const toddler = otoscopyScenario("x", 2);
		const r = assessOtoscopy(
			"derecho",
			{ ...perfect, speculum: "pediatrico", traction: "abajo-atras" },
			explained,
			toddler,
		);
		expect(r.errors).toEqual([]);
	});
});

describe("evaluación de la otoscopia", () => {
	test("una otoscopia no cambia el puntaje de la orofaringe", () => {
		const base = evaluate(goodStudent());
		const input = goodStudent();
		input.examActions = [
			otoscopy({ steps: [], errors: [] }),
			...input.examActions,
		];
		const withEar = evaluate(input);
		expect(withEar.scores.examen).toBe(base.scores.examen);
		expect(withEar.items.find((i) => i.itemId === "orofaringe")?.status).toBe(
			"si",
		);
	});

	test("cada error de técnica resta 2 puntos de examen", () => {
		const input = goodStudent();
		input.examActions = [
			...input.examActions,
			otoscopy({ steps: [], errors: ["sin-traccion", "mano-cruzada"] }),
		];
		const report = evaluate(input);
		expect(report.mistakes.map((m) => m.tag)).toEqual(
			expect.arrayContaining([
				"otoscopia-sin-traccion",
				"otoscopia-mano-cruzada",
			]),
		);
		expect(report.scores.examen).toBe(
			evaluate(goodStudent()).scores.examen - 4,
		);
	});

	test("un caso con el ítem de otoscopia lo juzga con la técnica", () => {
		const withItem: ClinicalCase = {
			...lucia,
			expectedChecklist: [
				...lucia.expectedChecklist,
				{
					id: "otoscopia",
					item: "realiza la otoscopia con buena técnica",
					dimension: "examen",
					weight: 2,
					keywords: [],
				},
			],
		};
		const status = (actions: ExamAction[]) => {
			const input = goodStudent();
			input.clinicalCase = withItem;
			input.examActions = [...input.examActions, ...actions];
			return evaluate(input).items.find((i) => i.itemId === "otoscopia")
				?.status;
		};
		expect(status([])).toBe("no");
		expect(status([otoscopy({ steps: [], errors: [] })])).toBe("si");
		expect(status([otoscopy({ steps: [], errors: ["sin-higiene"] })])).toBe(
			"parcial",
		);
	});
});
