import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// SDK de Google simulado, igual que en voice.test.ts.
const genai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@google/genai", () => ({
	Modality: { AUDIO: "AUDIO" },
	GoogleGenAI: class {
		authTokens = { create: genai.create };
	},
}));

import { roleOf } from "@/server/auth";
import {
	finishSession,
	getReport,
	getSessionView,
	startSession,
} from "@/server/consultation";
import { store } from "@/server/store";
import type { Viewer } from "@/server/token";
import {
	recordVoiceEvent,
	recordVoiceTurn,
	voiceInstructions,
} from "@/server/voice";

import { lucia } from "./helpers";

let n = 0;
function student(guest = true): Viewer & { alias: string } {
	n += 1;
	return {
		uid: `${guest ? "gst" : "ggl"}_p1_${n}`,
		alias: `Estudiante ${n}`,
		careerYear: "3",
		guest,
		exp: Date.now() + 1e6,
	};
}

beforeEach(() => {
	genai.create.mockReset();
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("rol de docente (plan.md, sección 10)", () => {
	test("solo es docente una cuenta de la lista DOCENTES; un invitado nunca", () => {
		const cuenta = student(false);
		const invitado = student(true);
		vi.stubEnv("DOCENTES", `${cuenta.uid}, ${invitado.uid}`);
		expect(roleOf(cuenta)).toBe("docente");
		expect(roleOf(invitado)).toBe("estudiante");
		vi.stubEnv("DOCENTES", "");
		expect(roleOf(cuenta)).toBe("estudiante");
	});

	test("un docente lee la consulta y el informe de otro; otro estudiante no", async () => {
		const ana = student();
		const docente = student(false);
		const beto = student();
		vi.stubEnv("DOCENTES", docente.uid);
		const id = await startSession(ana, lucia.id, "caso");
		await recordVoiceTurn(ana, id, "estudiante", "Hola, ¿qué te pasa?", false);
		await finishSession(ana, id, "faringitis", ["viral"]);

		expect((await getSessionView(docente, id)).turns).toHaveLength(1);
		expect((await getReport(docente, id)).sessionId).toBe(id);
		await expect(getReport(beto, id)).rejects.toThrow("Sesión no encontrada");
		// Leer no es actuar: el docente no puede hablar en la consulta de otro.
		await expect(
			recordVoiceTurn(docente, id, "estudiante", "hola", false),
		).rejects.toThrow("Sesión no encontrada");
	});
});

describe("topes diarios (plan.md, sección 14)", () => {
	test("por usuario", async () => {
		vi.stubEnv("MAX_SESSIONS_PER_USER_PER_DAY", "2");
		const ana = student();
		await startSession(ana, lucia.id, "caso");
		await startSession(ana, lucia.id, "caso");
		await expect(startSession(ana, lucia.id, "caso")).rejects.toMatchObject({
			status: 429,
		});
		// Otro usuario sigue pudiendo.
		await expect(startSession(student(), lucia.id, "caso")).resolves.toMatch(
			/^ses_/,
		);
	});

	test("en total, aunque cada invitado sea nuevo", async () => {
		const ya = await store.countSessionsSince(0, 10_000);
		vi.stubEnv("MAX_SESSIONS_PER_DAY", String(ya + 1));
		await startSession(student(), lucia.id, "caso");
		await expect(
			startSession(student(), lucia.id, "caso"),
		).rejects.toMatchObject({ status: 429 });
	});
});

describe("estado del paciente con eventos objetivos (plan.md, sección 5)", () => {
	test("interrumpir y quedarse callado bajan la paciencia; pedir permiso sube la confianza", async () => {
		const ana = student();
		const id = await startSession(ana, lucia.id, "caso");
		const before = (await store.getSession(id))?.state;
		if (!before) throw new Error("sin sesión");

		await recordVoiceEvent(ana, id, "interrupcion_estudiante");
		await recordVoiceEvent(ana, id, "silencio_largo", 21_000);
		const after = (await store.getSession(id))?.state;
		expect(after?.paciencia).toBeCloseTo(before.paciencia - 0.15);
		expect(after?.confianza).toBeCloseTo(before.confianza - 0.05);

		await recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"¿Te puedo revisar la garganta?",
			false,
		);
		expect((await store.getSession(id))?.state.confianza).toBeCloseTo(
			Math.min(1, before.confianza + 0.05),
		);
		const motivos = (await store.listEvents(id))
			.filter((e) => e.type === "cambio_animo")
			.map((e) => e.motivo);
		expect(motivos).toEqual([
			"interrupcion_estudiante",
			"silencio_largo",
			"consentimiento",
		]);
	});

	test("al paciente le llega una nota cuando lo interrumpen, y con fastidio si se repite", async () => {
		const ana = student();
		const id = await startSession(ana, lucia.id, "caso");
		const first = await recordVoiceEvent(ana, id, "interrupcion_estudiante");
		expect(first.nota).toContain("te interrumpió");
		expect(first.nota).not.toContain("fastidio");
		const second = await recordVoiceEvent(ana, id, "interrupcion_estudiante");
		expect(second.nota).toContain("ya van 2");
		expect(second.nota).toContain("fastidio");
		expect(
			(await recordVoiceEvent(ana, id, "silencio_largo", 21_000)).nota,
		).toBeNull();
	});

	test("la interrupción del paciente no cambia el estado", async () => {
		const ana = student();
		const id = await startSession(ana, lucia.id, "caso");
		const before = (await store.getSession(id))?.state;
		await recordVoiceEvent(ana, id, "interrupcion_paciente");
		expect((await store.getSession(id))?.state).toEqual(before);
	});
});

describe("reconexión de la voz", () => {
	test("el token nuevo lleva lo que ya se habló", async () => {
		const ana = student();
		const id = await startSession(ana, lucia.id, "caso");
		expect(await voiceInstructions(ana, id)).not.toContain("se retoma");

		await recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"¿Desde cuándo te duele?",
			false,
		);
		await recordVoiceTurn(ana, id, "paciente", "Desde el lunes, doc.", false);
		const text = await voiceInstructions(ana, id);
		expect(text).toContain("se retoma");
		expect(text).toContain("Estudiante: ¿Desde cuándo te duele?");
		expect(text).toContain("Vos: Desde el lunes, doc.");
		expect(text).not.toContain(lucia.truth.diagnosis);
	});
});
