// Interpreta una instrucción de examen en texto ("abrí más, decí aaa").
// Con voz, la misma decisión la toma la herramienta examinar del modelo.
import type { Personality } from "@/cases/schema";
import type { ExamVariant, InstructionClarity } from "@/lib/contracts/exam";

// Pedidos de examen: hace falta una acción, no alcanza con nombrar la zona.
// "¿Desde cuándo te duele la garganta?" es anamnesis, no examen. Se comparan
// sin tildes.
const EXAM_PATTERNS = [
	/\babr(i|a|ime|ame|ila|is)\b/,
	/\b(podes|puede|podrias|podria|queres|quiere)\s+abrir\b/,
	/\b(deci|diga|decime|digame)\s+a{2,}/,
	/\ba{3,}\b/,
	/\bsac(a|ate|que)\s+(la\s+)?lengua\b/,
	/\b(revisar|examinar|mirar)(te|le|lo|la)\b/,
	/\b(puedo|podemos|dejas|deja)\s+(revisar|examinar|mirar)\b/,
	/\blinterna\b/,
];
const FULL_OPEN_WORDS = [
	"más",
	"mas ",
	"aaa",
	"decí a",
	"deci a",
	"sacá la lengua",
	"saca la lengua",
	"lengua afuera",
	"bien grande",
	"bien abierta",
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
	"te molesta si",
];

function includesAny(text: string, words: string[]) {
	const t = text.toLowerCase();
	return words.some((w) => t.includes(w));
}

// "Te reviso" es un pedido; "te revisó" (alguien, antes) no. Estos se comparan
// con las tildes puestas.
const FIRST_PERSON =
	// También el subjuntivo: "¿querés que te revise?".
	/(^|[^\p{L}])(te|le|lo|la)\s+(voy\s+a\s+)?(reviso|revisar|revise|examino|examinar|examine|miro|mirar|mire)(?!\p{L})/u;

export function isExamRequest(text: string) {
	const lower = text.toLowerCase();
	const plain = lower.normalize("NFD").replace(/\p{Diacritic}/gu, "");
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
	"con tu permiso",
	"con su permiso",
	"pido permiso",
	"pedirte permiso",
	"pedirle permiso",
	"permiso para",
];

// Permiso para examinar: pedirlo explícitamente, o pedirlo junto con el
// examen. "¿Puedo preguntarte la edad?" no autoriza a abrirle la boca.
export function asksConsent(text: string) {
	if (includesAny(text, ASKS_PERMISSION)) return true;
	return includesAny(text, CONSENT_WORDS) && isExamRequest(text);
}

export function interpretExamInstruction(
	text: string,
	personality: Personality,
	consentGiven: boolean,
): { clarity: InstructionClarity; variant: ExamVariant; consent: boolean } {
	const consent = consentGiven || asksConsent(text);
	const clarity: InstructionClarity = includesAny(text, FULL_OPEN_WORDS)
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
