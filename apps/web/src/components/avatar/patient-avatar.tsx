"use client";

// Avatar 3D del paciente con TalkingHead (MIT) y labios por audio con
// HeadAudio (MIT), Persona 3. El modelo y los archivos de HeadAudio viven en
// public/avatar; las licencias están en CREDITS.md.
import type { TalkingHead } from "@met4citizen/talkinghead";
import {
	type Ref,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

import { type AvatarAction, FACES, type Mood } from "@/lib/avatar/commands";

const AVATAR_URL = "/avatar/mpfb.glb";
const WORKLET_URL = "/avatar/headworklet.min.mjs";
const MODEL_URL = "/avatar/model-en-mixed.bin";
// Cuánto queda la boca abierta por una orden.
const MOUTH_MS = 4000;
// Mandíbula por volumen: la voz de Gemini anda en 0,1 de RMS hablando y
// llega a 0,3 en los picos (medido en la consulta).
const JAW_FLOOR = 0.015;
const JAW_GAIN = 3;
const JAW_MAX = 0.5;

// Lo que dura el recorrido de cámara de TalkingHead (1 s).
const FOCUS_MS = 1000;
// OrbitControls de TalkingHead no deja acercar la cámara a menos de 2 m: el
// primer plano gira la cámara a esa distancia y cierra el lente (zoom).
const CAMERA_DISTANCE = 2;
// Punto a mirar y dirección desde donde se mira, en metros en el sistema del
// hueso Head (x a la izquierda del paciente, y arriba, z adelante; los ojos
// están en ±0,032, 0,108, 0,089): así siguen a la cabeza si gira o se
// inclina. Lente en grados (la vista normal es 10°). Medido sobre el MPFB.
type Xyz = [number, number, number];
export type FocusPart = "mouth" | "leftEar" | "rightEar";
const FOCUS: Record<FocusPart, { target: Xyz; from: Xyz; fov: number }> = {
	mouth: { target: [0, 0.03, 0.11], from: [0, 0.05, 1], fov: 3.2 },
	// Oídos del paciente: la cámara se va a su costado.
	leftEar: { target: [0.075, 0.074, 0], from: [1, 0.05, 0.2], fov: 3 },
	rightEar: { target: [-0.075, 0.074, 0], from: [-1, 0.05, 0.2], fov: 3 },
};

// Dónde mirar y desde dónde, según dónde está ahora la cabeza.
function aim(h: TalkingHead, part: FocusPart) {
	const head = h.armature?.getObjectByName("Head");
	if (!head) return null;
	const v = () => h.camera.position.clone();
	const { target, from } = FOCUS[part];
	const origin = head.getWorldPosition(v());
	const point = head.localToWorld(v().set(...target));
	// La dirección también gira con la cabeza.
	const dir = head
		.localToWorld(
			v()
				.set(...from)
				.normalize(),
		)
		.sub(origin)
		.normalize();
	const camera = point.clone().add(dir.multiplyScalar(CAMERA_DISTANCE));
	return { target: point, camera };
}

// Con la parte en primer plano, la cámara la sigue: durante el recorrido
// corrige el destino y después se queda encima.
function followFocus(h: TalkingHead, part: FocusPart) {
	const shot = aim(h, part);
	if (!shot) return;
	if (h.cameraClock !== null && h.cameraClock < 1000) {
		h.controlsEnd = shot.target;
		h.cameraEnd = shot.camera;
		return;
	}
	h.controls.target.copy(shot.target);
	h.camera.position.copy(shot.camera);
	h.controls.update();
}

// Zoom de lente animado, con el mismo suavizado que la cámara.
function zoomLens(h: TalkingHead, to: number, ms = FOCUS_MS) {
	const from = h.camera.fov;
	const start = performance.now();
	return new Promise<void>((resolve) => {
		const step = (t: number) => {
			const k = Math.min(1, (t - start) / ms);
			const ease = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
			h.camera.fov = from + (to - from) * ease;
			h.camera.updateProjectionMatrix();
			if (k < 1) requestAnimationFrame(step);
			else resolve();
		};
		requestAnimationFrame(step);
	});
}
// Mientras se examina, la cabeza queda quieta y sin buscar la cámara.
const STILL = {
	avatarIdleEyeContact: 0,
	avatarSpeakingEyeContact: 0,
	avatarIdleHeadMove: 0,
	avatarSpeakingHeadMove: 0,
};

type Lips = { detector: AudioNode; meter: AnalyserNode };

// Valor en tiempo real de una forma de la cara (el canal que usa HeadAudio).
function setShape(h: TalkingHead, key: string, value: number) {
	const mt = h.mtAvatar[key];
	if (mt) Object.assign(mt, { newvalue: value, needsUpdate: true });
}

export type PatientAvatarHandle = {
	run: (action: AvatarAction) => void;
	// Llamarlo dentro de un clic: Safari solo deja arrancar el audio así.
	unlockAudio: () => void;
	// Conecta un audio (micrófono o voz del paciente) para mover los labios.
	// Si el avatar todavía carga, se conecta apenas termine.
	connectSpeech: (stream: MediaStream) => Promise<void>;
	disconnectSpeech: () => void;
	// Lleva la cámara a la boca o al oído (null: vuelve a la cara). Se
	// resuelve cuando termina el recorrido.
	focus: (part: FocusPart | null) => Promise<void>;
};

type Status = "cargando" | "listo" | "error";

let meshoptReady = false;

// El modelo viene comprimido con meshopt (de 37 a 4 MB) y TalkingHead no le
// pasa el decodificador a su GLTFLoader: se lo agregamos una sola vez.
async function enableMeshopt() {
	if (meshoptReady) return;
	const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
		import("three/addons/loaders/GLTFLoader.js"),
		import("three/addons/libs/meshopt_decoder.module.js"),
	]);
	if (meshoptReady) return;
	meshoptReady = true;
	const parse = GLTFLoader.prototype.parse;
	GLTFLoader.prototype.parse = function (...args) {
		this.setMeshoptDecoder(MeshoptDecoder);
		return parse.apply(this, args);
	};
}

export function PatientAvatar({
	ref,
	mood = "neutral",
	className,
}: {
	ref?: Ref<PatientAvatarHandle>;
	// Ánimo de base; las órdenes con run() se suman encima.
	mood?: Mood;
	className?: string;
}) {
	const node = useRef<HTMLDivElement>(null);
	const head = useRef<TalkingHead | null>(null);
	const lips = useRef<Promise<Lips> | null>(null);
	const speech = useRef<MediaStream | null>(null);
	const source = useRef<MediaStreamAudioSourceNode | null>(null);
	const mouthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Movimiento de cabeza guardado mientras la cámara está en primer plano.
	const moving = useRef<Record<string, unknown> | null>(null);
	// Lente de la vista normal, para volver del primer plano.
	const baseFov = useRef<number | null>(null);
	// Parte en primer plano: la cámara la sigue en cada cuadro.
	const focusPart = useRef<FocusPart | null>(null);
	// Labios en cada cuadro (cuando hay voz).
	const lipsTick = useRef<((dt: number) => void) | null>(null);
	const [status, setStatus] = useState<Status>("cargando");
	const [progress, setProgress] = useState(0);

	// Detector de labios y medidor de volumen, una sola vez por avatar.
	const loadLips = useCallback((h: TalkingHead) => {
		lips.current ??= (async () => {
			await h.audioCtx.audioWorklet.addModule(WORKLET_URL);
			const { HeadAudio } = await import(
				"@met4citizen/headaudio/dist/headaudio.min.mjs"
			);
			const detector = new HeadAudio(h.audioCtx);
			await detector.loadModel(MODEL_URL);
			detector.onvalue = (key, value) => setShape(h, key, value);
			const meter = h.audioCtx.createAnalyser();
			meter.fftSize = 512;
			const samples = new Float32Array(meter.fftSize);
			let jaw = 0;
			lipsTick.current = (dt) => {
				detector.update(dt);
				// HeadAudio está entrenado en inglés: con la voz en castellano
				// las formas de la boca salen sutiles. La mandíbula se abre con el
				// volumen, que anda en cualquier idioma.
				let target = 0;
				if (source.current) {
					meter.getFloatTimeDomainData(samples);
					let sum = 0;
					for (const v of samples) sum += v * v;
					const rms = Math.sqrt(sum / samples.length);
					target = Math.min(JAW_MAX, Math.max(0, (rms - JAW_FLOOR) * JAW_GAIN));
				}
				const next = jaw + (target - jaw) * (target > jaw ? 0.6 : 0.25);
				if (Math.abs(next - jaw) > 0.002 || (next === 0 && jaw !== 0)) {
					jaw = next < 0.005 ? 0 : next;
					setShape(h, "jawOpen", jaw);
				}
			};
			return { detector, meter };
		})();
		// Si falla la carga (red lenta), el próximo intento vuelve a probar.
		const loading = lips.current;
		loading.catch(() => {
			if (lips.current === loading) lips.current = null;
		});
		return loading;
	}, []);

	// Conecta la voz pendiente al detector de labios, si ya hay avatar.
	// Sin labios el avatar igual anda: un error acá no rompe la consulta.
	const attachSpeech = useCallback(async () => {
		const h = head.current;
		const stream = speech.current;
		if (!h || !stream) return;
		let loaded: Awaited<ReturnType<typeof loadLips>>;
		try {
			await h.audioCtx.resume();
			loaded = await loadLips(h);
		} catch (error) {
			console.warn("No se pudo cargar el movimiento de la boca", error);
			return;
		}
		const { detector, meter } = loaded;
		// Se cortó o cambió mientras cargaba.
		if (speech.current !== stream || head.current !== h) return;
		source.current?.disconnect();
		// Va solo al detector y al medidor, no a los parlantes (sin eco).
		source.current = h.audioCtx.createMediaStreamSource(stream);
		source.current.connect(detector);
		source.current.connect(meter);
	}, [loadLips]);

	useEffect(() => {
		let cancelled = false;
		let instance: TalkingHead | null = null;
		(async () => {
			try {
				// Solo en el navegador: TalkingHead usa WebGL y Web Audio.
				const [{ TalkingHead }] = await Promise.all([
					import("@met4citizen/talkinghead"),
					enableMeshopt(),
				]);
				if (cancelled || !node.current) return;
				instance = new TalkingHead(node.current, {
					// Arranca en la cara, lo más cerca del tamaño real. Los gestos
					// con las manos se ven recién en "mid" o "full".
					cameraView: "head",
					// En pantallas de alta densidad el 3D se dibuja a 1,5x como
					// máximo: casi igual de nítido y mucho más liviano.
					modelPixelRatio: Math.min(1, 1.5 / window.devicePixelRatio),
					// Sin módulos de lipsync por texto: los labios salen del audio.
					lipsyncModules: [],
					// Que un arrastre sin querer no gire al paciente.
					cameraRotateEnable: false,
					avatarIdleEyeContact: 0.4,
					avatarSpeakingEyeContact: 0.7,
				});
				await instance.showAvatar(
					{ url: AVATAR_URL, body: "F", avatarMood: "neutral" },
					(e) => {
						if (e?.lengthComputable) setProgress(e.loaded / e.total);
					},
				);
				if (cancelled) return instance.dispose();
				head.current = instance;
				// Cada cuadro: labios (si hay voz) y cámara sobre la parte examinada.
				const h = instance;
				h.opt.update = (dt) => {
					lipsTick.current?.(dt);
					if (focusPart.current) followFocus(h, focusPart.current);
				};
				setStatus("listo");
				await attachSpeech();
			} catch (error) {
				console.error("Avatar", error);
				if (!cancelled) setStatus("error");
			}
		})();
		return () => {
			cancelled = true;
			if (mouthTimer.current) clearTimeout(mouthTimer.current);
			source.current?.disconnect();
			source.current = null;
			lips.current = null;
			head.current = null;
			instance?.dispose();
		};
	}, [attachSpeech]);

	useEffect(() => {
		if (status === "listo") head.current?.setMood(mood);
	}, [mood, status]);

	useImperativeHandle(ref, () => ({
		run(action) {
			const h = head.current;
			if (!h) return;
			switch (action.kind) {
				case "mood":
					h.setMood(action.mood);
					break;
				case "gesture":
					h.playGesture(action.gesture, 4);
					break;
				case "face":
					h.speakEmoji(FACES[action.face].emoji);
					break;
				case "eyes":
					h.makeEyeContact(3000);
					break;
				case "view":
					h.setView(action.view);
					break;
				case "mouth": {
					if (mouthTimer.current) clearTimeout(mouthTimer.current);
					if (action.ms === 0) {
						for (const mt of ["jawOpen", "mouthOpen", "tongueOut"])
							h.setFixedValue(mt, null);
						break;
					}
					h.setFixedValue("jawOpen", 0.9);
					h.setFixedValue("mouthOpen", 0.7);
					h.setFixedValue("tongueOut", action.tongue ? 1 : 0);
					mouthTimer.current = setTimeout(() => {
						for (const mt of ["jawOpen", "mouthOpen", "tongueOut"])
							h.setFixedValue(mt, null);
					}, action.ms ?? MOUTH_MS);
					break;
				}
			}
		},
		unlockAudio() {
			head.current?.audioCtx.resume();
		},
		connectSpeech(stream) {
			speech.current = stream;
			return attachSpeech();
		},
		disconnectSpeech() {
			speech.current = null;
			source.current?.disconnect();
			source.current = null;
		},
		focus(part) {
			const h = head.current;
			if (!h) return Promise.resolve();
			baseFov.current ??= h.camera.fov;
			if (!part) {
				focusPart.current = null;
				if (moving.current) Object.assign(h.opt, moving.current);
				moving.current = null;
				h.setView("head");
				return zoomLens(h, baseFov.current);
			}
			const shot = aim(h, part);
			if (!shot) return Promise.resolve();
			moving.current ??= Object.fromEntries(
				Object.keys(STILL).map((k) => [k, h.opt[k]]),
			);
			Object.assign(h.opt, STILL);
			// El mismo recorrido animado que usa setView, hacia la boca o el oído.
			// Después, followFocus mantiene la cámara encima aunque la cabeza se
			// mueva.
			h.controlsStart = h.controls.target.clone();
			h.cameraStart = h.camera.position.clone();
			h.controlsEnd = shot.target;
			h.cameraEnd = shot.camera;
			h.cameraClock = 0;
			focusPart.current = part;
			return zoomLens(h, FOCUS[part].fov);
		},
	}));

	return (
		// Sin posición en className, relative (el canvas va en absolute adentro).
		<div
			className={
				/\b(absolute|fixed|relative)\b/.test(className ?? "")
					? className
					: `relative ${className ?? ""}`
			}
		>
			<div ref={node} className="absolute inset-0" />
			{status !== "listo" && (
				<p className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
					{status === "error"
						? "No pudimos cargar el avatar."
						: `Cargando avatar… ${Math.round(progress * 100)}%`}
				</p>
			)}
		</div>
	);
}
