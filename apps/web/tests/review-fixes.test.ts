// Arreglos de la revisión de código de la Persona 1 (17/10).
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Session } from "@/lib/contracts/session";
import { applySessionChange } from "@/lib/contracts/session-change";
import { classifyStudentTurn } from "@/lib/patient/turn-classifier";
import {
	finishSession,
	getSessionView,
	giveConsent,
	startSession,
} from "@/server/consultation";
import { getMistakes } from "@/server/mistakes";
import { store } from "@/server/store";
import type { Viewer } from "@/server/token";
import { recordVoiceTurn, runTool } from "@/server/voice";

import { lucia } from "./helpers";

let n = 0;
const fresh = (): Viewer & { alias: string } => {
	n += 1;
	return {
		uid: `gst_rev_${n}`,
		alias: "Ana",
		careerYear: "3",
		guest: true,
		exp: Date.now() + 1e6,
	};
};

afterEach(() => vi.unstubAllEnvs());

const base = {
	id: "s",
	status: "activa",
	state: { confianza: 0.5, ansiedad: 0.5, dolor: 0.5, paciencia: 0.5 },
	inventedFacts: {},
	voiceUsage: null,
} as unknown as Session;

describe("cambios atómicos de sesión", () => {
	test("los deltas se suman y quedan entre 0 y 1", () => {
		const a = applySessionChange(base, { stateDelta: { confianza: 0.3 } });
		const b =
			a &&
			applySessionChange(a, {
				stateDelta: { confianza: 0.3, paciencia: -0.9 },
			});
		expect(b?.state.confianza).toBe(1);
		expect(b?.state.paciencia).toBe(0);
	});

	test("uso sumado, datos sin pisar, reserva de voz y condición de estado", () => {
		const u = {
			inputTokens: 10,
			outputTokens: 5,
			inputAudioTokens: 8,
			outputAudioTokens: 4,
			cachedTokens: 1,
		};
		let s = applySessionChange(base, {
			usageDelta: u,
			facts: { hermanos: "dos" },
			incVoiceStarts: true,
		});
		s =
			s &&
			applySessionChange(s, {
				usageDelta: u,
				facts: { hermanos: "tres" },
				incVoiceStarts: true,
			});
		expect(s?.voiceUsage).toMatchObject({ responses: 2, inputTokens: 20 });
		expect(s?.inventedFacts).toEqual({ hermanos: "dos" });
		expect(s?.voiceStarts).toBe(2);
		expect(
			applySessionChange(base, {
				ifStatus: "evaluada",
				set: { status: "evaluada" },
			}),
		).toBeNull();
	});

	test("consentimiento y clasificador a la vez: no se pierde ninguno", async () => {
		const ana = fresh();
		const id = await startSession(ana, "garganta-02", "hostil");
		const session = await store.getSession(id);
		if (!session) throw new Error("sin sesión");
		const before = session.state.confianza;
		await Promise.all([
			giveConsent(session, 1000),
			recordVoiceTurn(
				ana,
				id,
				"estudiante",
				"Entiendo, tranqui, debe ser feo.",
				false,
			),
		]);
		const after = await store.getSession(id);
		expect(after?.consentGiven).toBe(true);
		// +0,1 del consentimiento y +0,1 de la empatía: los dos quedan.
		expect(after?.state.confianza).toBeCloseTo(before + 0.2, 5);
	});

	test("dos cierres a la vez: un solo informe y los errores suman una vez", async () => {
		const ana = fresh();
		const id = await startSession(ana, lucia.id, "caso");
		const results = await Promise.allSettled([
			finishSession(ana, id, "gripe", []),
			finishSession(ana, id, "gripe", []),
		]);
		expect(results.some((r) => r.status === "fulfilled")).toBe(true);
		const mistakes = await getMistakes(ana.uid);
		expect(mistakes.every((m) => m.count === 1)).toBe(true);
	});
});

describe("privacidad", () => {
	test("la vista de la sesión no lleva la historia sorteada ni lo interno", async () => {
		const ana = fresh();
		const id = await startSession(ana, lucia.id, "caso");
		await runTool(ana, id, "anotar_dato", { clave: "hermanos", valor: "dos" });
		const view = await getSessionView(ana, id);
		const json = JSON.stringify(view);
		for (const field of [
			"historyOverrides",
			"inventedFacts",
			'personality"',
			"voiceStarts",
			"voiceUsage",
		]) {
			expect(json).not.toContain(field);
		}
		expect(json).not.toContain("38,5");
	});
});

describe("abuso desde el navegador", () => {
	test("actualizar_estado: uno por turno y como mucho ±0,3", async () => {
		const ana = fresh();
		const id = await startSession(ana, "garganta-02", "hostil");
		const start = (await store.getSession(id))?.state.confianza ?? 0;
		await runTool(ana, id, "actualizar_estado", {
			delta: { confianza: 0.5 },
			motivo: "x",
		});
		const second = await runTool(ana, id, "actualizar_estado", {
			delta: { confianza: 0.5 },
			motivo: "x",
		});
		expect(second.output.ok).toBe(false);
		expect((await store.getSession(id))?.state.confianza).toBeCloseTo(
			start + 0.3,
			5,
		);
	});
});

describe("preguntas sugestivas", () => {
	test.each([
		["¿Tenés algún hermano?", false],
		["¿Empezó en el verano?", false],
		["Hola, soy Bruno", false],
		["Tenés fiebre, ¿no?", true],
		["Te duele al tragar, ¿verdad?", true],
	])("%s → %s", (text, leading) => {
		expect(classifyStudentTurn(text, []).tags.includes("sugestiva")).toBe(
			leading,
		);
	});
});
