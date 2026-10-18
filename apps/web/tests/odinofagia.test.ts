// Odinofagia (Persona 3): signos de alarma, ganglios, indicaciones y el orden
// de la consulta en el informe.
import { describe, expect, test, vi } from "vitest";

vi.mock("@google/genai", () => ({
	Modality: { AUDIO: "AUDIO" },
	GoogleGenAI: class {},
}));

import type { ExamAction } from "@/lib/contracts/exam";
import type { Session, Turn } from "@/lib/contracts/session";
import { asksForNeckExam } from "@/lib/exam/end-intent";
import { ruleRespond } from "@/lib/patient/rule-responder";
import { evaluate } from "@/lib/scoring/evaluate";
import type { EvaluationInput } from "@/lib/scoring/types";
import {
	finishSession,
	saveExamTimes,
	sendTurn,
	startSession,
} from "@/server/consultation";
import { palpateNeck } from "@/server/neck";
import type { Viewer } from "@/server/token";

import { lucia } from "./helpers";

describe("pedir palpar el cuello", () => {
	test.each([
		["Te voy a palpar el cuello, ¿puedo?", true],
		["Ahora te toco los ganglios", true],
		["Te reviso el cuello", true],
		["¿Te duele el cuello?", false],
		["¿Te notaste ganglios?", false],
		["¿Alguien te revisó el cuello?", false],
	])("%s", (text, expected) => {
		expect(asksForNeckExam(text)).toBe(expected);
	});
});

describe("Lucía sin IA contesta los signos de alarma", () => {
	const brief = {
		name: lucia.patient.name,
		age: lucia.patient.age,
		occupation: lucia.patient.occupation,
		chiefComplaint: lucia.chiefComplaint,
		profile: lucia.profile,
		history: lucia.hiddenHistory,
		personality: lucia.personality,
		style: "",
		invented: {},
	};
	const state = { confianza: 0.9, ansiedad: 0.3, dolor: 0.4, paciencia: 0.7 };
	test.each([
		["¿Te falta el aire?", "aire"],
		["¿Podés tragar la saliva?", "saliva"],
		["¿Te cuesta abrir la boca?", "abro la boca"],
		["¿Notaste cambios en la voz?", "hablo normal"],
	])("%s", (q, expected) => {
		expect(ruleRespond(brief, state, q, 3).text).toContain(expected);
	});
});

// Consulta armada a mano, con los tiempos de cada turno y examen.
let n = 0;
function consulta(
	said: [number, string][],
	exams: [number, string][],
): EvaluationInput {
	const turns: Turn[] = said.map(([s, text]) => {
		n += 1;
		return {
			id: `o${n}`,
			sessionId: "s1",
			speaker: "estudiante",
			text,
			startMs: s * 1000,
			endMs: s * 1000,
			overlap: false,
		};
	});
	const examActions: ExamAction[] = exams.map(([s, maneuver]) => {
		n += 1;
		const neck = maneuver === "palpacion-cuello";
		return {
			id: `e${n}`,
			sessionId: "s1",
			zone: neck ? "cuello" : "orofaringe",
			maneuver,
			clarity: "alta",
			variant: "completa",
			hotspotTimesMs: neck
				? {}
				: Object.fromEntries(
						(lucia.exam.orofaringe?.hotspots ?? []).map((h) => [h, 1000]),
					),
			startMs: s * 1000,
			endMs: s * 1000 + 5000,
		};
	});
	const session: Session = {
		id: "s1",
		userId: "u1",
		caseId: lucia.id,
		alias: "Prueba",
		personalityKey: "caso",
		personality: lucia.personality,
		state: { confianza: 0.9, ansiedad: 0.3, dolor: 0.4, paciencia: 0.7 },
		status: "evaluada",
		startedAt: 0,
		endedAt: 1,
		closing: {
			hypothesis: "Faringitis viral por la tos y los mocos",
			differentials: ["faringoamigdalitis estreptocócica"],
		},
		consentGiven: true,
		historyOverrides: {},
		inventedFacts: {},
		voiceUsage: null,
	};
	return {
		clinicalCase: lucia,
		session,
		turns,
		events: [],
		examActions,
		vitals: [],
	};
}

const ANAMNESIS: [number, string][] = [
	[1, "Hola, soy Ana, estudiante. ¿Qué te trae por acá?"],
	[10, "¿Qué edad tenés? ¿Desde cuándo te duele?"],
	[20, "¿Tuviste fiebre? ¿Tenés tos?"],
	[
		30,
		"¿Te falta el aire? ¿Podés tragar la saliva? ¿Te cuesta abrir la boca? ¿Cambió tu voz?",
	],
	[40, "¿Te salieron bultitos en el cuello?"],
];
const INDICATIONS: [number, string][] = [
	[
		200,
		"Tomá paracetamol y mucho líquido. Si te falta el aire o no podés tragar, volvé a consultar.",
	],
];
const EXAMS: [number, string][] = [
	[100, "orofaringe"],
	[120, "palpacion-cuello"],
];

describe("informe de odinofagia", () => {
	test("todo bien: los bloques ✓ y buen orden", () => {
		const r = evaluate(consulta([...ANAMNESIS, ...INDICATIONS], EXAMS));
		const o = r.odinofagia;
		expect(o?.blocks.map((b) => [b.key, b.status])).toEqual([
			["anamnesis", "si"],
			["examen", "si"],
			["indicaciones", "si"],
		]);
		expect(r.order?.ok).toBe(true);
		expect(r.order?.steps.map((s) => s.key)).toEqual([
			"anamnesis",
			"examen",
			"indicaciones",
		]);
		expect(r.mistakes.some((m) => m.critical)).toBe(false);
	});

	test("sin preguntar signos de alarma: bloque a medias y error crítico", () => {
		const r = evaluate(
			consulta(
				ANAMNESIS.filter(([s]) => s !== 30),
				EXAMS,
			),
		);
		const alarm = r.odinofagia?.blocks
			.find((b) => b.key === "anamnesis")
			?.checks.find((c) => c.label.includes("alarma"));
		expect(alarm?.status).toBe("no");
		expect(r.mistakes.find((m) => m.critical)?.tag).toBe(
			"alarma-signos-alarma",
		);
	});

	test("preguntar por los ganglios sin palparlos también vale", () => {
		const r = evaluate(consulta(ANAMNESIS, [[100, "orofaringe"]]));
		expect(r.items.find((i) => i.itemId === "adenopatias")?.status).toBe("si");
	});

	test("cualquier orden vale, pero el informe lo marca", () => {
		const r = evaluate(
			consulta(
				[
					[1, "Hola, soy Ana. Te voy a revisar."],
					[5, INDICATIONS[0]?.[1] ?? ""],
					...ANAMNESIS.map(([s, t]) => [s + 100, t] as [number, string]),
				],
				[
					[2, "orofaringe"],
					[50, "palpacion-cuello"],
				],
			),
		);
		expect(r.order?.ok).toBe(false);
		expect(r.order?.steps.map((s) => s.key)).toEqual([
			"examen",
			"indicaciones",
			"anamnesis",
		]);
		expect(r.order?.notes.join(" ")).toContain("antes de preguntar");
		expect(r.order?.notes.join(" ")).toContain("antes de terminar de examinar");
		// El orden no resta: los bloques igual se cumplen.
		expect(r.odinofagia?.blocks.every((b) => b.status === "si")).toBe(true);
	});
});

describe("consulta completa por el servidor", () => {
	test("palpar el cuello queda como examen y cuenta en el informe", async () => {
		const ana: Viewer & { alias: string } = {
			uid: "gst_odinofagia",
			alias: "Ana",
			careerYear: "4",
			guest: true,
			exp: Date.now() + 1e6,
		};
		const id = await startSession(ana, lucia.id, "caso");
		await sendTurn(ana, id, "Hola, soy Ana, estudiante. ¿Qué te trae?");
		const { exam } = await sendTurn(
			ana,
			id,
			"Te voy a revisar la garganta, ¿puedo? Abrí bien grande y decí aaa.",
		);
		if (exam)
			await saveExamTimes(
				ana,
				id,
				exam.action.id,
				Object.fromEntries(exam.hotspots.map((h) => [h, 1000])),
			);
		const neck = await palpateNeck(ana, id);
		expect(neck.tender).toBe(false);
		expect(neck.finding).toContain("No se palpan");

		const report = await finishSession(ana, id, "faringitis viral", []);
		const block = (key: string) =>
			report.odinofagia?.blocks.find((b) => b.key === key)?.status;
		expect(block("examen")).toBe("si");
	});
});

describe("menú de personalidades", () => {
	test("el adulto mayor no aparece (el generador lo sigue usando)", async () => {
		const { GET } = await import("@/app/api/personalities/route");
		const { personalities } = (await (await GET()).json()) as {
			personalities: { key: string }[];
		};
		expect(personalities.map((p) => p.key)).not.toContain("mayor");
		expect(personalities.length).toBeGreaterThan(3);
	});
});
