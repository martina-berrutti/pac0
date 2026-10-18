// El estudiante da por terminado el examen hablando ("cerrá la boca", "ya
// está", "no me muestres más el oído"): la consulta cierra el examen y la
// cámara vuelve de frente (Persona 3). Solo se mira con un examen abierto.
import { normalize } from "@/lib/avatar/commands";

const END = [
	/\bcerr(a|ar|as|ala|ame)\b.*\bboca\b/,
	// "¿Podés bajar la cabeza?" sí; "¿podés volver a abrir?" o "¿podés bajar
	// la lengua?" son otra instrucción del examen. Con usted es "puede", con
	// u: "ya puede cerrar", "puede relajarse".
	/\b(pued(e|es)|pod(es|eis|ria|rias))\b.*\b(cerrar|tapar|descansar|relajar(te|se)|(bajar|relajar) (la )?(boca|cabeza|mandibula)|volver a (sentar(te|se)|como estabas|la normalidad))/,
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
	/\bvolve(r|mos)? (a la normalidad|a como estabas|de frente|a sentar(te|se))/,
	/\b(podes|puedes|puede) (relajar(te|se)|descansar|bajar (la )?(boca|cabeza))/,
	// "Podés volver", "podés bajar" (sin más), "podés volver a tu lugar".
	// Sin "a + verbo" después: "¿podés volver a abrir?" sigue examinando.
	/\b(podes|puedes|puede) (volver|bajar)\b(?! a \w+r\b)(?! (la )?lengua)/,
	/\bvolver a (tu lugar|la posicion|tu posicion)\b/,
	// "Bien, cerrá", "cerrá nomás": cerrar sin nombrar la boca, como frase
	// entera (con un relleno adelante).
	/^((bien|ok|okay|ta|listo|bueno|perfecto|joya|dale|muy bien|gracias|ya) )*cerr(a|ala)( (nomas|tranquil[ao]|ya))?$/,
	/\bterminamos\b/,
	/\beso (era|seria) todo\b/,
	// "Ya está, relajate"; "relajá" solo. "Relajá la lengua" sigue examinando.
	/\brelajate\b|^((bien|ok|listo|ya|ta|perfecto) )*relaja$/,
];

// "No cierres la boca", "todavía no terminé": siguen examinando.
const KEEP = [
	/\bno (la )?cierr/,
	/\btodavia no\b/,
	/\baun no\b/,
	/\bno (esta|estamos) listo/,
	/\bno termine\b/,
	// "Cuando termine cerrás la boca", "enseguida cerrás", "sin cerrar la
	// boca, decí aaa", "ya casi terminamos": todavía no.
	/\bcuando termin/,
	/\bsin cerrar\b/,
	/\b(enseguida|despues|en un segundit\w*|ya vas a poder) cerr/,
	/\bcasi\b/,
	/\bno te muevas\b/,
	// Con otra instrucción del examen ("listo, ahora sacá la lengua", "ya
	// está casi, abrí un poco más") sigue examinando.
	/\b(abr(i|a|as|ime|ame|ila|is|ir)|(deci|diga|hace|haga) a+|sac(a|ate|ar) (la )?lengua|lengua afuera)\b/,
];

// "Cerrá la boca" (o "guardá la lengua") gana aunque la frase nombre otra
// cosa del examen; "no cierres" no.
// "No hace falta que abras más" también, aunque nombre el abrir.
const EXPLICIT_END =
	/\bcerr(a|ar|as|ala|ame)\b.*\bboca\b|\b(guarda|guardar|meter|mete) (la )?lengua\b|\bno hace falta que (la )?(abras|abra|sigas|siga)\b/;
// "Sin cerrar la boca, decí aaa" o "cuando termine cerrás la boca" nombran
// el cierre pero siguen examinando.
const NOT_YET =
	/\bno (la )?cierr|\bsin cerrar\b|\bcuando termin|\b(enseguida|despues|en un segundit\w*) cerr/;

export function asksToEndExam(text: string): boolean {
	const t = normalize(text);
	if (EXPLICIT_END.test(t) && !NOT_YET.test(t)) return true;
	if (KEEP.some((re) => re.test(t))) return false;
	return END.some((re) => re.test(t));
}

// Los pasados se sacan antes de quitar las tildes: "te revisó" y también la
// primera persona, "te revisé el oído y tenés una otitis" (al explicar). Con
// tres letras antes de la "é", para no sacar "qué" ni "sé".
const PAST = /\p{L}+(ó|aron|ieron|aste|iste)(?!\p{L})|\p{L}{3,}é(?!\p{L})/gu;

// Por texto (plan B) no hay herramientas del modelo: el oído y la presión se
// piden con palabras, igual que por voz.
// Un pedido, no un pasado ni otra palabra: "¿te revisaron el oído?" o
// "¿tenés vértigo?" no abren el otoscopio. "Por lo que veo, tenés el oído
// inflamado" o "hay que ver cómo sigue el oído" tampoco.
const EXAMINE =
	/\b(revis(o|ar|arte|arle|arlo|arla|e|emos)|mir(o|ar|arte|arle|arlo|arla|e|emos)|ver(te|le|lo|la)?(?! (como|si)\b)|(?<!\blo que )veo(?! (que|es)\b)|(veamos|vemos) (el|la|los|las|tu|tus|ese|esa) (oido|oidos|oreja|orejas)|muestr(ame|ale|e|eme|es)|mostra(me|le|s)?|examin(o|ar|arte|arle|arlo|arla|e|emos)|chequ(ear|earte|earle|eemos))\b/;

export function asksForEarExam(text: string): boolean {
	// Los pasados se sacan antes de quitar las tildes ("te revisó" no es "te
	// reviso"): "¿alguien te revisó?", "¿te fijaste?", "¿te mostraron?".
	const present = text
		.normalize("NFC")
		.toLowerCase()
		.replace(PAST, " ")
		// "Mire, eso del oído es por el agua": "mire" de relleno al empezar.
		.replace(/(^|[.?!¿¡]\s*)mire\b/gu, "$1")
		// "Andá al otorrino para que te revise el oído": lo revisa otro.
		.replace(/\bpara que (te|le|lo|la) (revis|mir|vea|examin)\p{L}*/gu, " ");
	// "A ver" de relleno ("a ver, ¿desde cuándo te duele el oído?") no; "a ver
	// el oído" sí.
	const t = normalize(present).replace(
		/\ba ver\b(?! (el|la|los|las|tu|tus|ese|esa) (oido|oidos|oreja|orejas)\b)/g,
		" ",
	);
	// "Voy a usar el otoscopio", "te pongo el otoscopio": el aparato ya dice
	// qué se examina.
	if (
		/\b(usar|uso|poner|ponerte|ponerle|pongo|meter|colocar|colocarte|coloco)\b.{0,15}\botoscop/.test(
			t,
		)
	)
		return true;
	return /\b(oido|oidos|oreja|orejas|otoscop\w*)\b/.test(t) && EXAMINE.test(t);
}

// Un pedido de medir ("para tomarte la presión" solo al poner el manguito;
// "te pongo el tensiómetro" ya lo dice el aparato),
// no una pregunta de la historia: "¿tomás medicación
// para la presión?", "¿te la tomaron alguna vez?" o "¿te controlás la
// presión?" no abren el tensiómetro.
const MEASURE =
	/\b((te|le|se la|te la|le la)\s+(voy a\s+|vamos a\s+)?(tomo|tomar|tome|mido|medir|mida|controlo|controlar|controle|tomamos|medimos|chequeo|chequear)|(puedo|podemos|podria|podrias|dejame|dejeme|deja|dejas|permitime|permitame|me permitis|me permite|me gustaria|quisiera|necesitaria|voy a|vamos a|quiero|necesito|tengo que)\s+(tomar|medir|controlar|chequear)(te|le|tela|tele)?|tomemos|midamos|controlemos|(pongo|poner|ponerte|ponerle|coloco|colocar|colocarte|colocarle)\b.*\bpara\s+(tomar|medir)(te|le)?|(pongo|poner|ponerte|ponerle|coloco|colocar|colocarte|colocarle)\b.{0,20}\btensiometro)\b/;

// Frase por frase, sin pasados: "te tomo el pulso. ¿Cómo andás de presión?"
// no es un pedido de presión, y "¿quién te tomó la presión?" no es "te tomo
// la presión" (los pasados se sacan antes de quitar las tildes).
function presentSentences(text: string) {
	return text
		.normalize("NFC")
		.toLowerCase()
		.split(/[.?!¿¡\n]+/)
		.map((s) => normalize(s.replace(PAST, " ")));
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
// Sin cruzar una coma ni una pregunta sin signo: "te voy a medir la presión,
// tenés fiebre?" o "te tomo el pulso tenés fiebre" (voz) no piden el
// termómetro; "vamos a medir si tenés fiebre" sí.
const TAKE_TEMPERATURE =
	/\b((te|le|se la|te la|le la)\s+(voy a\s+|vamos a\s+)?(tomo|tomar|tome|mido|medir|mida|controlo|controlar|chequeo|chequear)|(puedo|podemos|podria|dejame|dejeme|dejas|deja|permitime|permitame|me permitis|me permite|me gustaria|quisiera|voy a|vamos a|quiero|necesito|tengo que)\s+(tomar|medir|chequear)(te|le|tela|tele)?|(controlarte|controlarle)|tomemos|midamos)\b(?:(?!(?<!\bsi )\b(tenes|tiene|tenias|hay)\b)[^,]){0,25}\b(temperatura|fiebre)\b/;
// "Ponete el termómetro debajo del brazo", "póngase el termómetro".
const PUT_THERMOMETER =
	/\b((te|le|vamos a|voy a|dejame|dejeme|dejas|deja|puedo|podemos|podria)\s+(pongo|poner|ponerte|ponerle|coloco|colocar|colocarte|colocarle)|ponete|pongase|colocate|coloquese)\b.{0,20}\btermometro\b/;

export function asksForTemperature(text: string): boolean {
	// Frase por frase, como la presión: "te voy a medir la presión, ¿tenés
	// fiebre?" no pide el termómetro.
	return presentSentences(text).some(
		(t) => TAKE_TEMPERATURE.test(t) || PUT_THERMOMETER.test(t),
	);
}

// Qué oído nombró; si no dijo, el derecho.
export function earIn(text: string): "derecho" | "izquierdo" {
	// También abreviado: "el oído izq".
	return /\bizq/.test(normalize(text)) ? "izquierdo" : "derecho";
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
		// "¿Dónde exactamente te duele?", "¿dónde sentís el dolor?"; no "¿dónde
		// estabas cuando empezó el dolor?".
		/\bdonde\b(?:(?!\bcuando\b)[^?.!]){0,25}\b(duele|dolor)\b/.test(plain) ||
		// "¿En qué parte te duele?", "¿qué parte de la rodilla te duele?"
		/\bque (parte|zona|lugar)\b(?:(?!\bcuando\b)[^?.!]){0,30}\b(duele|dolor)\b/.test(
			plain,
		) ||
		// "¿Te duele donde voy a tocar?", "¿te duele acá?"
		/\bduele\b.{0,12}\b(donde (voy a )?toc\w*|aca|aqui)\b/.test(t) ||
		// Un pedido ("mostrame", "¿me señalás?", "¿podés indicarme?"), no un
		// plan: "te voy a indicar dónde hacer la radiografía" no.
		/\b(mostra(me|s)?|muestr(ame|e|eme)|senal(a|ame|as|e|eme)|indic(a|ame|as|ale|eme)|marc(a|ame|as)|(podes|podrias|puede|podria)( me)? (mostrar|senalar|indicar|marcar)(me)?)\b.{0,25}\b(donde|zona|parte|lugar)\b/.test(
			t,
		)
	);
}
