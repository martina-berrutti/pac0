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
import {
	applyExamPose,
	type ExamPoint,
	type ExamPose,
	examPoint,
	loadThree,
} from "@/lib/avatar/exam-poses";
import { Animator, loadLibrary } from "@/lib/avatar/motion";
import { studioLight } from "@/lib/avatar/scene";
import { avatarUrl } from "@/lib/patient/avatars";

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
// inclina. Lente en grados (la vista normal es 10°). Medido sobre el MPFB
// (Lucía); los avatares nuevos tienen los huesos orientados igual y se
// escala por el tamaño de la cabeza (de la cabeza a los ojos).
type Xyz = [number, number, number];
export type FocusPart = "mouth" | "leftEar" | "rightEar";
const FOCUS: Record<FocusPart, { target: Xyz; from: Xyz; fov: number }> = {
	mouth: { target: [0, 0.03, 0.11], from: [0, 0.05, 1], fov: 3.2 },
	// Oídos del paciente: la cámara se va a su costado.
	leftEar: { target: [0.075, 0.074, 0], from: [1, 0.05, 0.2], fov: 3 },
	rightEar: { target: [-0.075, 0.074, 0], from: [-1, 0.05, 0.2], fov: 3 },
};

// De la cabeza al ojo en el MPFB, en metros.
const MPFB_EYE = Math.hypot(0.032, 0.108, 0.089);

// Cuánto más chica o grande es esta cabeza que la del MPFB.
function headScale(h: TalkingHead) {
	const head = h.armature?.getObjectByName("Head");
	const eye = h.armature?.getObjectByName("LeftEye");
	if (!head || !eye) return 1;
	const a = head.getWorldPosition(h.camera.position.clone());
	const b = eye.getWorldPosition(h.camera.position.clone());
	const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
	return d > 0.05 && d < 0.3 ? d / MPFB_EYE : 1;
}

// Dónde mirar y desde dónde, según dónde está ahora la cabeza.
function aim(h: TalkingHead, part: FocusPart, scale = 1) {
	const head = h.armature?.getObjectByName("Head");
	if (!head) return null;
	const v = () => h.camera.position.clone();
	const { target, from } = FOCUS[part];
	const origin = head.getWorldPosition(v());
	const point = head.localToWorld(
		v().set(target[0] * scale, target[1] * scale, target[2] * scale),
	);
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
function followFocus(h: TalkingHead, part: FocusPart, scale: number) {
	const shot = aim(h, part, scale);
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
	// Pose de examen (presión o temperatura); null vuelve a la consulta.
	exam: (pose: ExamPose | null) => void;
	// Mueve la boca como si hablara, sin audio (el clip del inicio).
	mimicSpeech: (ms: number) => void;
	// Dónde está la axila o el brazo en el lienzo (px), o null si no cargó.
	point: (part: ExamPoint) => { x: number; y: number } | null;
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
	avatar,
	sex,
	mood = "neutral",
	className,
	onReady,
}: {
	ref?: Ref<PatientAvatarHandle>;
	// Quién vino (lib/patient/avatars.ts); sin esto, el MPFB de siempre.
	avatar?: string;
	sex?: "f" | "m";
	// Avisa cuando el modelo terminó de cargar (el clip del inicio).
	onReady?: () => void;
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
	// Movimientos aprendidos (lib/avatar/motion.ts), si hay biblioteca.
	const animator = useRef<Animator | null>(null);
	// Volumen de la voz del paciente (0 a 1) y hasta cuándo cuenta que habla.
	const voiceLevel = useRef(0);
	const speakingUntil = useRef(0);
	// Tamaño de la cabeza respecto del MPFB (para el primer plano).
	const scale = useRef(1);
	const moodRef = useRef(mood);
	moodRef.current = mood;
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
					voiceLevel.current = Math.min(1, rms * 4);
					if (rms > JAW_FLOOR * 2)
						speakingUntil.current = performance.now() + 500;
				} else voiceLevel.current = 0;
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
				const url = avatarUrl(avatar);
				await instance.showAvatar(
					{ url, body: sex === "m" ? "M" : "F", avatarMood: "neutral" },
					(e) => {
						if (e?.lengthComputable) setProgress(e.loaded / e.total);
					},
				);
				if (cancelled) return instance.dispose();
				head.current = instance;
				const h = instance;
				scale.current = headScale(h);
				// Los avatares nuevos, con luz de estudio (con la de TalkingHead
				// quedan pálidos).
				if (url !== "/avatar/mpfb.glb")
					await studioLight(h).catch((e) => console.warn("Luz", e));
				// Movimientos reales aprendidos, si hay biblioteca; si no, los de
				// TalkingHead.
				const clips = await loadLibrary();
				if (cancelled) return;
				if (clips) {
					const a = new Animator(h, clips);
					a.voiceLevel = () => voiceLevel.current;
					a.start();
					animator.current = a;
				}
				// Cada cuadro: labios (si hay voz), movimientos y cámara sobre la
				// parte examinada.
				let speaking = false;
				h.opt.update = (dt) => {
					lipsTick.current?.(dt);
					const a = animator.current;
					if (a) {
						const talking = performance.now() < speakingUntil.current;
						if (talking !== speaking) {
							speaking = talking;
							a.situation(moodRef.current, speaking);
						}
						a.step(dt);
					}
					if (focusPart.current)
						followFocus(h, focusPart.current, scale.current);
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
			animator.current = null;
			if (mouthTimer.current) clearTimeout(mouthTimer.current);
			source.current?.disconnect();
			source.current = null;
			lips.current = null;
			head.current = null;
			if (instance) {
				// Sin el manguito ni el termómetro: dispose de TalkingHead se
				// traba con objetos agregados a los huesos.
				void applyExamPose(instance, null);
				try {
					instance.dispose();
				} catch (error) {
					console.warn("Avatar: no se pudo liberar", error);
				}
			}
		};
	}, [attachSpeech, avatar, sex]);

	useEffect(() => {
		if (status !== "listo") return;
		head.current?.setMood(mood);
		animator.current?.situation(mood);
	}, [mood, status]);

	const ready = useRef(onReady);
	ready.current = onReady;
	useEffect(() => {
		if (status === "listo") ready.current?.();
	}, [status]);

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
						if (!focusPart.current) animator.current?.pause(false);
						break;
					}
					// Lo aprendido pisaría la boca abierta: se pausa mientras tanto.
					animator.current?.pause(true);
					h.setFixedValue("jawOpen", 0.9);
					h.setFixedValue("mouthOpen", 0.7);
					h.setFixedValue("tongueOut", action.tongue ? 1 : 0);
					mouthTimer.current = setTimeout(() => {
						for (const mt of ["jawOpen", "mouthOpen", "tongueOut"])
							h.setFixedValue(mt, null);
						if (!focusPart.current) animator.current?.pause(false);
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
		exam(pose) {
			const h = head.current;
			if (h) void applyExamPose(h, pose);
		},
		point(part) {
			const h = head.current;
			const el = node.current;
			if (!h || !el) return null;
			void loadThree();
			return examPoint(h, part, el.clientWidth, el.clientHeight);
		},
		mimicSpeech(ms) {
			const h = head.current;
			if (!h) return;
			const end = performance.now() + ms;
			const tick = () => {
				const left = end - performance.now();
				if (left <= 0 || head.current !== h) {
					setShape(h, "jawOpen", 0);
					return;
				}
				// Sílabas: abre y cierra con un ritmo irregular.
				setShape(h, "jawOpen", 0.08 + Math.random() * 0.22);
				setTimeout(tick, 90 + Math.random() * 70);
			};
			tick();
		},
		focus(part) {
			const h = head.current;
			if (!h) return Promise.resolve();
			baseFov.current ??= h.camera.fov;
			if (!part) {
				focusPart.current = null;
				animator.current?.pause(false);
				if (moving.current) Object.assign(h.opt, moving.current);
				moving.current = null;
				h.setView("head");
				return zoomLens(h, baseFov.current);
			}
			const shot = aim(h, part, scale.current);
			if (!shot) return Promise.resolve();
			// Quieto mientras se examina (la cabeza no se mueve).
			animator.current?.pause(true);
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
