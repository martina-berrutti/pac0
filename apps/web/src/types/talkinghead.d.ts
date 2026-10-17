// Tipos mínimos de TalkingHead y HeadAudio (no traen los suyos). Solo lo que
// usa components/avatar.

declare module "@met4citizen/talkinghead" {
	// Vector3 de three, solo lo que se usa.
	export interface Vec3 {
		x: number;
		y: number;
		z: number;
		clone(): Vec3;
		add(v: Vec3): Vec3;
		set(x: number, y: number, z: number): Vec3;
		multiplyScalar(s: number): Vec3;
		normalize(): Vec3;
		copy(v: Vec3): Vec3;
		sub(v: Vec3): Vec3;
	}

	export class TalkingHead {
		constructor(node: HTMLElement, opt?: Record<string, unknown>);
		opt: Record<string, unknown> & { update: ((dt: number) => void) | null };
		armature: {
			getObjectByName(name: string):
				| {
						getWorldPosition(target: Vec3): Vec3;
						localToWorld(v: Vec3): Vec3;
				  }
				| undefined;
		} | null;
		camera: { position: Vec3; fov: number; updateProjectionMatrix(): void };
		controls: { target: Vec3; update(): void };
		// Recorrido de cámara de setView (1 s): se puede apuntar a cualquier lado.
		cameraClock: number | null;
		cameraStart: Vec3;
		cameraEnd: Vec3;
		controlsStart: Vec3;
		controlsEnd: Vec3;
		audioCtx: AudioContext;
		audioSpeechGainNode: GainNode;
		audioReverbNode: AudioNode;
		mtAvatar: Record<string, Record<string, unknown>>;
		showAvatar(
			avatar: { url: string } & Record<string, unknown>,
			// GLTFLoader de three pasa solo el evento.
			onprogress?: (event?: ProgressEvent) => void,
		): Promise<void>;
		setMood(mood: string): void;
		setView(view: string, opt?: Record<string, unknown>): void;
		playGesture(
			name: string,
			dur?: number,
			mirror?: boolean,
			ms?: number,
		): void;
		stopGesture(ms?: number): void;
		speakEmoji(emoji: string): Promise<void>;
		makeEyeContact(ms: number): void;
		setFixedValue(mt: string, value: number | null, ms?: number | null): void;
		start(): void;
		stop(): void;
		dispose(): void;
	}
}

// three no trae tipos (habría que sumar @types/three): solo lo que hace falta
// para darle el decodificador de meshopt al GLTFLoader que usa TalkingHead.
declare module "three/addons/loaders/GLTFLoader.js" {
	export class GLTFLoader {
		parse(...args: unknown[]): void;
		setMeshoptDecoder(decoder: unknown): this;
	}
}

declare module "three/addons/libs/meshopt_decoder.module.js" {
	export const MeshoptDecoder: unknown;
}

declare module "@met4citizen/headaudio/dist/headaudio.min.mjs" {
	export class HeadAudio extends AudioWorkletNode {
		constructor(
			ctx: BaseAudioContext,
			opt?: {
				processorOptions?: Record<string, unknown>;
				parameterData?: Record<string, number>;
			},
		);
		loadModel(url: string): Promise<void>;
		update(dt: number): void;
		onvalue: ((key: string, value: number) => void) | null;
	}
}
