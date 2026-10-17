// Tipos mínimos de TalkingHead y HeadAudio (no traen los suyos). Solo lo que
// usa components/avatar.

declare module "@met4citizen/talkinghead" {
	export class TalkingHead {
		constructor(node: HTMLElement, opt?: Record<string, unknown>);
		opt: Record<string, unknown> & { update: ((dt: number) => void) | null };
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
