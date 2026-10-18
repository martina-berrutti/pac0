// Paciente simulado sin IA: responde por palabras clave desde su PatientBrief.
// Sirve para trabajar sin claves de API y como respaldo si falla el modelo.
// Recibe el brief, nunca el caso: no puede revelar el diagnóstico.
import { SENSITIVE_KEYS } from "@/cases/schema";
import type { PatientState } from "@/lib/contracts/session";

import type { PatientBrief } from "./brief";
import { showsEmpathy } from "./turn-classifier";

// Tema -> palabras de la pregunta -> clave del perfil o de la historia.
// Gana el primero que coincide: los temas puntuales van antes que los síntomas
// y que "desde cuándo", así "¿alguien más tiene fiebre?" va a contactos y
// "¿hace cuánto que fumás?" a tabaco.
const TOPICS: { key: string; words: string[] }[] = [
	{
		key: "contactos",
		words: [
			"alguien más",
			"alguien mas",
			"contacto",
			"cerca tuyo",
			"alguien con",
			"alguien enfermo",
			"alguien cercano",
		],
	},
	// Antes que la familia: "¿vivís con tu familia?" es dónde vive. "¿Con
	// quién vive?" (usted) también.
	{
		key: "vive",
		words: [
			"vivís",
			"vivis",
			"vive con",
			"vive solo",
			"vive sola",
			"con quién vive",
			"con quien vive",
		],
	},
	// Antes que antecedentes: "¿antecedentes familiares?" o "¿tus padres
	// tienen alguna enfermedad?" son de la familia.
	{
		key: "familia",
		words: [
			"familia",
			"tus padres",
			"sus padres",
			"tu papá",
			"tu papa",
			"tu mamá",
			"tu mama",
			"tu padre",
			"tu madre",
			"su padre",
			"su madre",
			"hermanos",
		],
	},
	// Antes que la medicación: "¿sos alérgico a algún medicamento?" es una
	// alergia (en otitis, la penicilina).
	{ key: "alergias", words: ["alérgic", "alergic", "alergia"] },
	{
		key: "alcohol",
		// "Tomás" solo no alcanza: "¿tomás mate?" no es una pregunta de alcohol.
		words: [
			"alcohol",
			"tomás alcohol",
			"tomas alcohol",
			"tomás vino",
			"tomas vino",
			"bebida",
			"cerveza",
		],
	},
	// Antes que el tabaco: "¿fumás marihuana?" es de drogas.
	{
		key: "drogas",
		words: ["drogas", "consumís", "consumis", "marihuana", "porro"],
	},
	// "Fuma" desde el comienzo: "¿fumás?", "¿fuma?" (usted), "¿fumaste?",
	// "¿fumabas?".
	{ key: "tabaco", words: ["fuma", "fumás", "tabaco", "cigarr"] },
	{
		key: "adherencia",
		// "Todos los días" solo no: "¿tomás café todos los días?" es del café.
		words: [
			"olvid",
			"te salteás",
			"te salteas",
			"saltea",
			"dejás de tomar",
			"dejas de tomar",
			"todos los días la",
			"todos los dias la",
			"la tomás todos",
			"la tomas todos",
			"las tomás todos",
			"las tomas todos",
			"pastilla todos",
			"pastillas todos",
		],
	},
	{
		key: "medicacion",
		words: [
			"medicación",
			"medicacion",
			"medicamento",
			"tomaste algo",
			"tomás algo",
			"tomas algo",
			"estás tomando",
			"estas tomando",
			"remedio",
			"pastilla",
			"ibuprofeno",
			"paracetamol",
			"enalapril",
			"antiinflamatorio",
		],
	},
	// Rodilla: cómo se lastimó, hinchazón, si se traba o se va, si apoya.
	{
		key: "mecanismo",
		words: [
			"cómo te lastimaste",
			"como te lastimaste",
			"cómo te lesionaste",
			"como te lesionaste",
			"cómo te hiciste",
			"como te hiciste",
			"cómo fue",
			"como fue",
			"cómo pasó",
			"como paso",
			"qué pasó",
			"que paso",
			"qué estabas haciendo",
			"que estabas haciendo",
			"cómo te golpeaste",
			"como te golpeaste",
			"giraste",
			"te golpe",
			"te caíste",
			"te caiste",
		],
	},
	{ key: "hinchazon", words: ["hinch", "inflam"] },
	// "Traba" suelto no: "¿de qué trabajás?".
	{
		key: "bloqueo",
		words: [
			"se te traba",
			"se traba",
			"trabada",
			"se trabó",
			"se te trabó",
			"se te trabo",
			"bloque",
		],
	},
	{
		key: "inestabilidad",
		words: [
			"se te va la rodilla",
			"se te sale",
			"te falla",
			"afloja",
			"inestab",
			"se te dobla",
		],
	},
	{
		key: "apoyo",
		words: [
			"apoyar",
			"apoyás",
			"apoyas",
			"caminar",
			"caminás",
			"caminas",
			"pisar",
		],
	},
	// "¿Cuándo fue?", "¿cuándo arrancó?", "¿cuándo te diagnosticaron?".
	{
		key: "inicio",
		words: [
			"desde cuándo",
			"desde cuando",
			"cuándo empez",
			"cuando empez",
			"que empez",
			"qué empez",
			"cuándo fue",
			"cuando fue",
			"cuándo pasó",
			"cuando paso",
			"cuándo te lastimaste",
			"cuando te lastimaste",
			"qué día",
			"que dia",
			"arranc",
			"diagnosticaron",
			"hace cuánto",
			"hace cuanto",
			"cuántos días",
			"cuantos dias",
		],
	},
	// "¿En qué parte?"; si el caso no la tiene, sigue a dolor.
	{
		key: "localizacion",
		words: [
			"qué parte",
			"que parte",
			"qué zona",
			"que zona",
			"en qué lado",
			"en que lado",
			"dónde exactamente",
			"donde exactamente",
		],
	},
	{ key: "pecho", words: ["pecho"] },
	{ key: "cuello", words: ["cuello", "ganglio", "pelotitas", "bulto"] },
	// Antes que secreción: "¿te sale algo de la nariz?" es de mocos.
	{ key: "mocos", words: ["mocos", "nariz", "congest", "estornud"] },
	{ key: "voz", words: ["voz", "disfon", "disfón", "ronc", "afon", "afón"] },
	// Antes que la vista: "¿tenés los ojos llorosos?"; si el caso no tiene
	// ojos, "¿algún problema en los ojos?" sigue a la vista.
	{ key: "ojos", words: ["ojos", "lloros", "lagrim", "te lloran"] },
	{
		key: "secrecion",
		words: [
			"secreción",
			"secrecion",
			"supura",
			"líquido",
			"liquido",
			"pus",
			"sale algo del o",
			"sale del o",
			"sale algo por el o",
			"sale por el o",
		],
	},
	// "Pica" suelto no: "¿comés picante?".
	{
		key: "picazon",
		words: ["te pica", "le pica", "picaba", "picazón", "picazon", "comezón"],
	},
	{
		key: "audicion",
		words: [
			"escuchás bien",
			"escuchas bien",
			"escuchás menos",
			"escuchas menos",
			"escuchás peor",
			"escuchas peor",
			"oís bien",
			"ois bien",
			"oís menos",
			"ois menos",
			"audición",
			"audicion",
			"tapado",
		],
	},
	{
		key: "agua",
		// "Agua" suelto no: "¿lo aguantás?".
		words: [
			"al agua",
			"el agua",
			"con agua",
			"entró agua",
			"entro agua",
			"piscina",
			"pileta",
			"nadás",
			"nadas",
			"nadar",
		],
	},
	// "¿Te limpiás los oídos con algo?" es de hisopos.
	{
		key: "hisopos",
		words: ["hisopo", "cotonete", "limpiás", "limpias", "limpiar"],
	},
	{ key: "resfrio", words: ["resfri", "engripad", "gripe"] },
	{
		key: "dolor",
		words: [
			"duele",
			"dolor",
			"al tragar",
			"tragar",
			"tragás",
			"tragas",
			"del 1 al 10",
			"intensidad",
		],
	},
	{ key: "fiebre", words: ["fiebre", "temperatura", "chuchos", "escalofr"] },
	{ key: "tos", words: ["tos", "tosés", "toses", "tosiendo"] },
	{
		key: "cansancio",
		words: ["cansad", "cansancio", "agotad", "energía", "energia"],
	},
	{
		key: "vision",
		words: [
			"vista",
			"visión",
			"vision",
			"ves bien",
			"ve bien",
			"borros",
			"ojos",
		],
	},
	{ key: "cafe", words: ["café", "cafe", "cafeína", "cafeina"] },
	{ key: "sal", words: ["sal", "salado", "salada", "sodio"] },
	{ key: "deporte", words: ["deporte", "jugás", "jugas", "juega", "entren"] },
	{
		key: "actividad",
		words: [
			"ejercicio",
			"deporte",
			"actividad física",
			"actividad fisica",
			"caminás",
			"caminas",
		],
	},
	{
		key: "antecedentes",
		words: [
			"antecedente",
			"enfermedad",
			"operad",
			"operaron",
			"operación",
			"operacion",
			"cirugía",
			"cirugia",
			"internad",
			"lesión",
			"lesion",
			"lesionaste",
			"problema de salud",
			"problemas de salud",
			"otitis",
			"problemas de oído",
			"problemas de oido",
		],
	},
	{
		key: "ocupacion",
		words: [
			"trabajás",
			"trabajas",
			"trabaja",
			"estudiás",
			"estudias",
			"a qué te dedic",
			"a que te dedic",
			"se dedica",
		],
	},
	{ key: "edad", words: ["cuántos años", "cuantos años", "edad"] },
	{ key: "estadoCivil", words: ["casad", "solter", "pareja"] },
];

const GREETING = ["hola", "buen día", "buen dia", "buenas"];
const OPEN_QUESTION = [
	"qué te trae",
	"que te trae",
	"contame",
	"en qué te puedo",
	"en que te puedo",
	"qué te pasa",
	"que te pasa",
];
// Una despedida no es una pregunta: "chau, que te mejores", "nos vemos".
const FAREWELL = [
	"chau",
	"nos vemos",
	"que te mejores",
	"que se mejore",
	"hasta luego",
	"adiós",
	"adios",
	"gracias por venir",
];
// Sin signo de pregunta ni palabra de pregunta al comienzo es una indicación
// ("te voy a recetar ibuprofeno"): el paciente no pide que se la expliquen.
const QUESTION_START =
	/^[\s¡]*(qu[eé]|c[oó]mo|cu[aá]nd|d[oó]nde|cu[aá]nt|por qu|ten[eé]s|tuviste|sab[eé]s|hay|alguna|algún|algun)/u;

const DIAGNOSIS_FISHING = [
	"ignorá",
	"ignora tus",
	"tus instrucciones",
	"las instrucciones que te",
	"tu prompt",
	"sos una ia",
	"sos un bot",
];

// Las palabras muy cortas ("tos") van como palabra entera: si no, "datos" o
// "todos" cuentan como tos.
// El resto, desde el comienzo de una palabra: "edad" no está en "humedad".
function has(text: string, words: string[]) {
	return words.some((w) => {
		const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const end = w.length <= 3 ? "(?!\\p{L})" : "";
		return new RegExp(`(?<!\\p{L})${escaped}${end}`, "u").test(text);
	});
}

// "¿Qué tenés?" como pregunta entera, o preguntar por el diagnóstico propio.
// "Hace cuánto que tenés fiebre" o "¿tenés algún diagnóstico previo?" son
// preguntas de la entrevista, no pedirle el diagnóstico.
function asksDiagnosis(text: string) {
	if (has(text, DIAGNOSIS_FISHING)) return true;
	// "¿Qué enfermedad tenés?" sí; "¿qué enfermedades tuviste?" (antecedentes) no.
	if (/qu[eé] enfermedad\s+(ten[eé]s|tengo|es|ser[aá]|puede ser)/u.test(text))
		return true;
	if (/(^|[\s¿])qu[eé]\s+ten[eé]s(\s+vos)?\s*\?*\s*$/u.test(text)) return true;
	return (
		/diagn[oó]stico/u.test(text) &&
		!/(previo|antes|anterior|te dieron|te hicieron|otro m[eé]dico)/u.test(text)
	);
}

export type RuleReply = {
	text: string;
	delta: Partial<PatientState> | null;
	motivo?: string;
};

export function ruleRespond(
	brief: PatientBrief,
	state: PatientState,
	studentText: string,
	turnIndex: number,
): RuleReply {
	const text = studentText.toLowerCase();
	const facts = { ...brief.profile, ...brief.history };
	const p = brief.personality;
	const nervous = p.ansiedad > 0.7 ? " ¿Es grave, doctor?" : "";
	const hearing = p.audicion === "reducida" && turnIndex % 3 === 1;

	if (hearing) {
		return {
			text: "¿Cómo? Perdón, no le escuché bien. ¿Me lo repite más fuerte?",
			delta: null,
		};
	}
	if (asksDiagnosis(text)) {
		return {
			text: "Y no sé, para eso vine. ¿Vos qué pensás que puede ser?",
			delta: null,
		};
	}

	let delta: Partial<PatientState> | null = null;
	let motivo: string | undefined;
	// Las mismas reglas que el clasificador: "no entiendo" no es empatía.
	if (showsEmpathy(studentText)) {
		delta = { confianza: Math.min(1, state.confianza + 0.15) };
		motivo = "el estudiante mostró empatía";
	}

	if (!text.includes("?") && has(text, FAREWELL)) {
		return {
			text:
				p.locuacidad < 0.4 ? "Chau, gracias." : "Bueno, muchas gracias. Chau.",
			delta,
			motivo,
		};
	}

	// Un tema que el caso no tiene no tapa a otro que sí: "¿te duele cuando
	// tomás agua?" en un caso sin "agua" va a dolor.
	const matched = TOPICS.filter((t) => has(text, t.words));
	const topic = matched.find((t) => facts[t.key] !== undefined);
	if (topic) {
		const answer = facts[topic.key];
		const trust = delta?.confianza ?? state.confianza;
		if (SENSITIVE_KEYS.includes(topic.key) && trust < 0.5) {
			return { text: "Eh... normal, nada raro. ¿Por qué?", delta, motivo };
		}
		const short = p.locuacidad < 0.4;
		return {
			text: short ? `${answer}.` : `Mirá, ${answer}.${nervous}`,
			delta,
			motivo,
		};
	}
	if (matched.length) {
		return {
			text: "Mmm, no sé, la verdad nunca me fijé en eso.",
			delta,
			motivo,
		};
	}

	if (has(text, OPEN_QUESTION) || (turnIndex === 0 && has(text, GREETING))) {
		return {
			text:
				p.cooperacion < 0.5
					? `${brief.chiefComplaint}. Y quiero que me den algo rápido.`
					: `Hola. Eh, ${brief.chiefComplaint.charAt(0).toLowerCase()}${brief.chiefComplaint.slice(1)}.${nervous}`,
			delta,
			motivo,
		};
	}
	if (delta) {
		return {
			// Sin género: el mismo texto sirve para pacientes generados de cualquier sexo.
			text: "Gracias... sí, esto me tiene bastante mal.",
			delta,
			motivo,
		};
	}
	if (!text.includes("?") && !QUESTION_START.test(text)) {
		return {
			text: p.locuacidad < 0.4 ? "Bueno." : "Bueno, dale.",
			delta: null,
		};
	}
	return {
		text:
			p.locuacidad < 0.4
				? "No sé."
				: "Mmm, no entiendo bien la pregunta. ¿Me la explicás?",
		delta: null,
	};
}
