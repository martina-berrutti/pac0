// El avatar se mueve solo, con movimientos reales aprendidos (motion matching).
//
// La biblioteca son grabaciones de una persona actuando de paciente (ver
// entrenar.html), cada una con su situación: escuchando, hablando, pensando,
// dolor... En la consulta, el animador toma pedazos de esas grabaciones según
// la situación del momento y los encadena: elige siempre el pedazo que mejor
// sigue la postura en la que está (cabeza, mirada, torso, cejas), con un
// fundido corto, así no se ve el corte ni se repite igual. Hablando, elige
// pedazos grabados con un volumen de voz parecido (si habla fuerte, gesticula
// más) y deja la boca a los labios en español.
import { CANALES, EXPRESIONES } from "./captura.mjs";

// Lo que decide si un pedazo "sigue" bien al anterior.
const RASGOS = ["headRotateX", "headRotateY", "headRotateZ", "torsoX", "torsoY", "torsoZ",
	"browInnerUp", "browDownLeft", "eyeLookUpLeft", "eyeLookDownLeft", "eyeLookInLeft", "eyeLookOutLeft",
	"mouthSmileLeft", "mouthFrownLeft", "eyeSquintLeft"];
const PESO = { headRotateX: 6, headRotateY: 6, headRotateZ: 6, torsoX: 3, torsoY: 3, torsoZ: 3 };
// Mientras habla, la boca la mueven los visemas: estos canales no se copian.
const BOCA = new Set(["jawOpen", "jawForward", "jawLeft", "jawRight", "mouthClose", "mouthFunnel", "mouthPucker",
	"mouthLowerDownLeft", "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight",
	"mouthRollLower", "mouthRollUpper", "mouthPressLeft", "mouthPressRight", "mouthStretchLeft", "mouthStretchRight",
	"mouthShrugLower", "mouthShrugUpper", "tongueOut"]);

const FUNDIDO = 350; // ms
const idx = Object.fromEntries(CANALES.map((c, i) => [c, i]));

export class Biblioteca {
	constructor(datos = { clips: [] }) {
		this.clips = [];
		for (const c of datos.clips ?? []) this.agregar(c);
	}
	agregar(clip) {
		// Los canales pueden venir en otro orden (grabaciones viejas).
		const orden = clip.canales.map((c) => idx[c]);
		const cuadros = clip.cuadros.map((fila) => {
			const v = new Float32Array(CANALES.length);
			fila.slice(1).forEach((x, i) => { if (orden[i] !== undefined) v[orden[i]] = x; });
			return { t: fila[0], v };
		});
		this.clips.push({ ...clip, cuadros });
	}
	estados() {
		return [...new Set(this.clips.map((c) => c.estado))];
	}
	toJSON() {
		return {
			version: 1,
			clips: this.clips.map((c) => ({
				nombre: c.nombre, estado: c.estado, canales: CANALES, duracion: c.duracion,
				cuadros: c.cuadros.map((q) => [q.t, ...Array.from(q.v, (x) => Number(x.toFixed(3)))]),
			})),
		};
	}
}

function distancia(a, b) {
	let d = 0;
	for (const r of RASGOS) {
		const i = idx[r];
		d += (PESO[r] ?? 1) * (a[i] - b[i]) ** 2;
	}
	return d;
}

// Valor de un pedazo en un tiempo (interpolando entre cuadros).
function muestra(clip, t) {
	const q = clip.cuadros;
	let lo = 0;
	let hi = q.length - 1;
	while (hi - lo > 1) {
		const m = (lo + hi) >> 1;
		if (q[m].t <= t) lo = m; else hi = m;
	}
	const a = q[lo];
	const b = q[hi];
	const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
	const v = new Float32Array(CANALES.length);
	for (let i = 0; i < v.length; i++) v[i] = a.v[i] + (b.v[i] - a.v[i]) * f;
	return v;
}

function vozMedia(clip, t, ms = 1000) {
	let s = 0;
	let n = 0;
	for (const q of clip.cuadros) if (q.t >= t && q.t < t + ms) { s += q.v[idx.voz]; n++; }
	return n ? s / n : 0;
}

export class Animador {
	constructor(head, biblioteca, { intensidad = 1 } = {}) {
		this.head = head;
		this.biblio = biblioteca;
		this.intensidad = intensidad;
		this.estado = "escuchando";
		this.hablando = false;
		this.nivelVoz = () => 0; // volumen del audio del paciente, de 0 a 1
		this.salida = new Float32Array(CANALES.length);
		this.actual = null; // { clip, t, hasta }
		this.anterior = null; // { v, desde } para el fundido
		this.activo = false;
		this.huesos = {};
	}

	encender(vivo = false) {
		if (this.activo || (!vivo && !this.biblio.clips.length)) return false;
		const o = this.head.opt;
		this.guardado = { idle: o.avatarIdleHeadMove, speaking: o.avatarSpeakingHeadMove, update: o.update };
		// Los movimientos de TalkingHead se apagan: ahora los pone lo aprendido.
		o.avatarIdleHeadMove = 0;
		o.avatarSpeakingHeadMove = 0;
		const previo = o.update;
		o.update = (dt) => { previo?.(dt); this.paso(dt); };
		this.activo = true;
		if (!vivo) this.siguiente(true);
		return true;
	}

	apagar() {
		this.fuente = null;
		if (!this.activo) return;
		const o = this.head.opt;
		o.avatarIdleHeadMove = this.guardado.idle;
		o.avatarSpeakingHeadMove = this.guardado.speaking;
		o.update = this.guardado.update;
		this.activo = false;
		const mt = this.head.mtAvatar;
		for (const c of [...EXPRESIONES, "headRotateX", "headRotateY", "headRotateZ"])
			if (mt[c]) Object.assign(mt[c], { realtime: null, needsUpdate: true });
	}

	situacion(estado, { hablando = this.hablando } = {}) {
		const cambio = estado !== this.estado || hablando !== this.hablando;
		this.estado = estado;
		this.hablando = hablando;
		if (cambio && this.activo) this.siguiente();
	}

	candidatos() {
		const propios = this.biblio.clips.filter((c) => c.estado === (this.hablando ? "hablando" : this.estado));
		const delEstado = this.biblio.clips.filter((c) => c.estado === this.estado);
		return propios.length ? propios : delEstado.length ? delEstado : this.biblio.clips;
	}

	// Busca el pedazo que mejor sigue la postura de ahora.
	siguiente(primero = false) {
		const clips = this.candidatos();
		const voz = this.nivelVoz();
		let mejor = null;
		for (let k = 0; k < 160; k++) {
			const clip = clips[Math.floor(Math.random() * clips.length)];
			const largo = 2200 + Math.random() * 2800;
			if (clip.duracion < 1200) continue;
			const t = Math.random() * Math.max(0, clip.duracion - largo);
			let costo = primero ? 0 : distancia(this.salida, muestra(clip, t));
			if (this.hablando) costo += 4 * Math.abs(vozMedia(clip, t) - voz);
			costo += Math.random() * 0.02; // que no elija siempre lo mismo
			if (!mejor || costo < mejor.costo) mejor = { clip, t, hasta: Math.min(clip.duracion, t + largo), costo };
		}
		if (!mejor) return;
		if (!primero) this.anterior = { v: this.salida.slice(), desde: performance.now() };
		this.actual = mejor;
	}

	// En vivo (entrenando): copia lo que llega de la cámara en vez de lo grabado.
	enVivo(fuente) {
		this.fuente = fuente;
		if (!this.activo) this.encender(true);
	}

	paso(dt) {
		if (this.fuente) {
			const v = this.fuente();
			if (v) { this.salida = v; this.aplicar(v); }
			return;
		}
		if (!this.actual) return;
		const a = this.actual;
		// Reloj real: TalkingHead corta el dt de cada cuadro, y si la compu se
		// pone lenta lo grabado se vería en cámara lenta.
		const ahora = performance.now();
		const real = this.ultimo ? Math.min(500, ahora - this.ultimo) : dt;
		this.ultimo = ahora;
		a.t += real;
		if (a.t >= a.hasta - 50) this.siguiente();
		const v = muestra(this.actual.clip, this.actual.t);
		if (this.anterior) {
			const f = Math.min(1, (performance.now() - this.anterior.desde) / FUNDIDO);
			const s = f * f * (3 - 2 * f);
			for (let i = 0; i < v.length; i++) v[i] = this.anterior.v[i] + (v[i] - this.anterior.v[i]) * s;
			if (f >= 1) this.anterior = null;
		}
		this.salida = v;
		this.aplicar(v);
	}

	aplicar(v) {
		const mt = this.head.mtAvatar;
		const k = this.intensidad;
		for (const c of EXPRESIONES) {
			if (!mt[c]) continue;
			const valor = this.hablando && BOCA.has(c) ? null : Math.min(1, v[idx[c]] * k);
			Object.assign(mt[c], { realtime: valor, needsUpdate: true });
		}
		for (const c of ["headRotateX", "headRotateY", "headRotateZ"])
			if (mt[c]) Object.assign(mt[c], { realtime: v[idx[c]] * k, needsUpdate: true });
		// Torso y hombros: sobre la pose que ya puso TalkingHead en este cuadro.
		const arm = this.head.armature;
		const hueso = (n) => (this.huesos[n] ??= arm?.getObjectByName(n));
		const spine = hueso("Spine1");
		if (spine) {
			const q = spine.quaternion;
			const e = { x: v[idx.torsoX] * k, y: v[idx.torsoY] * k, z: v[idx.torsoZ] * k };
			q.set(q.x + e.x, q.y + e.y, q.z + e.z, q.w).normalize();
		}
		for (const [lado, canal, signo] of [["LeftShoulder", "hombroL", 1], ["RightShoulder", "hombroR", -1]]) {
			const h = hueso(lado);
			if (!h) continue;
			const q = h.quaternion;
			q.set(q.x, q.y, q.z + signo * v[idx[canal]] * 2 * k, q.w).normalize();
		}
	}
}
