// Clasificador rápido de turnos del estudiante (plan.md, sección 5, versión
// 2): etiqueta cada turno y actualiza el estado del paciente antes de su
// próxima respuesta. Es por reglas: instantáneo y siempre da lo mismo. Las
// etiquetas quedan en el turno para que el evaluador las use.
import type { PatientState } from "@/lib/contracts/session";

export type TurnTag =
	| "pregunta_abierta"
	| "pregunta_cerrada"
	| "sugestiva"
	| "jerga"
	| "empatia"
	| "repetida";

function normalize(s: string) {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[¿?¡!.,;:]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

const OPEN_STARTS = [
	"que te trae",
	"que te pasa",
	"que te paso",
	"contame",
	"contanos",
	"describime",
	"como es",
	"como fue",
	"como te sentis",
	"como estas",
	"como empezo",
	"que sentis",
	"que te preocupa",
	"en que te puedo",
	"que mas",
];
const CLOSED_STARTS = [
	"tenes",
	"tuviste",
	"te duele",
	"sos ",
	"estas ",
	"fumas",
	"tomas",
	"hay ",
	"te paso",
	"alguna vez",
	"es ",
	"fue ",
	"sentis",
];
// Pregunta sugestiva: termina en ", ¿no?", "¿verdad?" o "¿cierto?". "No"
// tiene que ser una palabra entera ("¿todo bueno?" no cuenta) y "o no" es una
// pregunta neutra ("¿fumás o no?"). La usa también el evaluador.
export function isLeadingQuestion(text: string) {
	const t = text.trim().toLowerCase();
	if (/(?:^|[\s¿])o\s+no\s*\?*\s*$/u.test(t)) return false;
	// Con signo de pregunta, o con coma antes si la voz no transcribió el signo
	// ("te duele, no"). Una frase como "eso no" no es una pregunta.
	return (
		/(?:^|[\s,¿])(no|verdad|cierto|no es cierto)\s*\?+\s*$/u.test(t) ||
		/,\s*(no|verdad|cierto|no es cierto)\s*$/u.test(t)
	);
}
// Términos médicos que un paciente no entiende sin explicación.
const JARGON = [
	"odinofagia",
	"disfagia",
	"adenopatia",
	"exudado",
	"eritema",
	"febril",
	"afebril",
	"cefalea",
	"mialgia",
	"astenia",
	"anamnesis",
	"antecedentes patologicos",
	"faringoamigdalitis",
	"rinorrea",
	"disnea",
	"estreptococo",
	"hipertermia",
	"sintomatologia",
];
const EXPLAINS = ["o sea", "es decir", "quiere decir", "que significa", "osea"];
const EMPATHY = [
	"entiendo",
	"tranqui",
	"no te preocupes",
	"debe ser",
	"lamento",
	"que feo",
	"te acompano",
	"gracias por contarme",
	"imagino que",
	"es normal que",
	"estoy para ayudarte",
	"vamos a ver juntos",
];

export type Classification = {
	tags: TurnTag[];
	delta: Partial<PatientState>;
	motivo: string | null;
};

// Cuánto mueve cada etiqueta. Valores iniciales, a calibrar con un docente.
const DELTAS: Partial<Record<TurnTag, Partial<PatientState>>> = {
	pregunta_abierta: { confianza: 0.05 },
	empatia: { confianza: 0.1, ansiedad: -0.05 },
	jerga: { confianza: -0.05 },
	sugestiva: { confianza: -0.03 },
	repetida: { paciencia: -0.1 },
};

const MOTIVOS: Record<TurnTag, string> = {
	pregunta_abierta: "pregunta abierta",
	pregunta_cerrada: "pregunta cerrada",
	sugestiva: "pregunta sugestiva",
	jerga: "usó jerga sin explicar",
	empatia: "mostró empatía",
	repetida: "repitió una pregunta",
};

export function classifyStudentTurn(
	text: string,
	previousStudentTexts: string[],
): Classification {
	const t = normalize(text);
	const tags: TurnTag[] = [];
	const isQuestion =
		text.includes("?") ||
		OPEN_STARTS.some((w) => t.startsWith(w) || t.includes(` ${w}`));

	if (OPEN_STARTS.some((w) => t.startsWith(w) || t.includes(` ${w}`)))
		tags.push("pregunta_abierta");
	else if (
		isQuestion &&
		CLOSED_STARTS.some((w) => t.startsWith(w) || t.includes(` ${w}`))
	)
		tags.push("pregunta_cerrada");
	if (isLeadingQuestion(text)) tags.push("sugestiva");
	if (JARGON.some((w) => t.includes(w)) && !EXPLAINS.some((w) => t.includes(w)))
		tags.push("jerga");
	if (EMPATHY.some((w) => t.includes(w))) tags.push("empatia");
	if (
		isQuestion &&
		t.length > 8 &&
		previousStudentTexts.some((p) => normalize(p) === t)
	)
		tags.push("repetida");

	const delta: Partial<PatientState> = {};
	for (const tag of tags) {
		for (const [k, v] of Object.entries(DELTAS[tag] ?? {}) as [
			keyof PatientState,
			number,
		][]) {
			delta[k] = Math.round(((delta[k] ?? 0) + v) * 100) / 100;
		}
	}
	const moving = tags.filter((tag) => DELTAS[tag]);
	return {
		tags,
		delta,
		motivo: moving.length ? moving.map((tag) => MOTIVOS[tag]).join(", ") : null,
	};
}

// Nivel de confianza y paciencia en palabras, para avisarle al modelo de voz
// cuando cambia (sin números, para que no los diga).
export function stateBand(state: PatientState): string {
	const trust =
		state.confianza >= 0.7 ? "alta" : state.confianza >= 0.4 ? "media" : "baja";
	const patience = state.paciencia < 0.25 ? "poca" : "suficiente";
	return `confianza ${trust}, paciencia ${patience}`;
}
