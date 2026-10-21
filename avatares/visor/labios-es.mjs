// Labios en español rioplatense para TalkingHead (que no trae español).
//
// 1. LipsyncEs: de un texto a los visemas de Oculus (las 15 formas de la boca
//    que tienen los avatares), con la duración relativa de cada uno. Mismo
//    formato que los módulos de TalkingHead (lipsync-fi.mjs), así también se
//    puede registrar como head.lipsync.es.
// 2. Labios: un animador que recibe palabras con su momento en el audio y
//    mezcla cada forma con la siguiente (coarticulación), en vez de saltar de
//    una a otra. Sirve para la voz en vivo: la transcripción llega en pedazos
//    y cada pedazo se reparte en el tiempo que dura su audio.

const VOCALES = { a: "aa", e: "E", i: "I", o: "O", u: "U" };

// Duración relativa de cada visema (1 = promedio). Las vocales duran más que
// las consonantes; las oclusivas (p, t, k) son cortas.
const DURACION = {
	aa: 1.25, E: 1.1, I: 1.0, O: 1.2, U: 1.05,
	PP: 0.85, FF: 0.9, TH: 0.8, DD: 0.75, kk: 0.8, CH: 1.0,
	SS: 1.0, nn: 0.8, RR: 0.85, sil: 1,
};

const UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
	"diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte"];
const DECENAS = ["", "", "veinti", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];

function numero(n) {
	if (n <= 20) return UNIDADES[n];
	if (n < 30) return DECENAS[2] + UNIDADES[n - 20];
	if (n < 100) return DECENAS[Math.floor(n / 10)] + (n % 10 ? ` y ${UNIDADES[n % 10]}` : "");
	if (n === 100) return "cien";
	if (n < 1000) {
		const c = Math.floor(n / 100);
		const pre = { 1: "ciento", 5: "quinientos", 7: "setecientos", 9: "novecientos" }[c] ?? `${UNIDADES[c]}cientos`;
		return pre + (n % 100 ? ` ${numero(n % 100)}` : "");
	}
	if (n < 10000) {
		const m = Math.floor(n / 1000);
		return (m === 1 ? "mil" : `${UNIDADES[m]} mil`) + (n % 1000 ? ` ${numero(n % 1000)}` : "");
	}
	return String(n);
}

export class LipsyncEs {
	preProcessText(s) {
		return s
			.replace(/%/g, " por ciento ")
			.replace(/(\d+)[.,](\d+)/g, "$1 coma $2")
			.replace(/\d+/g, (d) => ` ${numero(Number(d))} `)
			.replace(/[#_*"“”«»()[\]]/g, "")
			.replace(/\s+/g, " ")
			.trim();
	}

	// Letras → visemas. Reglas del español de Uruguay: seseo (c/z como s),
	// "ll" e "y" como "sh" (CH), h muda, "qu"/"gu" con u muda.
	letrasAVisemas(palabra) {
		const w = palabra.toLowerCase().normalize("NFD").replace(/[́̈]/g, "").normalize("NFC");
		const out = [];
		for (let i = 0; i < w.length; i++) {
			const c = w[i];
			const sig = w[i + 1] ?? "";
			const dos = c + sig;
			if (dos === "ch" || dos === "ll") { out.push("CH"); i++; continue; }
			if (dos === "rr") { out.push("RR"); i++; continue; }
			if ((dos === "qu" || dos === "gu") && "eiéí".includes(w[i + 2] ?? "")) { out.push("kk"); i++; continue; }
			if (c in VOCALES) { out.push(VOCALES[c]); continue; }
			switch (c) {
				case "á": out.push("aa"); break;
				case "é": out.push("E"); break;
				case "í": out.push("I"); break;
				case "ó": out.push("O"); break;
				case "ú": case "ü": out.push("U"); break;
				case "b": case "v": case "m": case "p": out.push("PP"); break;
				case "f": out.push("FF"); break;
				case "d": case "t": out.push("DD"); break;
				case "c": out.push("eéií".includes(sig) ? "SS" : "kk"); break;
				case "z": case "s": out.push("SS"); break;
				case "g": out.push("eéií".includes(sig) ? "kk" : "kk"); break;
				case "j": case "k": case "q": out.push("kk"); break;
				case "x": out.push("kk", "SS"); break;
				case "n": case "ñ": case "l": out.push("nn"); break;
				case "r": out.push("RR"); break;
				case "y": out.push(i === w.length - 1 || !(sig in VOCALES) ? "I" : "CH"); break;
				case "w": out.push("U"); break;
				case "h": break;
				default: break;
			}
		}
		return out;
	}

	wordsToVisemes(w) {
		const o = { words: w, visemes: [], times: [], durations: [] };
		let t = 0;
		for (const token of w.split(/(\s+|[,.;:!?¿¡]+)/)) {
			if (!token) continue;
			if (/^\s+$/.test(token)) { t += 0.4; continue; }
			if (/^[,.;:!?¿¡]+$/.test(token)) { t += /[.!?]/.test(token) ? 3 : 2; continue; }
			for (const v of this.letrasAVisemas(token)) {
				const d = DURACION[v] ?? 1;
				const last = o.visemes.length - 1;
				if (last >= 0 && o.visemes[last] === v && o.times[last] + o.durations[last] >= t - 0.01) {
					o.durations[last] += 0.6 * d;
				} else {
					o.visemes.push(v);
					o.times.push(t);
					o.durations.push(d);
				}
				t += d;
			}
		}
		o.total = t;
		return o;
	}
}

// Cuánto abre cada visema la boca (sirve para que el volumen del audio module
// la apertura sin pisar la forma: una "o" fuerte abre más que una suave).
const VISEMAS = ["aa", "E", "I", "O", "U", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "sil"];

export class Labios {
	/**
	 * @param head TalkingHead
	 * @param opt.intensidad 0 a 1 (cuánto se marcan las formas)
	 */
	constructor(head, opt = {}) {
		this.head = head;
		this.es = new LipsyncEs();
		this.intensidad = opt.intensidad ?? 0.85;
		this.cola = []; // { v, t0, t1 } en ms de performance.now()
		this.nivel = () => 1; // volumen del audio de 0 a 1, si se conoce
		this.activo = true;
		this.tick = this.tick.bind(this);
		requestAnimationFrame(this.tick);
	}

	/**
	 * Agrega un pedazo de texto que suena entre `desde` y `desde + duracionMs`
	 * (en ms de performance.now()). Las formas se reparten en ese tiempo.
	 */
	decir(texto, desde = performance.now(), duracionMs = null) {
		const limpio = this.es.preProcessText(texto);
		if (!limpio) return 0;
		const o = this.es.wordsToVisemes(limpio);
		// Sin duración conocida: unos 70 ms por unidad (habla tranquila).
		const unidad = duracionMs ? duracionMs / Math.max(1, o.total) : 70;
		o.visemes.forEach((v, i) => {
			const t0 = desde + o.times[i] * unidad;
			this.cola.push({ v, t0, t1: t0 + o.durations[i] * unidad });
		});
		return o.total * unidad;
	}

	callar() {
		this.cola = [];
	}

	// Cada forma sube y baja con una curva suave que se superpone con la de al
	// lado: así la boca va de una a otra como al hablar de verdad.
	pesos(ahora) {
		const peso = Object.fromEntries(VISEMAS.map((v) => [v, 0]));
		for (const x of this.cola) {
			const dur = x.t1 - x.t0;
			const subida = Math.min(70, dur * 0.6);
			const bajada = 130;
			let w = 0;
			if (ahora >= x.t0 - subida && ahora < x.t0) w = (ahora - (x.t0 - subida)) / subida;
			else if (ahora >= x.t0 && ahora <= x.t1) w = 1;
			else if (ahora > x.t1 && ahora < x.t1 + bajada) w = 1 - (ahora - x.t1) / bajada;
			w = w * w * (3 - 2 * w); // suavizado
			peso[x.v] = Math.max(peso[x.v], w);
		}
		return peso;
	}

	tick() {
		if (!this.activo) return;
		const ahora = performance.now();
		this.cola = this.cola.filter((x) => x.t1 + 160 > ahora);
		const peso = this.pesos(ahora);
		const mt = this.head.mtAvatar;
		const vol = Math.min(1, 0.55 + this.nivel() * 0.8);
		const hablando = this.cola.length > 0;
		for (const v of VISEMAS) {
			const key = `viseme_${v}`;
			if (!mt?.[key]) continue;
			const valor = hablando ? peso[v] * this.intensidad * (v === "PP" || v === "FF" ? 1 : vol) : null;
			Object.assign(mt[key], { realtime: valor, needsUpdate: true });
		}
		requestAnimationFrame(this.tick);
	}
}
