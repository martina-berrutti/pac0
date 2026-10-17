"use client";

// Avatar 3D del paciente con TalkingHead (MIT) y labios por audio con
// HeadAudio (MIT), Persona 3. El modelo y los archivos de HeadAudio viven en
// public/avatar; las licencias están en CREDITS.md.
import type { TalkingHead } from "@met4citizen/talkinghead";
import {
	type Ref,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

import { type AvatarAction, FACES } from "@/lib/avatar/commands";

const AVATAR_URL = "/avatar/mpfb.glb";
const WORKLET_URL = "/avatar/headworklet.min.mjs";
const MODEL_URL = "/avatar/model-en-mixed.bin";
// Cuánto queda la boca abierta por una orden.
const MOUTH_MS = 4000;

export type PatientAvatarHandle = {
	run: (action: AvatarAction) => void;
	// Conecta un audio (micrófono o voz del paciente) para mover los labios.
	connectSpeech: (stream: MediaStream) => Promise<void>;
	disconnectSpeech: () => void;
};

type Status = "cargando" | "listo" | "error";

export function PatientAvatar({
	ref,
	className,
}: {
	ref?: Ref<PatientAvatarHandle>;
	className?: string;
}) {
	const node = useRef<HTMLDivElement>(null);
	const head = useRef<TalkingHead | null>(null);
	const lips = useRef<AudioNode | null>(null);
	const source = useRef<MediaStreamAudioSourceNode | null>(null);
	const mouthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [status, setStatus] = useState<Status>("cargando");
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		let cancelled = false;
		let instance: TalkingHead | null = null;
		(async () => {
			try {
				// Solo en el navegador: TalkingHead usa WebGL y Web Audio.
				const [{ TalkingHead }, { GLTFLoader }, { MeshoptDecoder }] =
					await Promise.all([
						import("@met4citizen/talkinghead"),
						import("three/addons/loaders/GLTFLoader.js"),
						import("three/addons/libs/meshopt_decoder.module.js"),
					]);
				// El modelo viene comprimido con meshopt (de 37 a 4 MB) y TalkingHead
				// no le pasa el decodificador a su GLTFLoader: se lo agregamos.
				const parse = GLTFLoader.prototype.parse;
				GLTFLoader.prototype.parse = function (...args) {
					this.setMeshoptDecoder(MeshoptDecoder);
					return parse.apply(this, args);
				};
				if (cancelled || !node.current) return;
				instance = new TalkingHead(node.current, {
					// Arranca en la cara, lo más cerca del tamaño real. Los gestos
					// con las manos se ven recién en "mid" o "full".
					cameraView: "head",
					// Sin módulos de lipsync por texto: los labios salen del audio.
					lipsyncModules: [],
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
				setStatus("listo");
			} catch (error) {
				console.error("Avatar", error);
				if (!cancelled) setStatus("error");
			}
		})();
		return () => {
			cancelled = true;
			if (mouthTimer.current) clearTimeout(mouthTimer.current);
			source.current?.disconnect();
			head.current = null;
			instance?.dispose();
		};
	}, []);

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
					h.setFixedValue("jawOpen", 0.9);
					h.setFixedValue("mouthOpen", 0.7);
					h.setFixedValue("tongueOut", action.tongue ? 1 : 0);
					mouthTimer.current = setTimeout(() => {
						for (const mt of ["jawOpen", "mouthOpen", "tongueOut"])
							h.setFixedValue(mt, null);
					}, MOUTH_MS);
					break;
				}
			}
		},
		async connectSpeech(stream) {
			const h = head.current;
			if (!h) return;
			await h.audioCtx.resume();
			if (!lips.current) {
				await h.audioCtx.audioWorklet.addModule(WORKLET_URL);
				const { HeadAudio } = await import(
					"@met4citizen/headaudio/dist/headaudio.min.mjs"
				);
				const node = new HeadAudio(h.audioCtx);
				await node.loadModel(MODEL_URL);
				node.onvalue = (key, value) => {
					Object.assign(h.mtAvatar[key] ?? {}, {
						newvalue: value,
						needsUpdate: true,
					});
				};
				h.opt.update = node.update.bind(node);
				lips.current = node;
			}
			source.current?.disconnect();
			// Va solo al detector de labios, no a los parlantes (sin eco).
			source.current = h.audioCtx.createMediaStreamSource(stream);
			source.current.connect(lips.current);
		},
		disconnectSpeech() {
			source.current?.disconnect();
			source.current = null;
		},
	}));

	return (
		<div className={`relative ${className ?? ""}`}>
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
