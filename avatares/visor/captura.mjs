// Captura de movimiento real para entrenar a los avatares.
//
// Con MediaPipe (Apache 2.0) lee, en cada cuadro de la cámara o de un video:
// las 52 expresiones de la cara (las mismas de los avatares), el giro de la
// cabeza, el torso y los hombros, y el volumen de la voz del micrófono. Solo
// guarda esos números, nunca la imagen ni el audio.
//
// Para que copie fiel:
// - Filtro One Euro: casi sin demora en los movimientos rápidos y sin temblor
//   en los quietos (el suavizado común hace una cosa o la otra).
// - Calibración: la cara en reposo de cada persona no da cero; se mide 2 s y
//   se resta.
// - Ganancia por gesto: MediaPipe marca débil algunos (abrir mucho los ojos,
//   fruncir la boca, inflar cachetes) y el parpadeo nunca llega a 1.
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.mjs";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const CARA = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const CUERPO = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Las 52 de ARKit, en el orden en que se guardan.
export const EXPRESIONES = [
	"browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
	"cheekPuff", "cheekSquintLeft", "cheekSquintRight",
	"eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight",
	"eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
	"eyeWideLeft", "eyeWideRight",
	"jawForward", "jawLeft", "jawOpen", "jawRight",
	"mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel",
	"mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker",
	"mouthRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper",
	"mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight",
	"mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight", "tongueOut",
];
// Cabeza (medio ángulo, como lo suma TalkingHead), torso y hombros.
export const POSTURA = ["headRotateX", "headRotateY", "headRotateZ", "torsoX", "torsoY", "torsoZ", "hombroL", "hombroR"];
export const CANALES = [...EXPRESIONES, ...POSTURA, "voz"];

// Como en un espejo: tu izquierda es la derecha del avatar.
const espejo = (n) => n.includes("Left") ? n.replace("Left", "Right") : n.includes("Right") ? n.replace("Right", "Left") : n;

const GANANCIA = {
	eyeWideLeft: 2.2, eyeWideRight: 2.2, browInnerUp: 1.4, browOuterUpLeft: 1.3, browOuterUpRight: 1.3,
	mouthPucker: 1.5, mouthFunnel: 1.5, cheekPuff: 2.2, cheekSquintLeft: 1.6, cheekSquintRight: 1.6,
	noseSneerLeft: 1.6, noseSneerRight: 1.6, mouthPressLeft: 1.3, mouthPressRight: 1.3,
	mouthRollLower: 1.3, mouthRollUpper: 1.3, jawOpen: 1.15, mouthSmileLeft: 1.1, mouthSmileRight: 1.1,
	eyeSquintLeft: 1.2, eyeSquintRight: 1.2,
};

// Filtro One Euro (Casiez y otros, 2012).
class UnEuro {
	constructor(minCutoff = 1.2, beta = 0.6, dCutoff = 1) {
		Object.assign(this, { minCutoff, beta, dCutoff, x: null, dx: 0, t: null });
	}
	alfa(cutoff, dt) {
		const tau = 1 / (2 * Math.PI * cutoff);
		return 1 / (1 + tau / dt);
	}
	filtrar(v, t) {
		if (this.x === null) { this.x = v; this.t = t; return v; }
		const dt = Math.max(1e-3, (t - this.t) / 1000);
		this.t = t;
		const dv = (v - this.x) / dt;
		this.dx += this.alfa(this.dCutoff, dt) * (dv - this.dx);
		const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
		this.x += this.alfa(cutoff, dt) * (v - this.x);
		return this.x;
	}
}

export class Captura {
	constructor() {
		this.filtros = Object.fromEntries(CANALES.map((c) => [
			c,
			// La boca y los párpados son rápidos; la cabeza y el torso, más suaves.
			c.startsWith("mouth") || c.startsWith("jaw") || c.startsWith("eyeBlink") ? new UnEuro(2.5, 1.5)
				: POSTURA.includes(c) ? new UnEuro(0.8, 0.4) : new UnEuro(1.5, 0.8),
		]));
		this.base = Object.fromEntries(CANALES.map((c) => [c, 0]));
		this.actual = Object.fromEntries(CANALES.map((c) => [c, 0]));
		this.alCuadro = null; // (valores, t) en cada cuadro
		this.grabando = null;
		this.corriendo = false;
	}

	async preparar({ cuerpo = true } = {}) {
		const fileset = await FilesetResolver.forVisionTasks(WASM);
		this.cara ??= await FaceLandmarker.createFromOptions(fileset, {
			baseOptions: { modelAssetPath: CARA, delegate: "GPU" },
			outputFaceBlendshapes: true,
			outputFacialTransformationMatrixes: true,
			runningMode: "VIDEO",
			numFaces: 1,
		});
		if (cuerpo)
			this.cuerpo ??= await PoseLandmarker.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: CUERPO, delegate: "GPU" },
				runningMode: "VIDEO",
				numPoses: 1,
			});
	}

	// fuente: { archivo } (un video) o { stream } (cámara); con microfono, mide la voz.
	async empezar(video, { archivo = null, stream = null, cuerpo = true, microfono = true } = {}) {
		await this.preparar({ cuerpo });
		this.parar();
		if (archivo) {
			video.srcObject = null;
			video.src = URL.createObjectURL(archivo);
			video.loop = true;
		} else {
			video.src = "";
			video.srcObject = stream ?? await navigator.mediaDevices.getUserMedia({
				video: { width: 1280, height: 720, frameRate: 30 },
				audio: microfono,
			});
		}
		video.muted = true;
		await video.play();
		this.video = video;
		const s = video.srcObject;
		if (s?.getAudioTracks().length || archivo) {
			this.audio = new AudioContext();
			const fuente = archivo ? this.audio.createMediaElementSource(video) : this.audio.createMediaStreamSource(s);
			this.analizador = this.audio.createAnalyser();
			this.analizador.fftSize = 1024;
			fuente.connect(this.analizador);
			this.buf = new Float32Array(this.analizador.fftSize);
		}
		this.corriendo = true;
		// Un análisis por cuadro nuevo del video (no por cuadro de pantalla).
		const paso = (ahora) => {
			if (!this.corriendo) return;
			this.procesar(performance.now());
			video.requestVideoFrameCallback(paso);
		};
		video.requestVideoFrameCallback(paso);
	}

	voz() {
		if (!this.analizador) return 0;
		this.analizador.getFloatTimeDomainData(this.buf);
		let s = 0;
		for (const v of this.buf) s += v * v;
		return Math.min(1, Math.sqrt(s / this.buf.length) * 6);
	}

	crudo(t) {
		const r = this.cara.detectForVideo(this.video, t);
		if (!r.faceBlendshapes?.length) return null;
		const v = {};
		for (const c of r.faceBlendshapes[0].categories) {
			if (c.categoryName === "_neutral") continue;
			v[espejo(c.categoryName)] = c.score;
		}
		const m = r.facialTransformationMatrixes?.[0]?.data;
		if (m) {
			v.headRotateX = -Math.asin(-m[9]) / 2;
			v.headRotateY = -Math.atan2(m[8], m[10]) / 2;
			v.headRotateZ = -Math.atan2(m[1], m[5]) / 2;
		}
		if (this.cuerpo) {
			const p = this.cuerpo.detectForVideo(this.video, t).worldLandmarks?.[0];
			if (p) {
				const [i, d] = [p[11], p[12]]; // hombros
				v.torsoZ = Math.atan2(i.y - d.y, i.x - d.x) / 2;
				v.torsoY = Math.atan2(i.z - d.z, i.x - d.x) / 2;
				v.torsoX = ((i.z + d.z) / 2) * 0.5; // inclinarse hacia adelante
				v.hombroR = -i.y; // espejo: tu hombro izquierdo es el derecho del avatar
				v.hombroL = -d.y;
			}
		}
		v.voz = this.voz();
		return v;
	}

	procesar(t) {
		const v = this.crudo(t);
		if (!v) return;
		if (this.calibrando) {
			this.calibrando.cuadros.push(v);
			return;
		}
		for (const c of CANALES) {
			let x = v[c] ?? 0;
			if (EXPRESIONES.includes(c)) {
				const b = this.base[c];
				x = Math.max(0, x - b) / Math.max(0.2, 1 - b);
				if (c.startsWith("eyeBlink")) x = Math.min(1, Math.max(0, (x - 0.15) / 0.5)); // el parpadeo llega a 1
				else x = Math.min(1, x * (GANANCIA[c] ?? 1));
			} else if (c !== "voz") {
				x -= this.base[c];
			}
			this.actual[c] = this.filtros[c].filtrar(x, t);
		}
		if (this.grabando) {
			this.grabando.cuadros.push([Math.round(t - this.grabando.inicio), ...CANALES.map((c) => Number(this.actual[c].toFixed(3)))]);
		}
		this.alCuadro?.(this.actual, t);
	}

	// Mirá a la cámara con la cara relajada: lo que da tu cara en reposo se resta.
	calibrar(ms = 2000) {
		return new Promise((listo) => {
			this.calibrando = { cuadros: [] };
			setTimeout(() => {
				const cuadros = this.calibrando.cuadros;
				this.calibrando = null;
				if (cuadros.length) {
					for (const c of CANALES) {
						if (c === "voz") continue;
						const vals = cuadros.map((v) => v[c] ?? 0).sort((a, b) => a - b);
						this.base[c] = vals[Math.floor(vals.length / 2)]; // mediana
					}
				}
				listo(cuadros.length);
			}, ms);
		});
	}

	grabar(nombre, estado) {
		this.grabando = { nombre, estado, inicio: performance.now(), cuadros: [] };
	}

	terminar() {
		const g = this.grabando;
		this.grabando = null;
		if (!g || g.cuadros.length < 10) return null;
		return { nombre: g.nombre, estado: g.estado, canales: CANALES, cuadros: g.cuadros, duracion: g.cuadros.at(-1)[0] };
	}

	parar() {
		this.corriendo = false;
		for (const t of this.video?.srcObject?.getTracks() ?? []) t.stop();
		this.video?.pause();
		this.audio?.close().catch(() => {});
		this.audio = null;
		this.analizador = null;
	}
}
