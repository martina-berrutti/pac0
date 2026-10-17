// Interpreta una instrucción de examen en texto ("abrí más, decí aaa").
// Con voz, la misma decisión la toma la herramienta examinar del modelo.
import type { Personality } from "@/cases/schema";
import type { ExamVariant, InstructionClarity } from "@/lib/contracts/exam";

const EXAM_WORDS = [
	"boca",
	"garganta",
	"decí a",
	"deci a",
	"aaa",
	"lengua",
	"examin",
	"revis",
	"mirar",
	"linterna",
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
	"¿me dejás",
	"me dejas",
	"te voy a",
	"vamos a",
	"si querés",
	"está bien si",
	"te molesta si",
];

function includesAny(text: string, words: string[]) {
	const t = text.toLowerCase();
	return words.some((w) => t.includes(w));
}

export function isExamRequest(text: string) {
	// "abr" solo al empezar una palabra: "palabra" o "cabra" no son examen.
	return /(^|[^\p{L}])abr/iu.test(text) || includesAny(text, EXAM_WORDS);
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
