import { afterEach, describe, expect, test, vi } from "vitest";

import { bloodPressureReading } from "@/lib/patient/blood-pressure";
import { BP_STEPS } from "@/lib/patient/tools";
import { startSession } from "@/server/consultation";
import { store } from "@/server/store";
import type { Viewer } from "@/server/token";
import {
	createRealtimeSession,
	recordVoiceTurn,
	runTool,
	voiceInstructions,
} from "@/server/voice";

import { lucia } from "./helpers";

const ana: Viewer & { alias: string } = {
	uid: "usr_ana",
	alias: "Ana",
	careerYear: "3",
	guest: true,
	exp: Date.now() + 1e6,
};
const beto: Viewer = {
	uid: "usr_beto",
	alias: "Beto",
	careerYear: "2",
	guest: true,
	exp: Date.now() + 1e6,
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("sesión de voz", () => {
	test("sin OPENAI_API_KEY avisa que se use el texto", async () => {
		vi.stubEnv("OPENAI_API_KEY", "");
		const id = startSession(ana, lucia.id, "caso");
		await expect(createRealtimeSession(ana, id)).rejects.toThrow(
			"versión por texto",
		);
	});

	test("pide la clave efímera sin el diagnóstico y con las herramientas", async () => {
		vi.stubEnv("OPENAI_API_KEY", "sk-test-servidor");
		const fetchMock = vi.fn(async () => Response.json({ value: "ek_efimera" }));
		vi.stubGlobal("fetch", fetchMock);
		const id = startSession(ana, lucia.id, "caso");

		const result = await createRealtimeSession(ana, id);

		expect(result.clientSecret).toBe("ek_efimera");
		expect(JSON.stringify(result)).not.toContain("sk-test-servidor");
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
		const body = String(init.body);
		expect(body).not.toContain(lucia.truth.diagnosis);
		expect(body).not.toContain(lucia.exam.orofaringe?.expected ?? "-");
		const parsed = JSON.parse(body);
		expect(parsed.session.tools.map((t: { name: string }) => t.name)).toEqual([
			"examinar",
			"medir_presion",
			"mostrar_region",
			"actualizar_estado",
			"terminar_consulta",
		]);
		// La transcripción va activada: se guarda el texto, no el audio.
		expect(parsed.session.audio.input.transcription.model).toBeTruthy();
	});

	test("si la API no acepta eagerness, reintenta sin él", async () => {
		vi.stubEnv("OPENAI_API_KEY", "sk-test");
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("bad", { status: 400 }))
			.mockResolvedValueOnce(Response.json({ value: "ek_2" }));
		vi.stubGlobal("fetch", fetchMock);
		const id = startSession(ana, lucia.id, "hostil");
		expect((await createRealtimeSession(ana, id)).clientSecret).toBe("ek_2");
		const second = JSON.parse(
			String(
				(fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body,
			),
		);
		expect(second.session.audio.input.turn_detection.eagerness).toBeUndefined();
	});

	test("las instrucciones de voz siguen sin el diagnóstico", () => {
		const id = startSession(ana, lucia.id, "mayor");
		const text = voiceInstructions(ana, id);
		expect(text).not.toContain(lucia.truth.diagnosis);
		expect(text).toContain("repitan");
	});
});

describe("herramientas del paciente", () => {
	test("examinar: la claridad decide la apertura", () => {
		const id = startSession(ana, lucia.id, "caso");
		const parcial = runTool(ana, id, "examinar", {
			zona: "garganta",
			claridad: "media",
			consentimiento: true,
		});
		expect(parcial.output.variante).toBe("parcial");
		const completa = runTool(ana, id, "examinar", {
			zona: "orofaringe",
			claridad: "alta",
			consentimiento: true,
		});
		expect(completa.output.variante).toBe("completa");
		expect(completa.ui.kind === "exam" && completa.ui.exam.assetKey).toBe(
			"throat-exudate-01",
		);
		// Al modelo no le llega el hallazgo.
		expect(JSON.stringify(completa.output)).not.toContain("exudado");
		expect(store.listExamActions(id)).toHaveLength(2);
	});

	test("examinar: el paciente hostil no abre sin permiso", () => {
		const id = startSession(ana, lucia.id, "hostil");
		expect(
			runTool(ana, id, "examinar", {
				zona: "boca",
				claridad: "alta",
				consentimiento: false,
			}).output.variante,
		).toBe("negado");
		expect(
			runTool(ana, id, "examinar", {
				zona: "boca",
				claridad: "alta",
				consentimiento: true,
			}).output.variante,
		).toBe("completa");
		expect(store.getSession(id)?.consentGiven).toBe(true);
	});

	test("medir_presion: el valor lo calcula el código y no va al modelo", () => {
		const id = startSession(ana, lucia.id, "caso");
		const run = runTool(ana, id, "medir_presion", {
			pasos_cumplidos: [...BP_STEPS],
		});
		expect(run.ui.kind === "vitals" && run.ui.vitals.shown).toEqual({
			pas: 112,
			pad: 70,
		});
		expect(JSON.stringify(run.output)).not.toContain("112");
		const bad = bloodPressureReading([112, 70], []);
		expect(bad.shown.pas).toBeGreaterThan(112);
		expect(bad.techniqueErrors).toContain("piernas cruzadas");
	});

	test("actualizar_estado: queda entre 0 y 1 y se registra el evento", () => {
		const id = startSession(ana, lucia.id, "caso");
		runTool(ana, id, "actualizar_estado", {
			delta: { confianza: 0.5 },
			motivo: "empatía",
		});
		expect(store.getSession(id)?.state.confianza).toBe(1);
		expect(store.listEvents(id).some((e) => e.type === "cambio_animo")).toBe(
			true,
		);
	});

	test("mostrar_region y terminar_consulta", () => {
		const id = startSession(ana, lucia.id, "caso");
		expect(
			runTool(ana, id, "mostrar_region", { region: "rodilla" }).output
				.disponible,
		).toBe(false);
		expect(runTool(ana, id, "terminar_consulta", {}).ui.kind).toBe("end");
	});

	test("una herramienta desconocida o de otra persona se rechaza", () => {
		const id = startSession(ana, lucia.id, "caso");
		expect(() => runTool(ana, id, "dar_diagnostico", {})).toThrow(
			"desconocida",
		);
		expect(() =>
			runTool(beto, id, "examinar", {
				zona: "boca",
				claridad: "alta",
				consentimiento: true,
			}),
		).toThrow("Sesión no encontrada");
	});
});

describe("turnos de voz", () => {
	test("se guarda la transcripción y el permiso pedido por voz", () => {
		const id = startSession(ana, lucia.id, "caso");
		recordVoiceTurn(
			ana,
			id,
			"estudiante",
			"¿Te puedo revisar la garganta?",
			false,
		);
		expect(store.listTurns(id)[0]?.text).toContain("revisar");
		expect(store.getSession(id)?.consentGiven).toBe(true);
	});

	test("después de los 8 minutos (más el margen) no se acepta", () => {
		const id = startSession(ana, lucia.id, "caso");
		store.updateSession(id, { startedAt: Date.now() - 9 * 60 * 1000 });
		expect(() => recordVoiceTurn(ana, id, "estudiante", "hola", false)).toThrow(
			"8 minutos",
		);
	});
});
