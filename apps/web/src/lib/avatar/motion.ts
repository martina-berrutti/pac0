// El paciente se mueve solo con movimientos reales aprendidos (motion
// matching), Persona 3. Es la versión para Paco de avatares/visor/
// movimiento.mjs: la biblioteca son grabaciones de alguien del equipo
// actuando de paciente (avatares/visor/entrenar.html), solo números (las 52
// formas de la cara, cabeza, torso, hombros y volumen de voz), nunca imagen
// ni audio. Va en public/avatar/movimientos.json; si no está, el avatar se
// mueve con lo de TalkingHead, como antes.
//
// En cada momento toma un pedazo de una grabación de la situación (escuchando,
// hablando, preocupado...) y lo encadena con el que mejor sigue la postura de
// ahora, con un fundido corto: no se ve el corte ni se repite igual.
import type { TalkingHead } from "@met4citizen/talkinghead";

import type { Mood } from "./commands";

const EXPRESSIONS = [
	"browDownLeft",
	"browDownRight",
	"browInnerUp",
	"browOuterUpLeft",
	"browOuterUpRight",
	"cheekPuff",
	"cheekSquintLeft",
	"cheekSquintRight",
	"eyeBlinkLeft",
	"eyeBlinkRight",
	"eyeLookDownLeft",
	"eyeLookDownRight",
	"eyeLookInLeft",
	"eyeLookInRight",
	"eyeLookOutLeft",
	"eyeLookOutRight",
	"eyeLookUpLeft",
	"eyeLookUpRight",
	"eyeSquintLeft",
	"eyeSquintRight",
	"eyeWideLeft",
	"eyeWideRight",
	"jawForward",
	"jawLeft",
	"jawOpen",
	"jawRight",
	"mouthClose",
	"mouthDimpleLeft",
	"mouthDimpleRight",
	"mouthFrownLeft",
	"mouthFrownRight",
	"mouthFunnel",
	"mouthLeft",
	"mouthLowerDownLeft",
	"mouthLowerDownRight",
	"mouthPressLeft",
	"mouthPressRight",
	"mouthPucker",
	"mouthRight",
	"mouthRollLower",
	"mouthRollUpper",
	"mouthShrugLower",
	"mouthShrugUpper",
	"mouthSmileLeft",
	"mouthSmileRight",
	"mouthStretchLeft",
	"mouthStretchRight",
	"mouthUpperUpLeft",
	"mouthUpperUpRight",
	"noseSneerLeft",
	"noseSneerRight",
	"tongueOut",
];
const POSTURE = [
	"headRotateX",
	"headRotateY",
	"headRotateZ",
	"torsoX",
	"torsoY",
	"torsoZ",
	"hombroL",
	"hombroR",
];
const CHANNELS = [...EXPRESSIONS, ...POSTURE, "voz"];
const idx: Record<string, number> = Object.fromEntries(
	CHANNELS.map((c, i) => [c, i]),
);
const HEAD = ["headRotateX", "headRotateY", "headRotateZ"];

// Lo que decide si un pedazo "sigue" bien al anterior.
const FEATURES = [
	"headRotateX",
	"headRotateY",
	"headRotateZ",
	"torsoX",
	"torsoY",
	"torsoZ",
	"browInnerUp",
	"browDownLeft",
	"eyeLookUpLeft",
	"eyeLookDownLeft",
	"eyeLookInLeft",
	"eyeLookOutLeft",
	"mouthSmileLeft",
	"mouthFrownLeft",
	"eyeSquintLeft",
];
const WEIGHT: Record<string, number> = {
	headRotateX: 6,
	headRotateY: 6,
	headRotateZ: 6,
	torsoX: 3,
	torsoY: 3,
	torsoZ: 3,
};
// Hablando, la boca es de los labios: estos canales no se copian.
const MOUTH = new Set([
	"jawOpen",
	"jawForward",
	"jawLeft",
	"jawRight",
	"mouthClose",
	"mouthFunnel",
	"mouthPucker",
	"mouthLowerDownLeft",
	"mouthLowerDownRight",
	"mouthUpperUpLeft",
	"mouthUpperUpRight",
	"mouthRollLower",
	"mouthRollUpper",
	"mouthPressLeft",
	"mouthPressRight",
	"mouthStretchLeft",
	"mouthStretchRight",
	"mouthShrugLower",
	"mouthShrugUpper",
	"tongueOut",
]);
const FADE_MS = 350;

// La situación grabada que corresponde a la cara del paciente.
const SITUATION: Record<Mood, string> = {
	neutral: "escuchando",
	happy: "aliviado",
	angry: "molesto",
	disgust: "molesto",
	fear: "preocupado",
	sad: "dolor",
	sleep: "escuchando",
};

type Frame = { t: number; v: Float32Array };
type Clip = { estado: string; duracion: number; frames: Frame[] };
type RawClip = {
	estado: string;
	duracion: number;
	canales: string[];
	cuadros: number[][];
};

export function parseLibrary(data: { clips?: RawClip[] }): Clip[] {
	return (data.clips ?? [])
		.filter((c) => c.duracion >= 1200 && c.cuadros.length > 10)
		.map((c) => {
			// Los canales pueden venir en otro orden (grabaciones viejas).
			const order = c.canales.map((name) => idx[name]);
			const frames = c.cuadros.map((row) => {
				const v = new Float32Array(CHANNELS.length);
				row.slice(1).forEach((x, i) => {
					const k = order[i];
					if (k !== undefined) v[k] = x;
				});
				return { t: row[0] ?? 0, v };
			});
			return { estado: c.estado, duracion: c.duracion, frames };
		});
}

function distance(a: Float32Array, b: Float32Array) {
	let d = 0;
	for (const f of FEATURES) {
		const i = idx[f] as number;
		d += (WEIGHT[f] ?? 1) * ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
	}
	return d;
}

// Valor de un pedazo en un tiempo (interpolando entre cuadros).
function sample(clip: Clip, t: number) {
	const q = clip.frames;
	let lo = 0;
	let hi = q.length - 1;
	while (hi - lo > 1) {
		const m = (lo + hi) >> 1;
		if ((q[m] as Frame).t <= t) lo = m;
		else hi = m;
	}
	const a = q[lo] as Frame;
	const b = q[hi] as Frame;
	const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
	const v = new Float32Array(CHANNELS.length);
	for (let i = 0; i < v.length; i++)
		v[i] = (a.v[i] ?? 0) + ((b.v[i] ?? 0) - (a.v[i] ?? 0)) * f;
	return v;
}

function voiceAround(clip: Clip, t: number, ms = 1000) {
	let s = 0;
	let n = 0;
	const k = idx.voz as number;
	for (const q of clip.frames)
		if (q.t >= t && q.t < t + ms) {
			s += q.v[k] ?? 0;
			n++;
		}
	return n ? s / n : 0;
}

type Bone = {
	quaternion: {
		x: number;
		y: number;
		z: number;
		w: number;
		set(x: number, y: number, z: number, w: number): { normalize(): void };
	};
};
type Shape = Record<string, unknown>;

export class Animator {
	private h: TalkingHead;
	private clips: Clip[];
	private state = "escuchando";
	private speaking = false;
	private out = new Float32Array(CHANNELS.length);
	private current: { clip: Clip; t: number; until: number } | null = null;
	private previous: { v: Float32Array; since: number } | null = null;
	private last = 0;
	private bones: Record<string, Bone | undefined> = {};
	private saved: Record<string, unknown> | null = null;
	// Volumen de la voz del paciente (0 a 1): hablando fuerte gesticula más.
	voiceLevel: () => number = () => 0;
	paused = false;

	constructor(h: TalkingHead, clips: Clip[]) {
		this.h = h;
		this.clips = clips;
	}

	// Se llama en cada cuadro, después de la pose de TalkingHead.
	start() {
		const o = this.h.opt;
		this.saved = {
			avatarIdleHeadMove: o.avatarIdleHeadMove,
			avatarSpeakingHeadMove: o.avatarSpeakingHeadMove,
		};
		// Los movimientos de cabeza de TalkingHead se apagan: los pone lo aprendido.
		o.avatarIdleHeadMove = 0;
		o.avatarSpeakingHeadMove = 0;
		this.next(true);
	}

	stop() {
		if (this.saved) Object.assign(this.h.opt, this.saved);
		this.release();
	}

	// Suelta las formas: vuelven a mandar TalkingHead y las órdenes (boca abierta).
	release() {
		const mt = this.h.mtAvatar;
		for (const c of [...EXPRESSIONS, ...HEAD]) {
			const shape = mt[c] as Shape | undefined;
			if (shape) Object.assign(shape, { realtime: null, needsUpdate: true });
		}
	}

	pause(on: boolean) {
		if (on === this.paused) return;
		this.paused = on;
		if (on) this.release();
	}

	situation(mood: Mood, speaking = this.speaking) {
		const state = SITUATION[mood] ?? "escuchando";
		const changed = state !== this.state || speaking !== this.speaking;
		this.state = state;
		this.speaking = speaking;
		if (changed) this.next();
	}

	private candidates() {
		const want = this.speaking ? "hablando" : this.state;
		const own = this.clips.filter((c) => c.estado === want);
		const ofState = this.clips.filter((c) => c.estado === this.state);
		const calm = this.clips.filter((c) => c.estado === "escuchando");
		return own.length
			? own
			: ofState.length
				? ofState
				: calm.length
					? calm
					: this.clips;
	}

	// Busca el pedazo que mejor sigue la postura de ahora.
	private next(first = false) {
		const clips = this.candidates();
		if (!clips.length) return;
		const voice = this.voiceLevel();
		let best: { clip: Clip; t: number; until: number; cost: number } | null =
			null;
		for (let k = 0; k < 160; k++) {
			const clip = clips[Math.floor(Math.random() * clips.length)] as Clip;
			const length = 2200 + Math.random() * 2800;
			const t = Math.random() * Math.max(0, clip.duracion - length);
			let cost = first ? 0 : distance(this.out, sample(clip, t));
			if (this.speaking) cost += 4 * Math.abs(voiceAround(clip, t) - voice);
			cost += Math.random() * 0.02; // que no elija siempre lo mismo
			if (!best || cost < best.cost)
				best = { clip, t, until: Math.min(clip.duracion, t + length), cost };
		}
		if (!best) return;
		if (!first)
			this.previous = { v: this.out.slice(), since: performance.now() };
		this.current = best;
	}

	step(dt: number) {
		if (this.paused || !this.current) return;
		// Reloj real: TalkingHead corta el dt de cada cuadro y en una compu
		// lenta lo grabado se vería en cámara lenta.
		const now = performance.now();
		const real = this.last ? Math.min(500, now - this.last) : dt;
		this.last = now;
		this.current.t += real;
		if (this.current.t >= this.current.until - 50) this.next();
		const v = sample(this.current.clip, this.current.t);
		if (this.previous) {
			const f = Math.min(1, (now - this.previous.since) / FADE_MS);
			const s = f * f * (3 - 2 * f);
			for (let i = 0; i < v.length; i++)
				v[i] =
					(this.previous.v[i] ?? 0) +
					((v[i] ?? 0) - (this.previous.v[i] ?? 0)) * s;
			if (f >= 1) this.previous = null;
		}
		this.out = v;
		this.apply(v);
	}

	private apply(v: Float32Array) {
		const mt = this.h.mtAvatar;
		for (const c of EXPRESSIONS) {
			const shape = mt[c] as Shape | undefined;
			if (!shape) continue;
			const value =
				this.speaking && MOUTH.has(c)
					? null
					: Math.min(1, v[idx[c] as number] ?? 0);
			Object.assign(shape, { realtime: value, needsUpdate: true });
		}
		for (const c of HEAD) {
			const shape = mt[c] as Shape | undefined;
			if (shape)
				Object.assign(shape, {
					realtime: v[idx[c] as number] ?? 0,
					needsUpdate: true,
				});
		}
		// Torso y hombros: sobre la pose que ya puso TalkingHead en este cuadro.
		const bone = (n: string) =>
			(this.bones[n] ??= this.h.armature?.getObjectByName(n) as unknown as
				| Bone
				| undefined);
		const spine = bone("Spine1");
		if (spine) {
			const q = spine.quaternion;
			q.set(
				q.x + (v[idx.torsoX as number] ?? 0),
				q.y + (v[idx.torsoY as number] ?? 0),
				q.z + (v[idx.torsoZ as number] ?? 0),
				q.w,
			).normalize();
		}
		for (const [side, channel, sign] of [
			["LeftShoulder", "hombroL", 1],
			["RightShoulder", "hombroR", -1],
		] as const) {
			const b = bone(side);
			if (!b) continue;
			const q = b.quaternion;
			q.set(
				q.x,
				q.y,
				q.z + sign * (v[idx[channel] as number] ?? 0) * 2,
				q.w,
			).normalize();
		}
	}
}

// La biblioteca, una sola vez por página. null si no hay (o está vacía).
let library: Promise<Clip[] | null> | null = null;
export function loadLibrary(url = "/avatar/movimientos.json") {
	library ??= fetch(url)
		.then((r) => (r.ok ? r.json() : null))
		.then((data) => {
			const clips = data ? parseLibrary(data) : [];
			return clips.length ? clips : null;
		})
		.catch(() => null);
	return library;
}
