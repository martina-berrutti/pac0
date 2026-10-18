// El estudiante da por terminado el examen hablando ("cerrá la boca", "ya
// está", "no me muestres más el oído"): la consulta cierra el examen y la
// cámara vuelve de frente (Persona 3). Solo se mira con un examen abierto.
import { normalize } from "@/lib/avatar/commands";

const END = [
	/\bcerr(a|ar|as|ala|ame)\b.*\bboca\b/,
	/\bpod(es|e|eis|ria|rias)\b.*\b(cerrar|tapar|bajar|volver|relajar|descansar)/,
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
	/\b(podes|puedes) (bajar|volver|relajarte|descansar)/,
];

// "No cierres la boca", "todavía no terminé": siguen examinando.
const KEEP = [
	/\bno (la )?cierr/,
	/\btodavia no\b/,
	/\baun no\b/,
	/\bno (esta|estamos) listo/,
	/\bno termine\b/,
];

export function asksToEndExam(text: string): boolean {
	const t = normalize(text);
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

export function asksForBloodPressure(text: string): boolean {
	const t = normalize(text);
	return (
		/\b(presion|tension|tensiometro)\b/.test(t) &&
		/\b(tom|med|mid|control)\w*/.test(t)
	);
}

// Tomar la temperatura ahora ("te tomo la temperatura", "te pongo el
// termómetro"). Preguntar por la historia ("¿te tomaste la temperatura?",
// "¿tuviste fiebre?") no abre el termómetro.
export function asksForTemperature(text: string): boolean {
	const t = normalize(text);
	return (
		/\b(tomo|tomar|tomarte|tomemos|tomamos|tomarla|mido|medir|medirte|chequeo|controlo)\b.{0,25}\b(temperatura|fiebre)\b/.test(
			t,
		) ||
		/\b(pongo|poner|ponerte|coloco|colocar|colocarte)\b.{0,20}\btermometro\b/.test(
			t,
		)
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
	return (
		/\bdonde\b.{0,15}\bduele/.test(t) ||
		/\b(mostr|muestr|senal|indic|marc)\w*\b.{0,25}\bdonde\b/.test(t)
	);
}
