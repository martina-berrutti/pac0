// Interpreta una instrucción de examen en texto ("abrí más, decí aaa").
// Con voz, la misma decisión la toma la herramienta examinar del modelo.
import type { Personality } from "@/cases/schema";
import type { ExamVariant, InstructionClarity } from "@/lib/contracts/exam";
import {
	asksForBloodPressure,
	asksForTemperature,
} from "@/lib/exam/end-intent";

// Pedidos de examen: hace falta una acción, no alcanza con nombrar la zona.
// "¿Desde cuándo te duele la garganta?" es anamnesis, no examen. Se comparan
// sin tildes.
const EXAM_PATTERNS = [
	// "Abrí", "¿me abrís?"; no "¿te duele cuando abrís la boca?" (ni "cuando
	// tragás o abrís la boca"). "Necesito que abra/abras la boca" y "¿me abre
	// la boca?" (usted) sí.
	/(?<!\b(cuando|si)\s+(\w+\s+(o|y)\s+)?((me|la|le|lo|se)\s+)?)\babr(i|a|as|e|ime|ame|ila|is)\b/,
	// "¿Podés abrir?", "¿podés abrir bien?", "¿podés abrir la boca?"; no
	// "¿podés abrir la ventana?".
	/\b(podes|puede|podrias|podria|queres|quiere)\s+abrir(\s+(bien|grande|mas|un\s+poco))*(\s+la\s+boca)?[\s?!.,]*$/,
	// "Podés abrir la boca, por favor" (sí); "¿te molesta al abrir la boca?" (no).
	/\b(podes|puede|podrias|podria|queres|quiere)\s+abrir\s+((bien|grande|mas)\s+)*la\s+boca\b/,
	/\b(deci|diga|decime|digame|hace|haga)\s+a{2,}/,
	// "Volvé a abrir la boca": otra vez, durante el examen.
	/\bvolve a abrir\b/,
	// "Sacá la lengua", "sacame la lengua", "saque la lengua".
	/\bsa(c(a|ame|ate)|que|queme)\s+(la\s+)?lengua\b/,
	// "¿Me mostrás la garganta?", "mostrame la lengua".
	/\b(mostra(me|s)|muestr(ame|e|eme|es))\b.*\b(garganta|boca|lengua|amigdalas)\b/,
	// Con un verbo que lo pide: "¿puedo revisarte?", "me dejás ver la
	// garganta". "¿Algún médico llegó a revisarte?" es anamnesis, no examen.
	// El verbo tiene que apuntar al paciente o a una parte del cuerpo: "vamos a
	// ver qué te pasa" o "¿puedo ver tus análisis?" no son examen.
	// "Verte"/"verle" solo: "¿la receta? quiero verla" no es examen. Y no un
	// control más adelante: "quiero verte de nuevo en 48 horas".
	/\b(puedo|podemos|voy a|vamos a|dejas|deja|dejame|dejaria|dejarias|autorizas a|autoriza a|quiero|necesito|tengo que|permitis|permite|podria)\s+((revisar|examinar|mirar)(te|le|lo|la)|ver(te|le))\b(?!\s+(de nuevo|otra vez|en \d|en (un|una|unos|unas|dos|tres|cuatro|cinco|siete|diez|quince)\b|dentro|la (semana|proxima)|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo|mes)|manana|despues|pasado|cuando|al control|a control|para control|con los))/,
	/\b(puedo|podemos|voy a|vamos a|dejas|deja|dejame|dejaria|dejarias|quiero|necesito|tengo que|permitis|permite|podria)\s+(revisar|examinar|mirar|ver)\s+(adentro\s+(de\s+)?)?((la|el|los|las|tu|su)\s+)?(garganta|boca|oido|oidos|oreja|amigdalas|lengua)\b/,
	// El verbo solo, como frase entera: "¿me dejás ver?", "¿puedo mirar
	// adentro?", "voy a revisar", "¿te puedo revisar ahora?", "¿te puedo
	// revisar? Así veo cómo está". "Vamos a ver" / "voy a ver" sueltos no:
	// suelen ser un relleno ("bueno, vamos a ver...").
	/\b(puedo|podemos|dejas|deja|dejame|permitis|permite|podria)\s+(revisar|examinar|mirar|ver)(\s*,?\s+(adentro|un poco|un segundo|un segundito|un momento|un momentito|un ratito|bien|ahora|por favor))*\s*([?!.]|$)/,
	/\b(voy a|vamos a)\s+(revisar|examinar|mirar)(\s*,?\s+(adentro|un poco|un segundo|un segundito|un momento|un momentito|un ratito|bien|ahora|por favor))*\s*([?!.]|$)/,
	/\blinterna\b/,
];
// "Abrí más", no cualquier "más": "¿me dejás ver? así sé más" no es claro.
// Sin tildes: "abrí grande", "abrí un poquito más", "saque la lengua".
const FULL_OPEN_WORDS = [
	"abri mas",
	"abra mas",
	"abrila mas",
	"abri grande",
	"abra grande",
	"un poco mas",
	"poquito mas",
	"mas grande",
	"aaa",
	"deci a",
	"saca la lengua",
	"saque la lengua",
	"bien la lengua",
	"lengua afuera",
	"bien grande",
	"bien abierta",
	"lo mas que",
	"todo lo que puedas",
	"todo lo que pueda",
];
const CONSENT_WORDS = [
	"permiso",
	"puedo",
	"te parece",
	"me dejás",
	"me dejas",
	"te voy a",
	"vamos a",
	"si querés",
	"si queres",
	"querés que",
	"queres que",
	"estás de acuerdo",
	"estas de acuerdo",
	"está bien si",
	"esta bien si",
	"te molesta si",
	"me permitís",
	"me permitis",
	"me permite",
	"le parece",
	// Usted y condicional: "¿me deja revisarla?", "¿me dejaría…?", "¿le
	// molesta si la reviso?", "¿podría revisarla?", "¿podemos revisar?".
	"me deja",
	"le molesta si",
	"podría",
	"podria",
	"podemos",
	"me autoriz",
	// Al saludar ("hola, con tu permiso") no alcanza: va con el examen.
	"con tu permiso",
	"con su permiso",
];

function includesAny(text: string, words: string[]) {
	const t = text.toLowerCase();
	return words.some((w) => t.includes(w));
}

function plainText(text: string) {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

// "Te reviso" es un pedido; "te revisó" (alguien, antes) no. Estos se comparan
// con las tildes puestas.
const FIRST_PERSON =
	// También el subjuntivo: "¿querés que te revise?". No un control más
	// adelante: "si empeora, venís y te reviso otra vez".
	/(^|[^\p{L}])(te|le|lo|la)\s+(voy\s+a\s+)?(reviso|revisar|revise|examino|examinar|examine|miro|mirar|mire)(?!\p{L})(?!\s+(de nuevo|otra vez|en \d|en (un|una|unos|unas|dos|tres|cuatro|cinco|siete|diez|quince)(?!\p{L})))/u;
// "Volvé en una semana así te reviso", "en unos días te miro": un control,
// no el examen de ahora.
const FOLLOW_UP =
	/\b(volve|vuelva|veni|venis|venga)\s+(en|el|la|si|cuando|manana|dentro|a control|a verme)\b|\bsi (empeora|no mejora|sigue|seguis|te sigue)\b|\ben (un par de|unos|unas|una|un|\d+|dos|tres|cuatro|cinco|siete|diez|quince) (dias|semanas?|horas)\b/;

// Nombra otra parte del cuerpo y no la boca: "te reviso el cuello" o "te
// tomo la presión" no son un examen de garganta.
// La otra zona tiene que ser lo que se examina ("te reviso el cuello"), no
// un síntoma en la misma frase ("te reviso, ¿tenés los ojos llorosos?").
// También con algo en el medio: "te reviso también el cuello", "te voy a
// revisar un poco el cuello".
const OTHER_ZONE =
	/\b(revis|mir|examin|ver|chequ|palp|escuch)\w*\s+((tambien|un poco|un poquito|bien|aca|ahora)\s+)?(el|la|los|las|tu|tus|su|sus)\s+(cuello|ganglios?|pecho|presion|tension|brazos?|panza|abdomen|corazon|pulmon\w*|espalda|nariz|ojos?|piernas?|rodillas?|oidos?|orejas?)\b/;
const MOUTH =
	/\b(boca|garganta|faringe|lengua|amigdalas?|a{2,}|abr(i|a|as|e|ime|ame|ila|is|ir))\b/;

export function namesOtherZone(text: string) {
	const plain = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
	return OTHER_ZONE.test(plain) && !MOUTH.test(plain);
}

export function isExamRequest(text: string) {
	const lower = text.toLowerCase();
	const plain = plainText(text);
	if (FOLLOW_UP.test(plain)) return false;
	return FIRST_PERSON.test(lower) || EXAM_PATTERNS.some((p) => p.test(plain));
}

// Frases que piden o nombran el permiso. "Permiso" a secas no alcanza: "hola,
// con permiso" es un saludo al entrar, no un permiso para examinar.
const ASKS_PERMISSION = [
	"me das permiso",
	"me dás permiso",
	"me da permiso",
	"me darías permiso",
	"tengo permiso",
	"tengo tu permiso",
	"pido permiso",
	"pedirte permiso",
	"pedirle permiso",
];
// "Permiso para revisarte" sí; "¿pediste permiso para faltar?" no.
const PERMISSION_FOR_EXAM =
	/permiso\s+para\s+(revisar|examinar|mirar|ver|tomar|escuchar|tocar|poner|medir)/;

// Permiso para examinar: pedirlo explícitamente, o pedirlo junto con el
// examen. "¿Puedo preguntarte la edad?" no autoriza a abrirle la boca.
export function asksConsent(text: string) {
	if (includesAny(text, ASKS_PERMISSION)) return true;
	const plain = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
	if (PERMISSION_FOR_EXAM.test(plain)) return true;
	// "¿Te puedo tomar la temperatura / la presión?" también pide permiso para
	// examinar.
	return (
		includesAny(text, CONSENT_WORDS) &&
		(isExamRequest(text) ||
			asksForTemperature(text) ||
			asksForBloodPressure(text))
	);
}

export function interpretExamInstruction(
	text: string,
	personality: Personality,
	consentGiven: boolean,
): { clarity: InstructionClarity; variant: ExamVariant; consent: boolean } {
	const consent = consentGiven || asksConsent(text);
	const clarity: InstructionClarity = includesAny(
		plainText(text),
		FULL_OPEN_WORDS,
	)
		? "alta"
		: "media";
	return {
		clarity,
		variant: decideExam(clarity, personality, consent),
		consent,
	};
}

// Qué variante se ve según la claridad de la instrucción (plan.md, sección 6:
// "abrí la boca en tres niveles"). La usan el texto y la herramienta examinar.
export function decideExam(
	clarity: InstructionClarity,
	personality: Personality,
	consent: boolean,
): ExamVariant {
	// Cooperación baja: no abre hasta que le expliquen y pidan permiso.
	if (personality.cooperacion < 0.5 && !consent) return "negado";
	return clarity === "alta" ? "completa" : "parcial";
}
