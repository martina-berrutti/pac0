import { describe, expect, test } from "vitest";
import { classifyStudentTurn, stateBand } from "@/lib/patient/turn-classifier";
import { ALL_VOICES, pickVoice, VOICES } from "@/lib/patient/voices";
import { startSession } from "@/server/consultation";
import { store } from "@/server/store";
import type { Viewer } from "@/server/token";
import { recordVoiceTurn } from "@/server/voice";

import { lucia } from "./helpers";

const ana: Viewer & { alias: string } = {
	uid: "gst_clasif_ana",
	alias: "Ana",
	careerYear: "3",
	guest: true,
	exp: Date.now() + 1e6,
};

describe("clasificador de turnos", () => {
	test.each([
		["¿Qué te trae por acá?", "pregunta_abierta"],
		["Contame cómo empezó", "pregunta_abierta"],
		["¿Tuviste fiebre?", "pregunta_cerrada"],
		["Tenés fiebre, ¿no?", "sugestiva"],
		["¿Tenés odinofagia?", "jerga"],
		["Entiendo, debe ser feo estar así", "empatia"],
	])("%s → %s", (text, tag) => {
		expect(classifyStudentTurn(text, []).tags).toContain(tag);
	});

	test("la jerga explicada no cuenta", () => {
		expect(
			classifyStudentTurn("¿Tenés odinofagia, o sea, dolor al tragar?", [])
				.tags,
		).not.toContain("jerga");
	});

	test("repetir una pregunta ya hecha baja la paciencia", () => {
		const c = classifyStudentTurn("¿Tuviste fiebre?", [
			"Hola",
			"¿Tuviste fiebre?",
		]);
		expect(c.tags).toContain("repetida");
		expect(c.delta.paciencia).toBeLessThan(0);
	});

	test("la empatía sube la confianza y baja la ansiedad", () => {
		const c = classifyStudentTurn("Tranqui, entiendo que te preocupe", []);
		expect(c.delta.confianza).toBeGreaterThan(0);
		expect(c.delta.ansiedad).toBeLessThan(0);
		expect(c.motivo).toContain("empatía");
	});

	test("una frase neutra no cambia nada", () => {
		expect(classifyStudentTurn("Bueno, ahora te reviso.", [])).toEqual({
			tags: [],
			delta: {},
			motivo: null,
		});
	});

	test("los niveles se describen sin números", () => {
		expect(
			stateBand({ confianza: 0.8, ansiedad: 0.3, dolor: 0.5, paciencia: 0.1 }),
		).toBe("confianza alta, paciencia poca");
	});

	test("en la voz: guarda etiquetas, cambia el estado y avisa cuando cambia el nivel", async () => {
		const id = await startSession(ana, lucia.id, "hostil");
		const before = (await store.getSession(id))?.state.confianza ?? 0;
		const first = await recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"Entiendo, tranqui, debe ser feo. Contame qué te pasa.",
			false,
		);
		// El hostil arranca con confianza 0,2: una frase empática (+0,15) no
		// alcanza para cambiar de nivel, dos sí.
		expect(first.stateNote).toBeNull();
		const r = await recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"Gracias por contarme, imagino que te preocupa.",
			false,
		);
		expect(first.turn.tags).toEqual(
			expect.arrayContaining(["empatia", "pregunta_abierta"]),
		);
		expect((await store.getSession(id))?.state.confianza).toBeGreaterThan(
			before,
		);
		expect(r.stateNote).toBe("confianza media, paciencia suficiente");
		const events = await store.listEvents(id);
		expect(
			events.some(
				(e) =>
					e.type === "cambio_animo" && e.motivo?.startsWith("clasificador"),
			),
		).toBe(true);
	});

	test("los turnos del paciente no se clasifican", async () => {
		const id = await startSession(ana, lucia.id, "caso");
		const r = await recordVoiceTurn(
			ana,
			id,
			"paciente",
			"¿Qué te trae? Entiendo.",
			false,
		);
		expect(r.turn.tags).toBeUndefined();
		expect(r.stateNote).toBeNull();
	});
});

describe("voces al azar", () => {
	test("acorde al sexo del paciente", () => {
		for (let i = 0; i < 20; i++) {
			expect(VOICES.f).toContain(pickVoice("f"));
			expect(VOICES.m).toContain(pickVoice("m"));
			expect(ALL_VOICES).toContain(pickVoice(undefined));
		}
	});

	test("cada consulta sortea una y la guarda", async () => {
		const voices = new Set<string>();
		for (let i = 0; i < 12; i++) {
			// Un usuario por consulta: hay un tope de consultas por día.
			const id = await startSession(
				{ ...ana, uid: `gst_voz_${i}` },
				lucia.id,
				"caso",
			);
			const voice = (await store.getSession(id))?.voice;
			expect(VOICES.f).toContain(voice);
			voices.add(voice ?? "");
		}
		// Lucía es mujer: en 12 consultas tiene que haber variado.
		expect(voices.size).toBeGreaterThan(1);
	});
});
