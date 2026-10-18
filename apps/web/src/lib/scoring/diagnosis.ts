// Devolución del diagnóstico (Persona 1): si encontró el problema, con qué
// datos del caso, qué lo distingue de los diferenciales y qué le dijo al
// paciente. No pone puntaje: el razonamiento lo puntúa evaluate.ts. Arma
// también los "puntos a mejorar" del informe, en orden de importancia.
import type { ClinicalCase } from "@/cases/schema";
import type {
	DiagnosisFeedback,
	ItemResult,
	Mistake,
} from "@/lib/contracts/report";
import type { Turn } from "@/lib/contracts/session";

import { normalize } from "./rule-judge";

const MAX_QUOTE = 300;
const MAX_IMPROVEMENTS = 5;
// Palabras del diagnóstico que solas no alcanzan para estar "cerca".
const GENERIC = new Set([
	"aguda",
	"agudo",
	"derecha",
	"derecho",
	"izquierda",
	"izquierdo",
	"infecciosa",
	"comun",
	"cronica",
]);
// Al paciente le dice qué descarta, no qué tiene.
const RULES_OUT = ["descart", "no es ", "no creo", "no parece"];

const words = (s: string) =>
	normalize(s)
		.split(/[^a-z]+/)
		.filter((w) => w.length >= 5 && !GENERIC.has(w));

function matchesDiagnosis(c: ClinicalCase, text: string) {
	const t = normalize(text);
	return [c.truth.diagnosis, ...c.truth.acceptable].some((d) =>
		t.includes(normalize(d)),
	);
}

// Diferencial nombrado: entero, o por su palabra principal si esa palabra no
// es también del diagnóstico ("faringoamigdalitis" sí; "otitis" no).
function namesDifferential(c: ClinicalCase, d: string, text: string) {
	const t = normalize(text);
	if (t.includes(normalize(d))) return true;
	const head = words(d)[0];
	const own = normalize([c.truth.diagnosis, ...c.truth.acceptable].join(" "));
	return head !== undefined && !own.includes(head) && t.includes(head);
}

// Si nombra un diferencial más específico que contiene lo aceptable (por
// ejemplo "otitis media con efusión" contra "otitis media"), cuenta como el
// diferencial.
function confusedWith(c: ClinicalCase, text: string) {
	const t = normalize(text);
	const named = c.truth.differentials.find((d) =>
		namesDifferential(c, d, text),
	);
	if (!named) return undefined;
	const exact = t.includes(normalize(c.truth.diagnosis));
	const moreSpecific = c.truth.acceptable.some((a) =>
		normalize(named).includes(normalize(a)),
	);
	if (exact || (matchesDiagnosis(c, text) && !moreSpecific)) return undefined;
	return named;
}

// Lo último que le dijo al paciente sobre qué tiene (sin preguntas ni
// descartes).
function toldPatient(c: ClinicalCase, turns: Turn[]) {
	const said = turns
		.filter((t) => t.speaker === "estudiante" && !t.text.includes("?"))
		.filter(
			(t) =>
				matchesDiagnosis(c, t.text) ||
				c.truth.differentials.some((d) =>
					normalize(t.text).includes(normalize(d)),
				),
		)
		.at(-1);
	if (!said) return undefined;
	const correct = matchesDiagnosis(c, said.text) && !confusedWith(c, said.text);
	const rulesOut = RULES_OUT.some((w) => normalize(said.text).includes(w));
	if (!correct && rulesOut) return undefined;
	return {
		quote: said.text.slice(0, MAX_QUOTE),
		turnId: said.id,
		correct,
	};
}

export function diagnosisFeedback(
	c: ClinicalCase,
	items: ItemResult[],
	closing: { hypothesis: string; differentials: string[] } | null,
	turns: Turn[],
	// Lo que decidió el juez (reglas o IA): manda sobre la comparación de texto.
	hypothesisMatches?: boolean,
): DiagnosisFeedback {
	const { truth } = c;
	const yours = closing?.hypothesis.trim().slice(0, MAX_QUOTE) ?? "";
	const closingText = normalize(
		[yours, ...(closing?.differentials ?? [])].join(" "),
	);
	const byId = new Map(items.map((i) => [i.itemId, i]));

	const cluesFound: DiagnosisFeedback["cluesFound"] = [];
	const cluesMissed: DiagnosisFeedback["cluesMissed"] = [];
	for (const k of truth.keyClues) {
		const item = byId.get(k.itemId);
		if (item && item.status !== "no") {
			cluesFound.push({
				clue: k.clue,
				why: k.why,
				usedInClosing: k.keywords.some((w) =>
					closingText.includes(normalize(w)),
				),
				evidence: item.evidence,
			});
		} else {
			cluesMissed.push({ clue: k.clue, why: k.why });
		}
	}

	const allClosing = [yours, ...(closing?.differentials ?? [])].join(" ");
	const differentialsHit = truth.differentials.filter((d) =>
		namesDifferential(c, d, allClosing),
	);
	const differentialsMissed = truth.differentials
		.filter((d) => !differentialsHit.includes(d))
		.map((d) => ({ differential: d, hint: truth.differentialHints[d] }));

	const confused = yours ? confusedWith(c, yours) : undefined;
	const matches =
		hypothesisMatches ?? (matchesDiagnosis(c, yours) && !confused);
	const shared = words(yours).some((w) => words(truth.diagnosis).includes(w));
	const result: DiagnosisFeedback["result"] = !yours
		? "sin_hipotesis"
		: matches
			? "acertaste"
			: shared && !confused
				? "cerca"
				: "otro_diagnostico";

	const total = truth.keyClues.length;
	const found = cluesFound.length;
	const hint = confused ? truth.differentialHints[confused] : undefined;
	const message = {
		sin_hipotesis: `No planteaste un diagnóstico. Era ${truth.diagnosis}.`,
		acertaste: `Acertaste: era ${truth.diagnosis}.${
			total > 0 ? ` Encontraste ${found} de ${total} datos clave.` : ""
		}`,
		cerca: `Estuviste cerca: planteaste «${yours}», pero era ${truth.diagnosis}. Hay que precisar cuál es.`,
		otro_diagnostico: confused
			? `Planteaste ${confused}, que era un diferencial para pensar, pero era ${truth.diagnosis}.${hint ? ` ${hint}` : ""}`
			: `Tu hipótesis («${yours}») no coincide: era ${truth.diagnosis}. Mirá los datos clave que llevaban ahí.`,
	}[result];

	return {
		yours,
		result,
		message,
		...(confused
			? { confusedWith: { differential: confused, hint: hint ?? "" } }
			: {}),
		differentialsHit,
		differentialsMissed,
		cluesFound,
		cluesMissed,
		...(() => {
			const told = toldPatient(c, turns);
			return told ? { toldPatient: told } : {};
		})(),
	};
}

// Error (sin puntos) si le dijo al paciente un diagnóstico equivocado.
export function toldPatientMistake(
	c: ClinicalCase,
	d: DiagnosisFeedback,
): Mistake | null {
	const told = d.toldPatient;
	if (!told || told.correct) return null;
	return {
		tag: "le-dijo-otro-diagnostico",
		what: `Le dijiste al paciente algo que no era: «${told.quote}». Era ${c.truth.diagnosis}.`,
		why: "Un diagnóstico equivocado confunde al paciente y puede hacer que no siga el tratamiento correcto.",
		nextTime:
			"Antes de decirle qué tiene, juntá los datos clave; si dudás, contale qué vas a hacer para confirmarlo.",
		source: "Diagnóstico y diferenciales del caso",
		critical: false,
		evidence: [{ turnId: told.turnId, quote: told.quote }],
	};
}

// Puntos a mejorar, del más importante al menos: errores críticos, el
// diagnóstico, los datos clave, los diferenciales y el resto de los errores.
export function improvementsFor(
	c: ClinicalCase,
	d: DiagnosisFeedback,
	mistakes: Mistake[],
): string[] {
	const out: string[] = mistakes
		.filter((m) => m.critical)
		.map((m) => m.nextTime);
	const missed = d.cluesMissed.map((k) => k.clue.toLowerCase());
	if (d.result === "sin_hipotesis") {
		out.push(
			"Cerrá siempre con una hipótesis principal y al menos un diagnóstico diferencial.",
		);
	} else if (d.confusedWith?.hint) {
		out.push(
			`Repasá qué distingue ${c.truth.diagnosis} de ${d.confusedWith.differential}: ${d.confusedWith.hint}`,
		);
	} else if (d.result !== "acertaste") {
		out.push(
			`Repasá ${c.truth.diagnosis}: qué síntomas y hallazgos lo diferencian de los otros cuadros.`,
		);
	}
	if (missed.length > 0) {
		out.push(
			`${d.result === "acertaste" ? "Aunque acertaste, te faltó buscar" : "Buscá los datos que llevaban al diagnóstico"}: ${missed.join("; ")}.`,
		);
	}
	const unused = d.cluesFound.filter((k) => !k.usedInClosing);
	if (d.result === "acertaste" && unused[0]) {
		out.push(
			`Justificá el diagnóstico con lo que encontraste, por ejemplo: ${unused[0].clue.toLowerCase()}.`,
		);
	}
	if (d.differentialsMissed.length > 0) {
		out.push(
			`Pensá también en: ${d.differentialsMissed.map((x) => x.differential).join(", ")}.`,
		);
	}
	for (const m of mistakes.filter((x) => !x.critical)) out.push(m.nextTime);
	return [...new Set(out)].slice(0, MAX_IMPROVEMENTS);
}
