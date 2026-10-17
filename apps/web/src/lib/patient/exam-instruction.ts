// Interpreta una instrucción de examen en texto ("abrí más, decí aaa").
// Con voz, la misma decisión la toma la herramienta examinar del modelo.
import type { Personality } from "@/cases/schema";
import type { ExamVariant, InstructionClarity } from "@/lib/contracts/exam";

const EXAM_WORDS = [
	"abr",
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
	return includesAny(text, EXAM_WORDS);
}

export function asksConsent(text: string) {
	return includesAny(text, CONSENT_WORDS);
}

export function interpretExamInstruction(
	text: string,
	personality: Personality,
	consentGiven: boolean,
): { clarity: InstructionClarity; variant: ExamVariant; consent: boolean } {
	const consent = consentGiven || asksConsent(text);
	const full = includesAny(text, FULL_OPEN_WORDS);
	const clarity: InstructionClarity = full ? "alta" : "media";
	// Cooperación baja: no abre hasta que le expliquen y pidan permiso
	// (plan.md, sección 6, nivel 3).
	if (personality.cooperacion < 0.5 && !consent) {
		return { clarity, variant: "negado", consent };
	}
	return { clarity, variant: full ? "completa" : "parcial", consent };
}
