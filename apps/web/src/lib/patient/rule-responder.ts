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
// "requires": la pregunta tiene que tener además eso ("¿tomaste ibuprofeno?"
// sí, "te voy a recetar ibuprofeno" no). "unless": eso la saca del tema.
const TOPICS: {
	key: string;
	words: string[];
	requires?: RegExp;
	unless?: RegExp;
}[] = [
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
	// quién vive?" (usted) también; "vive con" suelto no: "¿hace cuánto vive
	// con la presión alta?".
	{
		key: "vive",
		words: [
			"vivís",
			"vivis",
			"vive con alguien",
			"vive con su",
			"vive con tu",
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
			// "¿Se acuerda de tomar el enalapril todos los días?"
			"te acordás de tomar",
			"te acordas de tomar",
			"se acuerda de tomar",
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
		],
	},
	// El remedio por su nombre, solo con un verbo de tomar: "¿tomaste
	// ibuprofeno?" sí, "te voy a recetar ibuprofeno" es una indicación. "Toma"
	// solo en una pregunta ("¿toma enalapril?"): "toma un ibuprofeno si te
	// duele" es un consejo; y "tomando" con "estás": "seguí tomando el
	// enalapril" tampoco pregunta.
	{
		key: "medicacion",
		words: ["ibuprofeno", "paracetamol", "enalapril", "antiinflamatorio"],
		requires:
			/(tom[aá]s|tomaste|tom[oó]|tomabas|us[aá]s|usaste|est[aá]s? tomando|(?<=^\s*¿\s*(?:y |usted )?)toma|(?<=^\s*(?:y |usted )?)toma(?=[^,?]*\?\s*$))(?!\p{L})/u,
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
	// "¿Cuándo fue?", "¿cuándo arrancó?", "¿cuándo te diagnosticaron?"; no
	// "¿cuándo fue la última vez que la tomaste?".
	{
		key: "inicio",
		unless: /[uú]ltima vez/u,
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
			// "¿Te diagnosticaron alguna enfermedad?" es un antecedente.
			"cuándo te diagnosticaron",
			"cuando te diagnosticaron",
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
	// "¿Estás ronca?" sí; "¿roncás de noche?" no.
	{
		key: "voz",
		words: [
			"voz",
			"disfon",
			"disfón",
			"estás ronc",
			"estas ronc",
			"está ronc",
			"esta ronc",
			"ronquera",
			"afon",
			"afón",
		],
	},
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
	// "¿Te limpiás los oídos con algo?" es de hisopos; "te voy a limpiar el
	// oído" no.
	{
		key: "hisopos",
		words: ["hisopo", "cotonete", "te limpiás", "te limpias", "se limpia"],
	},
	{ key: "resfrio", words: ["resfri", "engripad", "gripe"] },
	// Signos de alarma de la odinofagia: antes que dolor ("¿te duele abrir la
	// boca?" es de abrir la boca).
	{ key: "respiracion", words: ["falta el aire", "respir", "ahog"] },
	{ key: "saliva", words: ["saliva", "babe"] },
	{
		key: "abrir_boca",
		words: [
			"abrir la boca",
			"abrís la boca",
			"abris la boca",
			"mandíbula",
			"mandibula",
		],
	},
	{
		key: "tragar",
		words: [
			"cuesta tragar",
			"podés tragar",
			"podes tragar",
			"podés comer",
			"podes comer",
			// "Tomá muchos líquidos" es un consejo, no una pregunta.
			"tomás líquidos",
			"tomas liquidos",
			"podés tomar líquidos",
			"podes tomar liquidos",
		],
	},
	{ key: "voz", words: ["voz", "disfón", "disfon", "ronca"] },
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
			"diagnosticaron",
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
			// "¿Tuviste otitis antes?"; no "tenés una otitis externa".
			"tuviste otitis",
			"otitis antes",
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
// Con un relleno adelante: "y cómo dormís", "bueno, ¿tenés fiebre".
const QUESTION_START =
	/^[\s¡¿]*((y|e|bueno|a ver|ta|ok|che|y bueno),?\s+)*(qu[eé]|c[oó]mo|cu[aá]nd|d[oó]nde|cu[aá]nt|por qu|ten[eé]s(?! que)|tuviste|sab[eé]s|hay(?! que)|alguna|algún|algun|consultaste|fuiste|tomaste|notaste|sentiste|probaste|te (vio|vieron|hicieron|dieron))/u;

// Una indicación sin signos de pregunta ("si tenés fiebre tomá paracetamol",
// "volvé si te cuesta tragar", "tenés que hacer reposo"): no se responde con
// un dato de la historia aunque nombre un síntoma.
const INSTRUCTION_START =
	// Con cuidado: "hace cuánto", "consultaste", "volvés a tener", "si claro"
	// o "¿toma algo?" son preguntas.
	/^[\s¡]*((y|bueno|ok|bien|listo),?\s+)*(si [^?]{0,40}\b(tom[aá]|volv[eé]|ven[ií]|consult[aá]|and[aá]|llam[aá]|avis[aá])(?!\p{L})|ten[eé]s que|hay que|te voy a (dar|recetar|indicar|mandar)|tom[aá] (mucho|mucha|agua|paracetamol|ibuprofeno|l[ií]quidos?)|volv[eé](?!\p{L})|consult[aá](?!\p{L})|hac[eé] (reposo|g[aá]rgaras|buches)|and[aá] (a|al) )/u;

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
		!/(previo|antes|anterior|te dieron|te hicieron|otro m[eé]dico)/u.test(
			text,
		) &&
		// "Mi diagnóstico es que tenés…" se lo dice, no se lo pregunta.
		!/\b(mi|el) diagn[oó]stico (es|ser[ií]a)\b/u.test(text)
	);
}

// El estudiante le dice qué tiene ("creo que tenés faringitis", "lo que
// tenés es un resfrío"): el paciente pregunta, no explica (Persona 3).
const DIAGNOSIS_WORD =
	"\\w*(itis|gripe|resfri\\w*|angina|esguince|lesion|virus|infeccion)\\b";

function tellsDiagnosis(text: string) {
	const t = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
	// Hasta la primera pregunta: "tenés una otitis, ¿se entiende?" explica;
	// "tenés gripe?" (sin "¿") pregunta.
	const head = t.split("¿")[0];
	if (head.includes("?")) return false;
	// De otro: "tu mamá tiene artritis", "alguien en tu casa tiene gripe",
	// "tu compañera tiene una angina", "la gripe es un virus".
	if (
		/\b(alguien|tu (mama|papa|familia|hermano|hermana|pareja|novio|novia|marido|esposo|esposa|abuel\w*|companer\w*|amig\w*)|su (mama|papa|madre|padre|marido|esposo|esposa)|(la|el) (gripe|angina|\w+itis|infeccion|virus|lesion|resfrio) es)\b/.test(
			head,
		)
	)
		return false;
	// Preguntas tipeadas sin signos: "tenés un virus o algo así", "tiene una
	// lesión previa", "¿tuviste otitis antes?". "Antes" solo no: "por eso te
	// dolía antes" explica.
	if (
		/\b(o algo( asi)?|o no|previa|de antes|alguna vez|algun lado)\b|\b(tuviste|tenias)\b.*\bantes\b/.test(
			head,
		)
	)
		return false;
	// Sin las muletillas del principio: "bueno, tenés…", "y decime, tenés…".
	const s = head.replace(
		/^((y|e|bueno|a ver|ok|che|decime|mira|bien)[\s,]+)+/,
		"",
	);
	return (
		// Como explicación: "lo que tenés es…", "lo que te pasa es que…",
		// "creo que tenés…", "por lo que veo en la rodilla tenés…", "debe ser
		// un virus", "la rodilla tiene una lesión".
		new RegExp(
			`\\b(lo que (tenes|tiene|te pasa)\\b[^.?!]{0,25}\\b(es|que tenes|que tiene|se llama)|diagnostico (es|seria)( que (tenes|tiene))?|(creo|parece|me parece|seguro|pienso) que (tenes|tiene|es)|por lo que (vi|veo)[^.?!]{0,30}\\b(tenes|tiene|es)|(debe|puede|podria) ser|(seguramente|probablemente) (sea|es)|(es probable|lo mas probable es) que (sea|tengas|tenga)|(la|el|tu|su) (rodilla|oido|garganta|menisco|ligamento) (tiene|tenes))\\b[^.?!]{0,20}${DIAGNOSIS_WORD}`,
		).test(s) ||
		// Dicho de frente: "tenés una otitis externa", "te revisé y tenés una
		// otitis", "te explico: tenés una otitis", "esto es un virus".
		new RegExp(
			`([,.;:] ?|\\by |\\b(esto|eso) )(tenes|tiene|es) (una|un) ${DIAGNOSIS_WORD}`,
		).test(s) ||
		// Al principio de todo es ambiguo sin signos: "tenés una otitis
		// externa" explica, pero "tenés una infección urinaria" o "tiene una
		// lesión vieja" preguntan (solo se mira esa primera parte de la frase).
		// "Tenés faringitis." sin artículo, con punto final: también lo dice.
		new RegExp(`^(tenes|tiene) ${DIAGNOSIS_WORD}[^?]*\\.\\s*$`).test(s) ||
		(new RegExp(`^(tenes|tiene|es) (una|un) ${DIAGNOSIS_WORD}`).test(s) &&
			!/\b(vieja|urinaria|otra|tambien)\b/.test(s.split(/[,.;]| y /)[0]))
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

	// Después de la empatía: "tranquila, tenés una angina, se cura" también
	// suma confianza.
	if (tellsDiagnosis(text)) {
		return {
			text: "Ah... ¿y eso qué es? ¿Es grave? ¿Qué tengo que hacer?",
			delta,
			motivo,
		};
	}

	if (!text.includes("?") && has(text, FAREWELL)) {
		return {
			text:
				p.locuacidad < 0.4 ? "Chau, gracias." : "Bueno, muchas gracias. Chau.",
			delta,
			motivo,
		};
	}

	if (!text.includes("?") && INSTRUCTION_START.test(text)) {
		return {
			text: p.locuacidad < 0.4 ? "Bueno." : "Bueno, dale.",
			delta,
			motivo,
		};
	}

	// Un tema que el caso no tiene no tapa a otro que sí: "¿te duele cuando
	// tomás agua?" en un caso sin "agua" va a dolor.
	const matched = TOPICS.filter(
		(t) =>
			has(text, t.words) &&
			(!t.requires || t.requires.test(text)) &&
			!t.unless?.test(text),
	);
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
