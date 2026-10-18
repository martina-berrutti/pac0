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

import { hasKeyword, normalize } from "./rule-judge";

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
// Una frase que descarta no dice qué plantea: "no es un resfrío".
const RULES_OUT =
	/(^|\s)(descart\w*|no es|no creo|no parece|no seria|no tiene|no tenes)(\s|$)/;
// Frases de la hipótesis: "X, diferencial Y", "X o Y", "X; pediría Z".
const CLAUSES =
	/[,;.:()\n]|\s(?:o|u|vs|versus|pero|aunque|diferencial(?:es)?)\s/;

const words = (s: string) =>
	normalize(s)
		.split(/[^a-z]+/)
		.filter((w) => w.length >= 5 && !GENERIC.has(w));
// Misma raíz: "estreptococo" y "estreptocócica", "externo" y "externa".
const stem = (w: string) => w.slice(0, 7);

function matchesDiagnosis(c: ClinicalCase, text: string) {
	const t = normalize(text);
	return [c.truth.diagnosis, ...c.truth.acceptable].some((d) =>
		t.includes(normalize(d)),
	);
}

// Lo propio de un diferencial: sus palabras que no son del diagnóstico
// ("estreptocócica", "externa", "efusión"; "otitis" no).
function distinctive(c: ClinicalCase, d: string) {
	const own = new Set(
		words([c.truth.diagnosis, ...c.truth.acceptable].join(" ")).map(stem),
	);
	return words(d)
		.map(stem)
		.filter((w) => !own.has(w));
}

// Nombra el diferencial: entero o por lo propio de él.
export function namesDifferential(c: ClinicalCase, d: string, text: string) {
	const t = normalize(text).trim();
	if (!t) return false;
	if (t.includes(normalize(d))) return true;
	const said = new Set(words(t).map(stem));
	return distinctive(c, d).some((w) => said.has(w));
}

// Qué plantea la hipótesis: la primera frase que no descarta y nombra el
// diagnóstico o un diferencial. Si en esa frase aparece algo propio de un
// diferencial ("faringitis estreptocócica", "otitis media con efusión"), es
// ese diferencial aunque también diga "faringitis" u "otitis media".
export function judgeHypothesis(
	c: ClinicalCase,
	text: string,
): { matches: boolean; confused?: string } {
	for (const clause of normalize(text).split(CLAUSES)) {
		if (!clause.trim() || RULES_OUT.test(clause)) continue;
		const exact = clause.includes(normalize(c.truth.diagnosis));
		const confused = c.truth.differentials.find((d) =>
			namesDifferential(c, d, clause),
		);
		// Si el diagnóstico del caso es general ("faringoamigdalitis aguda") y el
		// diferencial es una causa ("estreptocócica"), nombrar los dos juntos no
		// es confundirse: "faringoamigdalitis estreptocócica" es más preciso.
		const general =
			confused &&
			normalize(confused).split(/\s+/).length === 1 &&
			matchesDiagnosis(c, clause);
		if (confused && !exact && !general) return { matches: false, confused };
		if (matchesDiagnosis(c, clause)) return { matches: true };
	}
	return { matches: false };
}

// Frases con las que el estudiante anuncia un diagnóstico que no es ni el del
// caso ni un diferencial ("creo que es una angina"). Se buscan sin tildes.
const ANNOUNCES =
	/(mi diagnostico es|el diagnostico es|lo que (tenes|tiene) es|se trata de|me inclino por|sospecho (que es|de)|(creo|pienso|me parece) que (es|seria|tenes|tiene) (una?|un) |(probablemente|seguramente) (sea|es|tengas|tenga) (una?|un) )\s*(\S+)?/;
// Lo que sigue a "creo que tenés un..." y no es un diagnóstico.
const NOT_A_DIAGNOSIS = new Set([
	"poco",
	"dolor",
	"fiebre",
	"malestar",
	"rato",
	"tiempo",
	"golpe",
]);

export type Spoken = NonNullable<DiagnosisFeedback["spoken"]>[number];

// Todo lo que el estudiante le dijo al paciente sobre qué tiene, frase por
// frase y en orden. Las preguntas y los descartes ("no es un resfrío") no
// cuentan.
export function spokenDiagnoses(c: ClinicalCase, turns: Turn[] = []): Spoken[] {
	const out: Spoken[] = [];
	for (const t of turns) {
		if (t.speaker !== "estudiante") continue;
		for (const raw of t.text.match(/[^.!?\n]+[.!?]?/g) ?? []) {
			const sentence = raw.trim();
			if (!sentence || sentence.endsWith("?") || sentence.startsWith("¿"))
				continue;
			const quote = sentence.slice(0, MAX_QUOTE);
			const judged = judgeHypothesis(c, sentence);
			if (judged.matches) {
				out.push({ quote, turnId: t.id, verdict: "correcto" });
			} else if (judged.confused) {
				out.push({
					quote,
					turnId: t.id,
					verdict: "diferencial",
					differential: judged.confused,
				});
			} else {
				const plain = normalize(sentence);
				const m = plain.match(ANNOUNCES);
				const next = m?.[m.length - 1];
				if (m && !RULES_OUT.test(plain) && next && !NOT_A_DIAGNOSIS.has(next))
					out.push({ quote, turnId: t.id, verdict: "otro" });
			}
		}
	}
	return out;
}

// Lo último que dijo en la consulta contra lo que escribió: si no coinciden,
// el informe lo marca y dice cuál era el correcto.
function mismatchFor(
	c: ClinicalCase,
	spoken: Spoken[],
	written: string,
	writtenMatches: boolean,
	writtenConfused: string | undefined,
): DiagnosisFeedback["mismatch"] {
	const last = spoken.at(-1);
	if (!last || !written) return undefined;
	const writtenVerdict = writtenMatches
		? "correcto"
		: writtenConfused
			? "diferencial"
			: "otro";
	const same =
		last.verdict === writtenVerdict &&
		(last.verdict !== "diferencial" || last.differential === writtenConfused) &&
		// Dos "otro" distintos tampoco coinciden: se comparan las palabras.
		(last.verdict !== "otro" ||
			words(last.quote).some((w) => words(written).includes(w)));
	if (same) return undefined;
	const bare = (x: string) => x.replace(/[.!\s]+$/, "");
	const base = `En la consulta le dijiste al paciente «${bare(last.quote)}», pero por escrito pusiste «${bare(written)}».`;
	const message =
		last.verdict === "correcto"
			? `${base} Lo que dijiste en voz alta era lo correcto: era ${c.truth.diagnosis}. Confiá en lo que te mostraron los datos.`
			: writtenMatches
				? `${base} Lo escrito era lo correcto, pero al paciente le quedó otra idea: aclarásela antes de terminar.`
				: `${base} No coinciden, y ninguno de los dos era el diagnóstico: era ${c.truth.diagnosis}.`;
	return { spoken: last.quote, turnId: last.turnId, written, message };
}

// Lo que dijo en voz alta que suma al razonamiento (evaluate.ts y
// ai-judge.ts): los diferenciales que nombró, si su última palabra fue el
// diagnóstico correcto y el texto, para buscar la justificación.
export function spokenReasoning(c: ClinicalCase, turns: Turn[] = []) {
	const spoken = spokenDiagnoses(c, turns);
	return {
		differentials: c.truth.differentials.filter((d) =>
			spoken.some((s) => namesDifferential(c, d, s.quote)),
		),
		lastCorrect: spoken.at(-1)?.verdict === "correcto",
		text: spoken.map((s) => s.quote).join(" "),
	};
}

// Lo último que le dijo al paciente sobre qué tiene (sin preguntas ni
// descartes).
function toldPatient(c: ClinicalCase, turns: Turn[]) {
	for (const t of [...turns].reverse()) {
		if (t.speaker !== "estudiante" || t.text.includes("?")) continue;
		const judged = judgeHypothesis(c, t.text);
		if (!judged.matches && !judged.confused) continue;
		return {
			quote: t.text.slice(0, MAX_QUOTE),
			turnId: t.id,
			correct: judged.matches,
		};
	}
	return undefined;
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
	const closingText = [yours, ...(closing?.differentials ?? [])].join(" ");
	const byId = new Map(items.map((i) => [i.itemId, i]));

	const cluesFound: DiagnosisFeedback["cluesFound"] = [];
	const cluesMissed: DiagnosisFeedback["cluesMissed"] = [];
	for (const k of truth.keyClues) {
		const item = byId.get(k.itemId);
		if (item && item.status !== "no") {
			cluesFound.push({
				clue: k.clue,
				why: k.why,
				usedInClosing: k.keywords.some((w) => hasKeyword(closingText, w)),
				evidence: item.evidence,
			});
		} else {
			cluesMissed.push({ clue: k.clue, why: k.why });
		}
	}

	// Cada diferencial que escribió, las frases de la hipótesis y lo que dijo
	// en voz alta durante la consulta.
	const named = [
		...normalize(yours).split(CLAUSES),
		...(closing?.differentials ?? []),
		...spokenDiagnoses(c, turns).flatMap((s) =>
			normalize(s.quote).split(CLAUSES),
		),
	];
	const differentialsHit = truth.differentials.filter((d) =>
		named.some((x) => namesDifferential(c, d, x)),
	);
	const differentialsMissed = truth.differentials
		.filter((d) => !differentialsHit.includes(d))
		.map((d) => ({ differential: d, hint: truth.differentialHints[d] }));

	// Si nombra un diferencial, es ese aunque el juez con IA diga que coincide
	// (evaluate y ai-judge aplican la misma regla al puntaje).
	const judged = judgeHypothesis(c, yours);
	const confused = judged.confused;
	const matches = !confused && (hypothesisMatches ?? judged.matches);
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
		...(() => {
			const spoken = spokenDiagnoses(c, turns);
			const mismatch = mismatchFor(c, spoken, yours, matches, confused);
			return {
				...(spoken.length > 0 ? { spoken } : {}),
				...(mismatch ? { mismatch } : {}),
			};
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
	if (d.mismatch) {
		out.push(
			"Que lo que le decís al paciente y lo que escribís coincidan; si cambiás de idea, explicale por qué.",
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
	// Las notas del razonamiento ya están dichas arriba, mejor explicadas.
	for (const m of mistakes.filter(
		(x) => !x.critical && x.tag !== "razonamiento",
	))
		out.push(m.nextTime);
	return [...new Set(out.filter((x) => x.trim()))].slice(0, MAX_IMPROVEMENTS);
}
