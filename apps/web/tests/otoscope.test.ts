import { describe, expect, test } from "vitest";

import { caseBank } from "@/cases";
import type { ClinicalCase } from "@/cases/schema";
import { EXAM_KINDS } from "@/cases/schema";
import {
	type ExamAction,
	OTOSCOPY,
	type OtoscopyRecord,
} from "@/lib/contracts/exam";
import type { Turn } from "@/lib/contracts/session";
import {
	affectedEar,
	assessOtoscopy,
	describeEars,
	otoscopyScenario,
} from "@/lib/exam/otoscope";
import { evaluate } from "@/lib/scoring/evaluate";

import { amigdalitis, goodStudent as luciaStudent } from "./helpers";

// Acá se mide solo la técnica: con todos los exámenes indicados, examinar
// algo que no es del problema no resta (eso se prueba en cases.test.ts).
const goodStudent = () => ({
	...luciaStudent(),
	clinicalCase: { ...amigdalitis, relevantExams: [...EXAM_KINDS] },
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
			...amigdalitis,
			expectedChecklist: [
				...amigdalitis.expectedChecklist,
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

describe("hallazgos de oído por caso", () => {
	const diego = caseBank.find((c) => c.id === "oido-01") as ClinicalCase;
	const ear = (zone: "oido-derecho" | "oido-izquierdo", startMs: number) => ({
		...otoscopy({ steps: [], errors: [] }),
		id: `oto-${zone}`,
		zone,
		startMs,
	});
	// El buen estudiante con el caso de Diego y solo estas otoscopias.
	function withDiego(actions: ExamAction[], c: ClinicalCase = diego) {
		const input = goodStudent();
		return { ...input, clinicalCase: c, examActions: actions };
	}
	const tags = (actions: ExamAction[]) =>
		evaluate(withDiego(actions)).mistakes.map((m) => m.tag);

	test("Diego tiene el oído derecho afectado; Lucía, ninguno", () => {
		const s = otoscopyScenario("oido-01", diego.patient.age);
		expect(affectedEar(s)).toBe("derecho");
		expect(describeEars(s)).toBe(
			"oído derecho: conducto enrojecido con secreción, tímpano nacarado con triángulo luminoso; oído izquierdo: normal",
		);
		expect(affectedEar(adult)).toBeNull();
	});

	test("examinar los dos oídos empezando por el sano no resta", () => {
		const t = tags([
			ear("oido-izquierdo", 100_000),
			ear("oido-derecho", 120_000),
		]);
		expect(t).not.toContain("otoscopia-un-oido");
		expect(t).not.toContain("otoscopia-orden");
	});

	test("empezar por el oído que le duele resta 1", () => {
		const report = evaluate(
			withDiego([ear("oido-derecho", 100_000), ear("oido-izquierdo", 120_000)]),
		);
		const m = report.mistakes.find((x) => x.tag === "otoscopia-orden");
		expect(m?.what).toContain("derecho");
		expect(m?.source).toBe("Lista de cotejo del caso");
	});

	test("un solo oído resta 2, y dice cuál faltó", () => {
		const onlySick = evaluate(withDiego([ear("oido-derecho", 100_000)]));
		expect(
			onlySick.mistakes.find((m) => m.tag === "otoscopia-un-oido")?.what,
		).toContain("sin compararlo con el sano");
		const onlyHealthy = evaluate(withDiego([ear("oido-izquierdo", 100_000)]));
		expect(
			onlyHealthy.mistakes.find((m) => m.tag === "otoscopia-un-oido")?.what,
		).toContain("No examinaste el oído que le duele");
	});

	test("sin oído afectado en el caso, un solo oído no resta", () => {
		expect(
			evaluate(
				withDiego([ear("oido-derecho", 100_000)], amigdalitis),
			).mistakes.map((m) => m.tag),
		).not.toContain("otoscopia-un-oido");
	});

	describe("describir lo que vio en el oído", () => {
		const withDescribe: ClinicalCase = {
			...diego,
			expectedChecklist: [
				...diego.expectedChecklist,
				{
					id: "describe-hallazgo",
					item: "describe lo que vio en el oído",
					dimension: "examen",
					weight: 2,
					keywords: ["secreción", "rojo", "enrojecido"],
				},
			],
		};
		const both = [ear("oido-izquierdo", 100_000), ear("oido-derecho", 120_000)];
		const turn = (text: string): Turn => ({
			id: "d1",
			sessionId: "s1",
			speaker: "estudiante",
			text,
			startMs: 125_000,
			endMs: 125_000,
			overlap: false,
		});

		test("miró sin describir: parcial y muestra lo esperado", () => {
			const report = evaluate(withDiego(both, withDescribe));
			expect(
				report.items.find((i) => i.itemId === "describe-hallazgo")?.status,
			).toBe("parcial");
			expect(
				report.mistakes.find((m) => m.tag === "describe-hallazgo")?.what,
			).toContain("conducto enrojecido con secreción");
		});

		test("lo describió: cumplido", () => {
			const input = withDiego(both, withDescribe);
			input.turns = [
				...input.turns,
				turn("Veo el conducto derecho rojo con secreción."),
			];
			expect(
				evaluate(input).items.find((i) => i.itemId === "describe-hallazgo")
					?.status,
			).toBe("si");
		});
	});
});
