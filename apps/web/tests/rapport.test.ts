// Trato al paciente en el informe: lo bueno suma, lo malo resta, y cada cosa
// trae su cita (lib/scoring/rapport.ts).
import { describe, expect, test } from "vitest";

import type { Session, SessionEvent, Turn } from "@/lib/contracts/session";
import { evaluate } from "@/lib/scoring/evaluate";
import { RAPPORT_BONUS_CAP } from "@/lib/scoring/rapport";
import type { EvaluationInput } from "@/lib/scoring/types";

import { lucia } from "./helpers";

let n = 0;
function consulta(
	lines: [Turn["speaker"], string][],
	opts: { confianzaFinal?: number; events?: SessionEvent[] } = {},
): EvaluationInput {
	const turns: Turn[] = lines.map(([speaker, text], i) => {
		n += 1;
		return {
			id: `r${n}`,
			sessionId: "s1",
			speaker,
			text,
			startMs: i * 5000,
			endMs: i * 5000,
			overlap: false,
		};
	});
	const start = 1 - lucia.personality.desconfianza;
	const session: Session = {
		id: "s1",
		userId: "u1",
		caseId: lucia.id,
		alias: "Prueba",
		personalityKey: "caso",
		personality: lucia.personality,
		state: {
			confianza: opts.confianzaFinal ?? start,
			ansiedad: 0.3,
			dolor: 0.5,
			paciencia: 0.7,
		},
		status: "evaluada",
		startedAt: 0,
		endedAt: 1,
		closing: {
			hypothesis: "faringitis viral",
			differentials: ["mononucleosis"],
		},
		consentGiven: false,
		historyOverrides: {},
		inventedFacts: {},
		voiceUsage: null,
	};
	return {
		clinicalCase: lucia,
		session,
		turns,
		events: opts.events ?? [],
		examActions: [],
		vitals: [],
	};
}

// La misma entrevista, con y sin buen trato.
const base: [Turn["speaker"], string][] = [
	[
		"estudiante",
		"Hola, soy Ana, estudiante de medicina. ¿Qué te trae por acá?",
	],
	[
		"paciente",
		"Me duele la garganta hace unos días y me preocupa que sea algo feo.",
	],
	["estudiante", "¿Desde cuándo te duele?"],
	["paciente", "Desde el lunes."],
	["estudiante", "¿Tuviste fiebre?"],
];

describe("trato al paciente", () => {
	test("el buen trato suma, con la cita de cada cosa", () => {
		const plain = evaluate(consulta(base));
		const kind = evaluate(
			consulta(
				[
					[
						"estudiante",
						"Hola, soy Ana, estudiante de medicina. ¿Qué te trae por acá?",
					],
					[
						"paciente",
						"Me duele la garganta hace unos días y me preocupa que sea algo feo.",
					],
					[
						"estudiante",
						"Entiendo que te preocupe, vamos a ver juntos qué es. ¿Desde cuándo te duele?",
					],
					["paciente", "Desde el lunes."],
					["estudiante", "¿Tuviste fiebre?"],
					["paciente", "Sí, anoche."],
					[
						"estudiante",
						"Gracias por contarme. Cualquier cosa, volvé. Que te mejores.",
					],
				],
				{ confianzaFinal: 1 },
			),
		);
		const r = kind.rapport;
		if (!r) throw new Error("sin sección de trato");
		expect(r.bonus).toBeGreaterThan(0);
		const texts = r.plus.map((p) => p.text).join(" | ");
		expect(texts).toContain("reconociste lo que sentía");
		expect(texts).toContain("Cerraste la consulta con amabilidad");
		expect(texts).toContain("más confianza");
		// La cita es la frase del estudiante.
		const cue = r.plus.find((p) => p.text.includes("reconociste"));
		expect(cue?.evidence[0]?.quote).toContain("Entiendo que te preocupe");
		expect(kind.scores.comunicacion).toBeGreaterThan(plain.scores.comunicacion);
		expect(r.summary).toContain("sumaste");
	});

	test("el mal trato resta: ignorar lo que siente, sugestivas, jerga, interrupciones y perder su confianza", () => {
		const interrupciones: SessionEvent[] = [1, 2, 3, 4].map((i) => ({
			id: `ev${i}`,
			sessionId: "s1",
			type: "interrupcion_estudiante",
			atMs: i * 1000,
		}));
		const start = 1 - lucia.personality.desconfianza;
		const bad = evaluate(
			consulta(
				[
					[
						"estudiante",
						"Hola, soy Ana, estudiante de medicina. ¿Qué te trae por acá?",
					],
					[
						"paciente",
						"Me duele la garganta y tengo miedo de que sea algo grave.",
					],
					["estudiante", "¿Tenés odinofagia?"],
					["paciente", "¿Qué es eso?"],
					["estudiante", "Tuviste fiebre, ¿no?"],
				],
				{ confianzaFinal: start - 0.3, events: interrupciones },
			),
		);
		const r = bad.rapport;
		if (!r) throw new Error("sin sección de trato");
		const texts = r.minus.map((m) => m.text).join(" | ");
		expect(texts).toContain("tengo miedo");
		expect(texts).toContain("término médico");
		expect(texts).toContain("Pregunta sugestiva");
		expect(texts).toContain("Interrumpiste");
		expect(texts).toContain("menos confianza");
		expect(r.penalty).toBeGreaterThan(0);
		expect(r.minus.filter((m) => m.points).length).toBeGreaterThanOrEqual(5);
		expect(bad.scores.comunicacion).toBeLessThan(
			evaluate(consulta(base)).scores.comunicacion,
		);
		expect(["mejorable", "a_trabajar"]).toContain(r.level);
		// Perder la confianza también aparece en los errores, con su consejo.
		expect(bad.mistakes.some((m) => m.tag === "baja-confianza")).toBe(true);
	});

	test("una o dos interrupciones se avisan pero todavía no restan", () => {
		const r = evaluate(
			consulta(base, {
				events: [
					{
						id: "e1",
						sessionId: "s1",
						type: "interrupcion_estudiante",
						atMs: 1,
					},
				],
			}),
		).rapport;
		const note = r?.minus.find((m) => m.text.includes("Interrumpiste"));
		expect(note?.text).toContain("una vez");
		expect(note?.points).toBeUndefined();
	});

	test("no dar indicaciones no es mal trato: no baja el nivel ni aparece en la sección", () => {
		const r = evaluate(
			consulta([
				[
					"estudiante",
					"Hola, soy Ana, estudiante de medicina. ¿Qué te trae por acá?",
				],
				["paciente", "Me duele la garganta."],
				["estudiante", "¿Desde cuándo te duele?"],
				["paciente", "Desde el lunes."],
				["estudiante", "Si entendí bien, te duele desde el lunes, ¿es así?"],
			]),
		).rapport;
		expect(["muy_bueno", "bueno"]).toContain(r?.level);
		const all = [...(r?.plus ?? []), ...(r?.minus ?? [])]
			.map((e) => e.text)
			.join(" | ");
		expect(all).not.toContain("tratamiento sintomático");
		expect(all).not.toContain("volver a consultar");
	});

	test("el trato irrespetuoso es crítico y deja el trato en «a trabajar»", () => {
		const report = evaluate(
			consulta([
				["estudiante", "Hola. ¿Qué te pasa?"],
				["paciente", "Me duele mucho al tragar."],
				["estudiante", "Bueno, no te quejes tanto y contestá."],
			]),
		);
		const r = report.rapport;
		expect(r?.level).toBe("a_trabajar");
		expect(r?.minus.some((m) => m.critical)).toBe(true);
		expect(report.verdict).not.toBe("lo_hiciste_bien");
	});

	test(`lo que suma tiene tope de ${RAPPORT_BONUS_CAP} puntos`, () => {
		const lines: [Turn["speaker"], string][] = [
			["estudiante", "Hola, soy Ana. ¿Qué te trae?"],
		];
		for (let i = 0; i < 8; i++) {
			lines.push(["paciente", "Me preocupa mucho esto."]);
			lines.push(["estudiante", "Entiendo, es normal que te preocupe."]);
		}
		lines.push(["estudiante", "Gracias, que te mejores."]);
		const r = evaluate(consulta(lines, { confianzaFinal: 1 })).rapport;
		const raw = r?.plus.reduce((s, p) => s + (p.points ?? 0), 0) ?? 0;
		expect(raw).toBeGreaterThan(RAPPORT_BONUS_CAP);
		expect(r?.bonus).toBe(RAPPORT_BONUS_CAP);
	});
});
