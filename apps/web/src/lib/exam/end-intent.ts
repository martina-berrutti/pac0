// El estudiante da por terminado el examen hablando ("cerrá la boca", "ya
// está", "no me muestres más el oído"): la consulta cierra el examen y la
// cámara vuelve de frente (Persona 3). Solo se mira con un examen abierto.
import { normalize } from "@/lib/avatar/commands";

const END = [
	// "Cerrá", "cierra" (así lo transcribe a veces la voz), "cierre", "cerrala".
	/\b(cerr|cierr)\w*\b.*\bboca\b/,
	/^\W*(ya )?(cerra|cierra|cierre|cerrar)\b/,
	/\b(cerrala|cierrala|cerrarla)\b/,
	// "¿Podés bajar la cabeza?" sí; "¿podés volver a abrir?" o "¿podés bajar
	// la lengua?" son otra instrucción del examen.
	/\bpod(es|e|eis|ria|rias)\b.*\b(cerrar|tapar|descansar|(bajar|relajar) (la )?(boca|cabeza|mandibula)|volver a (sentarte|como estabas|la normalidad))/,
	/\bya (esta|estamos|termine|terminamos|vi|revise|te revise|lo vi|alcanza)\b/,
	/\blisto\b/,
	/\b(eso es todo|nada mas|es suficiente|alcanza)\b/,
	/\btermine\b/,
	/\bno (me )?(muestres|mostres|ensenes) mas\b/,
	/\bno (hace falta|necesito|preciso) (ver |mirar |revisar )?mas\b/,
	// "Dejá de mostrarme el oído", "ya no me lo muestres", "sacá el otoscopio".
	/\bdeja(r|s|me)? de (mostr|ensen|abrir|tener)/,
	/\bya no (me )?(lo |la )?(muestres|mostres|ensenes|hace falta)/,
	/\b(saca|sacar|saco|retira) (el |la )?(otoscopio|linterna|abatelenguas)/,
	/\b(basta|suficiente|ya fue|ya vi|perfecto,? gracias|gracias,? ya)\b/,
	/\bvolve(r|mos)? (a la normalidad|a como estabas|de frente|a sentarte)/,
	/\b(podes|puedes) (relajarte|descansar|bajar (la )?(boca|cabeza))/,
	// "Podés volver", "podés bajar" (sin más), "podés volver a tu lugar".
	// Sin "a + verbo" después: "¿podés volver a abrir?" sigue examinando.
	/\b(podes|puedes) (volver|bajar)\b(?! a \w+r\b)(?! (la )?lengua)/,
	/\bvolver a (tu lugar|la posicion|tu posicion)\b/,
];

// "No cierres la boca", "todavía no terminé": siguen examinando.
const KEEP = [
	/\bno (la )?cierr/,
	/\btodavia no\b/,
	/\baun no\b/,
	/\bno (esta|estamos) listo/,
	/\bno termine\b/,
	/\bcuando termine\b/,
	// Con otra instrucción del examen ("listo, ahora sacá la lengua", "ya
	// está casi, abrí un poco más") sigue examinando.
	/\b(abr(i|a|ime|ame|ila|is|ir)|(deci|diga|hace|haga) a+|sac(a|ate|ar) (la )?lengua|lengua afuera)\b/,
];

// "Cerrá la boca" (o "guardá la lengua") gana aunque la frase nombre otra
// cosa del examen; "no cierres" no.
const EXPLICIT_END =
	/\bcerr(a|ar|as|ala|ame)\b.*\bboca\b|\b(guarda|guardar|meter|mete) (la )?lengua\b/;

export function asksToEndExam(text: string): boolean {
	const t = normalize(text);
	if (EXPLICIT_END.test(t) && !/\bno (la )?cierr/.test(t)) return true;
	if (KEEP.some((re) => re.test(t))) return false;
	return END.some((re) => re.test(t));
}

// Por texto (plan B) no hay herramientas del modelo: el oído y la presión se
// piden con palabras, igual que por voz.
// Un pedido, no un pasado ni otra palabra: "¿te revisaron el oído?" o
// "¿tenés vértigo?" no abren el otoscopio.
const EXAMINE =
	/\b(revis(o|ar|arte|arle|arlo|arla|e|emos)|mir(o|ar|arte|arle|arlo|arla|e|emos)|ver(te|le|lo|la)?|veo(?! que)|(veamos|vemos) (el|la|los|las|tu|tus|ese|esa) (oido|oidos|oreja|orejas)|muestr(ame|ale|e|eme)|mostra(me|le|s)?|examin(o|ar|arte|arle|arlo|arla|e|emos)|chequ(ear|earte|earle|eemos))\b/;

export function asksForEarExam(text: string): boolean {
	// Los pasados se sacan antes de quitar las tildes ("te revisó" no es "te
	// reviso"): "¿alguien te revisó?", "¿te fijaste?", "¿te mostraron?".
	const present = text
		.normalize("NFC")
		.toLowerCase()
		.replace(/\p{L}+(ó|aron|ieron|aste|iste)(?!\p{L})/gu, " ");
	// "A ver" de relleno ("a ver, ¿desde cuándo te duele el oído?") no; "a ver
	// el oído" sí.
	const t = normalize(present).replace(
		/\ba ver\b(?! (el|la|los|las|tu|tus|ese|esa) (oido|oidos|oreja|orejas)\b)/g,
		" ",
	);
	return /\b(oido|oidos|oreja|orejas|otoscop\w*)\b/.test(t) && EXAMINE.test(t);
}

// Un pedido de medir ("para tomarte la presión" solo al poner el manguito),
// no una pregunta de la historia: "¿tomás medicación
// para la presión?", "¿te la tomaron alguna vez?" o "¿te controlás la
// presión?" no abren el tensiómetro.
const MEASURE =
	/\b((te|le|se la|te la|le la)\s+(voy a\s+|vamos a\s+)?(tomo|tomar|tome|mido|medir|mida|controlo|controlar|controle|tomamos|medimos)|(puedo|podemos|podria|podrias|dejame|dejeme|deja|dejas|permitime|permitame|me permitis|me permite|me gustaria|quisiera|necesitaria|voy a|vamos a|quiero|necesito|tengo que)\s+(tomar|medir|controlar)(te|le|tela|tele)?|tomemos|midamos|controlemos|(pongo|poner|ponerte|ponerle|coloco|colocar|colocarte|colocarle)\b.*\bpara\s+(tomar|medir)(te|le)?)\b/;

// Frase por frase, sin pasados: "te tomo el pulso. ¿Cómo andás de presión?"
// no es un pedido de presión, y "¿quién te tomó la presión?" no es "te tomo
// la presión" (los pasados se sacan antes de quitar las tildes).
function presentSentences(text: string) {
	return text
		.normalize("NFC")
		.toLowerCase()
		.split(/[.?!¿¡\n]+/)
		.map((s) =>
			normalize(s.replace(/\p{L}+(ó|aron|ieron|aste|iste)(?!\p{L})/gu, " ")),
		);
}

export function asksForBloodPressure(text: string): boolean {
	const sentences = presentSentences(text);
	// "Te voy a poner el manguito. Es para tomarte la presión.": la segunda
	// frase completa la primera.
	const joined = sentences.flatMap((s, i) =>
		/\b(pongo|poner|ponerte|ponerle|coloco|colocar|colocarte|colocarle)\b/.test(
			s,
		) && /^es para\b/.test(sentences[i + 1] ?? "")
			? [`${s} ${sentences[i + 1]}`]
			: [],
	);
	return [...sentences, ...joined].some(
		(t) => /\b(presion|tension|tensiometro)\b/.test(t) && MEASURE.test(t),
	);
}

// Tomar la temperatura ahora ("te tomo la temperatura", "te pongo el
// termómetro"). Preguntar por la historia ("¿te tomaste la temperatura?",
// "¿tuviste fiebre?") no abre el termómetro, ni un consejo ("podés tomar
// paracetamol si tenés fiebre"): el verbo apunta al paciente o lo pide.
const TAKE_TEMPERATURE =
	/\b((te|le|se la|te la|le la)\s+(voy a\s+|vamos a\s+)?(tomo|tomar|tome|mido|medir|mida|controlo|controlar)|(puedo|podemos|podria|dejame|dejeme|dejas|deja|permitime|permitame|me permitis|me permite|me gustaria|quisiera|voy a|vamos a|quiero|necesito|tengo que)\s+(tomar|medir)(te|le|tela|tele)?|(controlarte|controlarle)|tomemos|midamos)\b.{0,25}\b(temperatura|fiebre)\b/;
const PUT_THERMOMETER =
	/\b(te|le|vamos a|voy a|dejame|dejeme|dejas|deja|puedo|podemos|podria)\s+(pongo|poner|ponerte|ponerle|coloco|colocar|colocarte|colocarle)\b.{0,20}\btermometro\b/;

export function asksForTemperature(text: string): boolean {
	// Frase por frase, como la presión: "te voy a medir la presión, ¿tenés
	// fiebre?" no pide el termómetro.
	return presentSentences(text).some(
		(t) => TAKE_TEMPERATURE.test(t) || PUT_THERMOMETER.test(t),
	);
}

// Qué oído nombró; si no dijo, el derecho.
export function earIn(text: string): "derecho" | "izquierdo" {
	return /\bizquierd/.test(normalize(text)) ? "izquierdo" : "derecho";
}

// "¿Dónde te duele?" como pedido de señalar ("mostrame dónde te duele",
// "señalame dónde"). "¿Te duele?" o "¿desde cuándo te duele?" no abren nada.
export function asksWherePain(text: string): boolean {
	const t = normalize(text);
	// Sin cruzar una pregunta: "¿dónde vivís? ¿te duele mucho?" no.
	const plain = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
	return (
		/\bdonde\b[^?.!]{0,15}\bduele/.test(plain) ||
		// "¿Te duele donde voy a tocar?", "¿te duele acá?"
		/\bduele\b.{0,12}\b(donde (voy a )?toc\w*|aca|aqui)\b/.test(t) ||
		/\b(mostr|muestr|senal|indic|marc)\w*\b.{0,25}\bdonde\b/.test(t)
	);
}

// Palpar los ganglios del cuello ahora ("te palpo el cuello", "te reviso los
// ganglios"). Preguntar ("¿te duele el cuello?", "¿te notaste ganglios?",
// "¿te revisaron el cuello?") no abre nada.
export function asksForNeckExam(text: string): boolean {
	const t = normalize(
		text
			.normalize("NFC")
			.toLowerCase()
			.replace(/\p{L}+(ó|aron|ieron|aste|iste)(?!\p{L})/gu, " "),
	);
	return /\b(palp|toc|revis|examin|mir|chequ)\w*\s+(el|los|tu|tus|ese|esos)\s+(cuello|ganglios?)\b/.test(
		t,
	);
}
