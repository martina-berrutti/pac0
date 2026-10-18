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
	"que te preocupe",
	"que te trajo",
	"que te anda pasando",
	"que te esta pasando",
	"que te sucede",
	"hay algo mas",
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
	// "¿De verdad?", "¿es cierto?" solos son sorpresa, no sugestivas.
	if (
		/^[¿\s]*(de\s+verdad|en\s+serio|es\s+cierto|cierto|verdad)\s*\?*\s*$/u.test(
			t,
		)
	)
		return false;
	// "¿Por qué no?" es una pregunta abierta, no sugestiva.
	if (/por\s+qu[eé]\s+no\s*\?*\s*$/u.test(t)) return false;
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
	"no te preocupes",
	"lamento",
	"que feo",
	"te acompano",
	"gracias por contarme",
	"imagino que",
	"es normal que",
	"estoy para ayudarte",
	"vamos a ver juntos",
];

// El paciente pidió que le repitan ("¿cómo?", "no le escuché"): repetir la
// pregunta es lo correcto, no una pregunta repetida. La usa también el
// evaluador.
const REPEAT_REQUESTS = [
	"repet",
	"no te escuche",
	"no le escuche",
	"no escuche",
	"no te entendi",
	"no le entendi",
	"mas fuerte",
	"como dijo",
	"como dijiste",
	"que dijo",
	"que dijiste",
	"no te oi",
	"no le oi",
	"no oi",
];
// Pedidos cortos que son toda la frase: "¿qué?", "¿eh?", "¿perdón?".
const SHORT_REPEAT = /^(como|que|eh|perdon|perdon como|como perdon|mande)$/;

export function askedToRepeat(patientText: string) {
	const t = normalize(patientText);
	return SHORT_REPEAT.test(t) || REPEAT_REQUESTS.some((w) => t.includes(w));
}

// Empatía, frase por frase: en una pregunta, "¿es normal que tengas fiebre?"
// no lo es, pero "Entiendo. ¿Tenés fiebre?" sí. "No entiendo" no lo es, y
// "tranquila" cuenta suelto, no en "¿dormís tranquilo?".
const FEELING =
	/(^| )deb(e|e de) ser ((muy|re|bastante|tan|realmente|super|sumamente|una situacion) )*(dificil|feo|feisimo|molesto|horrible|terrible|duro|incomodo|angustiante|preocupante|cansador|agotador|doloroso|complicado|bravo|pesado|jodido|una pesadilla|un garron|un embole)( |$)/;

function sentenceShowsEmpathy(t: string, question: boolean) {
	if (/(^| )no (te |le |lo |la )?entiendo( |$)/.test(t)) return false;
	// "Debe ser difícil" (también "debe ser difícil, ¿no?") sí; "debe ser viral" no.
	if (FEELING.test(t)) return true;
	if (/(quedate|estate|esta) tranquil[ao]/.test(t)) return true;
	if (question) {
		if (/(^| )(tranqui|tranquil[ao]s?)( |$)/.test(t)) return false;
		if (/(es normal que|imagino que|debe ser)/.test(t)) return false;
	} else if (/(^| )(tranqui|tranquil[ao]s?)( |$)/.test(t)) return true;
	// Desde el comienzo de una palabra: "reglamento" no es "lamento".
	return EMPATHY.some((w) => new RegExp(`(^| )${w}`).test(t));
}

// La usa también el paciente sin IA.
export function showsEmpathy(text: string) {
	const sentences = text.match(/[^.?!]+[.?!]*/g) ?? [];
	return sentences.some((s) =>
		sentenceShowsEmpathy(normalize(s), s.includes("?") || s.includes("¿")),
	);
}

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
	// Lo último que dijo el paciente: si pidió que le repitan, repetir no cuenta.
	lastPatientText = "",
): Classification {
	const t = normalize(text);
	const tags: TurnTag[] = [];
	// La voz a veces transcribe sin signos ("tenes fiebre"): también cuenta
	// como pregunta si empieza como una.
	const isQuestion =
		text.includes("?") ||
		OPEN_STARTS.some((w) => t.startsWith(w) || t.includes(` ${w}`)) ||
		CLOSED_STARTS.some((w) => t.startsWith(w));

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
	if (showsEmpathy(text)) tags.push("empatia");
	if (
		isQuestion &&
		t.length > 8 &&
		!askedToRepeat(lastPatientText) &&
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
