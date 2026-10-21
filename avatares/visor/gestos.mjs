// Gestos reales para los avatares. MediaPipe (Apache 2.0) mira una cara en la
// cámara o en un video y devuelve, cuadro a cuadro, las mismas 52 caras de
// ARKit que tienen los avatares y el giro de la cabeza. El avatar las copia en
// vivo y se pueden grabar como gestos: solo se guardan esos números, nunca la
// imagen.
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.mjs";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MODELO = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Como en un espejo: lo que la persona hace con su lado izquierdo, el avatar
// lo hace con el derecho (mismo criterio que facetracking.mjs de TalkingHead).
const ESPEJO = {};
for (const base of ["browDown", "browOuterUp", "cheekSquint", "eyeBlink", "eyeLookDown", "eyeLookUp",
	"eyeSquint", "eyeWide", "jaw", "mouthDimple", "mouthFrown", "mouthLowerDown", "mouthPress",
	"mouthSmile", "mouthStretch", "mouthUpperUp", "noseSneer", "mouth"]) {
	ESPEJO[`${base}Left`] = `${base}Right`;
	ESPEJO[`${base}Right`] = `${base}Left`;
}
ESPEJO.eyeLookInLeft = "eyeLookInRight";
ESPEJO.eyeLookInRight = "eyeLookInLeft";
ESPEJO.eyeLookOutLeft = "eyeLookOutRight";
ESPEJO.eyeLookOutRight = "eyeLookOutLeft";

const CABEZA = ["headRotateX", "headRotateY", "headRotateZ"];

export class Gestos {
	constructor(head) {
		this.head = head;
		this.suave = {}; // valores filtrados (MediaPipe tiembla un poco)
		this.grabando = null;
		this.reproduciendo = null;
		this.corriendo = false;
	}

	async preparar() {
		if (this.detector) return;
		const fileset = await FilesetResolver.forVisionTasks(WASM);
		this.detector = await FaceLandmarker.createFromOptions(fileset, {
			baseOptions: { modelAssetPath: MODELO, delegate: "GPU" },
			outputFaceBlendshapes: true,
			outputFacialTransformationMatrixes: true,
			runningMode: "VIDEO",
			numFaces: 1,
		});
	}

	// Fuente: la cámara de la compu o un archivo de video.
	async seguir(video, archivo = null) {
		await this.preparar();
		this.parar();
		if (archivo) {
			video.srcObject = null;
			video.src = URL.createObjectURL(archivo);
			video.loop = true;
		} else {
			video.src = "";
			video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
		}
		await video.play();
		this.video = video;
		this.corriendo = true;
		this.ultimo = -1;
		const paso = () => {
			if (!this.corriendo) return;
			if (video.currentTime !== this.ultimo) {
				this.ultimo = video.currentTime;
				const r = this.detector.detectForVideo(video, performance.now());
				if (r.faceBlendshapes?.length) this.aplicar(this.leer(r));
			}
			requestAnimationFrame(paso);
		};
		requestAnimationFrame(paso);
	}

	// Un cuadro de MediaPipe → { nombre: valor } suavizado, con la cabeza.
	leer(r) {
		const cuadro = {};
		for (const c of r.faceBlendshapes[0].categories) {
			const nombre = ESPEJO[c.categoryName] ?? c.categoryName;
			if (nombre === "_neutral") continue;
			cuadro[nombre] = c.score;
		}
		const m = r.facialTransformationMatrixes?.[0]?.data;
		if (m) {
			// Matriz de MediaPipe (por columnas) → ángulos de la cabeza.
			const pitch = Math.asin(-m[9]);
			const yaw = Math.atan2(m[8], m[10]);
			const roll = Math.atan2(m[1], m[5]);
			// TalkingHead suma esto a la componente del cuaternión: medio ángulo.
			cuadro.headRotateX = -pitch / 2;
			cuadro.headRotateY = -yaw / 2;
			cuadro.headRotateZ = -roll / 2;
		}
		// Filtro exponencial: más rápido en la boca (habla), más lento en el resto.
		for (const [k, v] of Object.entries(cuadro)) {
			const a = k.startsWith("mouth") || k.startsWith("jaw") ? 0.6 : 0.35;
			this.suave[k] = this.suave[k] === undefined ? v : this.suave[k] + a * (v - this.suave[k]);
			cuadro[k] = this.suave[k];
		}
		if (this.grabando) {
			this.grabando.cuadros.push({
				t: Math.round(performance.now() - this.grabando.inicio),
				v: Object.fromEntries(Object.entries(cuadro).filter(([, x]) => Math.abs(x) > 0.01).map(([k, x]) => [k, Number(x.toFixed(3))])),
			});
		}
		return cuadro;
	}

	aplicar(cuadro) {
		const mt = this.head.mtAvatar;
		if (!mt) return;
		for (const [k, v] of Object.entries(cuadro)) {
			if (mt[k]) Object.assign(mt[k], { realtime: v, needsUpdate: true });
		}
	}

	soltar() {
		const mt = this.head.mtAvatar;
		if (!mt) return;
		for (const k of Object.keys(mt)) Object.assign(mt[k], { realtime: null, needsUpdate: true });
	}

	parar() {
		this.corriendo = false;
		const s = this.video?.srcObject;
		if (s) for (const t of s.getTracks()) t.stop();
		if (this.video) this.video.pause();
		this.suave = {};
		this.soltar();
	}

	grabar(nombre) {
		this.grabando = { nombre, inicio: performance.now(), cuadros: [] };
	}

	terminarGrabacion() {
		const g = this.grabando;
		this.grabando = null;
		if (!g || !g.cuadros.length) return null;
		return { nombre: g.nombre, duracion: g.cuadros.at(-1).t, cuadros: g.cuadros };
	}

	// Reproduce un gesto grabado, interpolando entre cuadros. Al terminar, el
	// avatar vuelve a sus animaciones normales.
	reproducir(gesto, { intensidad = 1, alTerminar } = {}) {
		this.reproduciendo = gesto;
		const inicio = performance.now();
		const claves = new Set(gesto.cuadros.flatMap((c) => Object.keys(c.v)));
		let i = 0;
		const paso = () => {
			if (this.reproduciendo !== gesto) return;
			const t = performance.now() - inicio;
			if (t > gesto.duracion) {
				this.reproduciendo = null;
				this.soltar();
				alTerminar?.();
				return;
			}
			while (i < gesto.cuadros.length - 2 && gesto.cuadros[i + 1].t < t) i++;
			const a = gesto.cuadros[i];
			const b = gesto.cuadros[i + 1] ?? a;
			const f = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 0;
			const cuadro = {};
			for (const k of claves) {
				const va = a.v[k] ?? 0;
				const vb = b.v[k] ?? 0;
				cuadro[k] = (va + (vb - va) * f) * intensidad;
			}
			this.aplicar(cuadro);
			requestAnimationFrame(paso);
		};
		requestAnimationFrame(paso);
	}
}

export { CABEZA };
