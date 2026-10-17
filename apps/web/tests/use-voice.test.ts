// Cliente de voz (lib/voice/use-voice.ts) con el navegador y Gemini Live
// simulados: micrófono, AudioContext, socket y servidor. Cubre lo que no se
// ve en los tests del servidor: orden de los turnos, cortar a mitad de frase,
// cancelar mientras conecta y mensajes que llegan después de cortar.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Callbacks = {
	onmessage: (m: unknown) => void;
	onclose: () => void;
	onerror: () => void;
};

const live = vi.hoisted(() => ({
	connects: 0,
	callbacks: null as Callbacks | null,
	sent: [] as string[],
	closed: 0,
	failSends: false,
}));

vi.mock("@google/genai", () => ({
	Modality: { AUDIO: "AUDIO" },
	GoogleGenAI: class {
		live = {
			connect: async (opts: { callbacks: Callbacks }) => {
				live.connects++;
				live.callbacks = opts.callbacks;
				const send = (kind: string) => () => {
					if (live.failSends) throw new Error("WebSocket is not open");
					live.sent.push(kind);
				};
				return {
					sendRealtimeInput: send("audio"),
					sendToolResponse: send("toolResponse"),
					sendClientContent: send("clientContent"),
					close: () => {
						live.closed++;
					},
				};
			},
		};
	},
}));

import { useVoice } from "@/lib/voice/use-voice";

// --- Navegador simulado ---------------------------------------------------
let workletPort: { onmessage: ((e: { data: Float32Array }) => void) | null };
const tracks: { stopped: boolean }[] = [];
let gum: () => Promise<unknown>;

class FakeAudioContext {
	sampleRate = 48_000;
	currentTime = 0;
	destination = {};
	audioWorklet = { addModule: async () => {} };
	resume = async () => {};
	close = async () => {};
	createAnalyser() {
		return {
			fftSize: 512,
			connect() {},
			getByteTimeDomainData() {},
		};
	}
	createMediaStreamSource() {
		return { connect() {} };
	}
	createBuffer(_c: number, length: number, rate: number) {
		return { duration: length / rate, copyToChannel() {} };
	}
	createBufferSource() {
		return {
			buffer: null,
			onended: null,
			connect() {},
			start() {},
			stop() {},
		};
	}
}

class FakeWorkletNode {
	port = { onmessage: null };
	constructor() {
		workletPort = this.port;
	}
}

// --- Servidor simulado ----------------------------------------------------
type Call = { path: string; body: Record<string, unknown> };
let calls: Call[];
let delays: Record<string, number>;

function fakeFetch(url: string, init: { body?: string }) {
	const path = url.replace(/^\/api\/sessions\/ses_1/, "");
	const body = init.body ? JSON.parse(init.body) : {};
	const respond = (data: unknown, status = 200) =>
		new Promise((resolve) =>
			setTimeout(
				() => {
					calls.push({ path, body });
					resolve(new Response(JSON.stringify(data), { status }));
				},
				delays[`${path}:${body.speaker ?? body.name ?? ""}`] ?? 1,
			),
		);
	if (url === "/api/voice/session")
		return respond({
			token: "auth_tokens/t",
			apiVersion: "v1beta",
			model: "m",
			remainingMs: 480_000,
		});
	if (path === "/voice-turns")
		return respond({ turn: { id: `t${calls.length}`, ...body } });
	if (path === "/tools")
		return respond({ output: { ok: true }, ui: { kind: "none" } });
	return respond({ ok: true });
}

function mount() {
	const events = { turns: [] as string[], errors: [] as string[] };
	let voice: ReturnType<typeof useVoice> | null = null;
	function Harness() {
		voice = useVoice({
			sessionId: "ses_1",
			onTurn: (t) => events.turns.push(`${t.speaker}:${t.text}`),
			onTool: () => {},
			onEnd: () => {},
			onError: (m) => events.errors.push(m),
		});
		return null;
	}
	renderToString(createElement(Harness));
	if (!voice) throw new Error("sin hook");
	return { voice: voice as ReturnType<typeof useVoice>, events };
}

const msg = (serverContent: Record<string, unknown>) => ({ serverContent });
// Escrituras de la consulta (sin el pedido del token).
const paths = () =>
	calls
		.filter((c) => c.path !== "/api/voice/session")
		.map(
			(c) => `${c.path}:${c.body.speaker ?? c.body.name ?? c.body.type ?? ""}`,
		);

beforeEach(() => {
	Object.assign(live, {
		connects: 0,
		callbacks: null,
		sent: [],
		closed: 0,
		failSends: false,
	});
	calls = [];
	delays = {};
	tracks.length = 0;
	gum = async () => {
		const track = { stopped: false, stop: () => (track.stopped = true) };
		tracks.push(track);
		return { getTracks: () => [track] };
	};
	vi.stubGlobal("AudioContext", FakeAudioContext);
	vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
	vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => gum() } });
	vi.stubGlobal("fetch", fakeFetch);
	vi.stubGlobal("URL", {
		createObjectURL: () => "blob:x",
		revokeObjectURL() {},
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("cliente de voz", () => {
	test("los turnos llegan en orden y el estudiante antes que la herramienta", async () => {
		const { voice } = mount();
		await voice.start();
		// El guardado del estudiante tarda más: igual tiene que ir primero.
		delays["/voice-turns:estudiante"] = 30;
		const on = live.callbacks?.onmessage;
		on?.(
			msg({ inputTranscription: { text: "¿Te puedo revisar? Abrí la boca" } }),
		);
		on?.({
			toolCall: {
				functionCalls: [
					{
						id: "c1",
						name: "examinar",
						args: { zona: "boca", claridad: "alta", consentimiento: true },
					},
				],
			},
		});
		on?.(msg({ outputTranscription: { text: "Aaaa" } }));
		on?.(msg({ turnComplete: true }));
		await voice.drain();
		expect(paths()).toEqual([
			"/voice-turns:estudiante",
			"/tools:examinar",
			"/voice-turns:paciente",
		]);
		// La respuesta de la herramienta vuelve al modelo.
		await vi.waitFor(() => expect(live.sent).toContain("toolResponse"));
	});

	test("al cortar a mitad de frase se guarda lo que se estaba diciendo", async () => {
		const { voice, events } = mount();
		await voice.start();
		live.callbacks?.onmessage(
			msg({ inputTranscription: { text: "Y desde cuándo" } }),
		);
		voice.stop();
		await voice.drain();
		expect(events.turns).toEqual(["estudiante:Y desde cuándo"]);
		expect(live.closed).toBe(1);
		expect(tracks[0]?.stopped).toBe(true);
	});

	test("los mensajes que llegan después de cortar se ignoran", async () => {
		const { voice } = mount();
		await voice.start();
		const late = live.callbacks;
		voice.stop();
		late?.onmessage({
			toolCall: { functionCalls: [{ id: "c", name: "examinar", args: {} }] },
		});
		late?.onmessage(msg({ inputTranscription: { text: "hola" } }));
		late?.onmessage(msg({ turnComplete: true }));
		await voice.drain();
		expect(paths()).toEqual([]);
	});

	test("si se corta mientras pide el micrófono, no pide token ni conecta", async () => {
		let release: () => void = () => {};
		const base = gum;
		gum = () =>
			new Promise((resolve) => {
				release = () => resolve(base());
			});
		const { voice } = mount();
		const started = voice.start();
		voice.stop();
		release();
		await started;
		expect(live.connects).toBe(0);
		expect(calls).toEqual([]);
		expect(tracks[0]?.stopped).toBe(true);
	});

	test("micrófono bloqueado: mensaje claro y sin gastar el token", async () => {
		gum = async () => {
			throw new DOMException("denied", "NotAllowedError");
		};
		const { voice, events } = mount();
		await voice.start();
		expect(events.errors[0]).toContain("bloqueó el micrófono");
		expect(calls).toEqual([]);
	});

	test("mandar audio por un socket cerrado no tira excepciones", async () => {
		const { voice } = mount();
		await voice.start();
		live.failSends = true;
		expect(() =>
			workletPort.onmessage?.({ data: new Float32Array(48_000 / 10) }),
		).not.toThrow();
	});

	test("interrupted sin audio sonando no cuenta como interrupción", async () => {
		const { voice } = mount();
		await voice.start();
		live.callbacks?.onmessage(msg({ interrupted: true }));
		await voice.drain();
		expect(paths()).not.toContain("/events:interrupcion_estudiante");
	});

	test("interrupted con el paciente hablando sí cuenta", async () => {
		const { voice } = mount();
		await voice.start();
		const on = live.callbacks?.onmessage;
		// Un poco de audio del paciente (PCM de 16 bits en base64).
		on?.(msg({ modelTurn: { parts: [{ inlineData: { data: "AAAAAA==" } }] } }));
		on?.(msg({ outputTranscription: { text: "Mirá, hace dos" } }));
		on?.(msg({ interrupted: true }));
		await voice.drain();
		expect(paths()).toContain("/events:interrupcion_estudiante");
		const cut = calls.find((c) => c.body.speaker === "paciente");
		expect(cut?.body).toMatchObject({ text: "Mirá, hace dos", overlap: true });
	});

	test("un pedido colgado no traba la fila: se corta y siguen los demás", async () => {
		const { voice, events } = mount();
		await voice.start();
		// El timeout real es de 15 s; acá se acorta.
		const realTimeout = AbortSignal.timeout.bind(AbortSignal);
		vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(20));
		const base = fakeFetch;
		let hung = true;
		vi.stubGlobal(
			"fetch",
			(url: string, init: { body?: string; signal?: AbortSignal }) => {
				if (hung && url.endsWith("/voice-turns")) {
					hung = false;
					return new Promise((_, reject) =>
						init.signal?.addEventListener("abort", () =>
							reject(new Error("abort")),
						),
					);
				}
				return base(url, init);
			},
		);
		const on = live.callbacks?.onmessage;
		on?.(msg({ inputTranscription: { text: "primera" } }));
		on?.(msg({ turnComplete: true }));
		on?.(msg({ inputTranscription: { text: "segunda" } }));
		on?.(msg({ turnComplete: true }));
		await voice.drain();
		expect(events.errors[0]).toContain("no respondió");
		expect(events.turns).toEqual(["estudiante:segunda"]);
	});

	test("si se corta solo, reconecta y guarda lo pendiente antes de pedir el token", async () => {
		const { voice, events } = mount();
		await voice.start();
		const first = live.callbacks;
		first?.onmessage(msg({ inputTranscription: { text: "Y la fiebre" } }));
		calls = [];
		first?.onclose();
		await vi.waitFor(() => expect(live.connects).toBe(2));
		// Lo dicho se guardó antes del token nuevo, así el paciente lo recibe.
		expect(calls.map((c) => c.path)).toEqual([
			"/voice-turns",
			"/api/voice/session",
		]);
		expect(events.turns).toEqual(["estudiante:Y la fiebre"]);
		expect(live.closed).toBe(1);
	});

	test("goAway de Google reconecta antes del corte", async () => {
		const { voice } = mount();
		await voice.start();
		live.callbacks?.onmessage({ goAway: { timeLeft: "5s" } });
		await vi.waitFor(() => expect(live.connects).toBe(2));
	});

	test("los avisos de la conexión vieja no hacen nada después de reconectar", async () => {
		const { voice } = mount();
		await voice.start();
		const first = live.callbacks;
		first?.onclose();
		await vi.waitFor(() => expect(live.connects).toBe(2));
		calls = [];
		first?.onmessage({
			toolCall: {
				functionCalls: [{ id: "viejo", name: "examinar", args: {} }],
			},
		});
		first?.onclose();
		await voice.drain();
		expect(paths()).toEqual([]);
		expect(live.connects).toBe(2);
	});

	test("la respuesta de una herramienta no va a la conexión nueva", async () => {
		const { voice } = mount();
		await voice.start();
		delays["/tools:examinar"] = 30;
		const first = live.callbacks;
		first?.onmessage({
			toolCall: {
				functionCalls: [
					{
						id: "c1",
						name: "examinar",
						args: { zona: "boca", claridad: "alta", consentimiento: true },
					},
				],
			},
		});
		// Se corta mientras la herramienta está en camino. La reconexión guarda
		// lo pendiente en la fila, detrás de la herramienta, así que la respuesta
		// se resuelve antes de que exista la conexión nueva (y además runTools
		// solo responde a la conexión que la pidió).
		first?.onclose();
		await vi.waitFor(() => expect(live.connects).toBe(2));
		await voice.drain();
		await new Promise((r) => setTimeout(r, 50));
		expect(live.sent).not.toContain("toolResponse");
	});

	test("después de 3 reconexiones avisa y corta", async () => {
		const { voice, events } = mount();
		await voice.start();
		for (let i = 2; i <= 4; i++) {
			live.callbacks?.onclose();
			await vi.waitFor(() => expect(live.connects).toBe(i));
		}
		live.callbacks?.onclose();
		await vi.waitFor(() => expect(events.errors.at(-1)).toContain("Se cortó"));
		expect(live.connects).toBe(4);
	});
});
