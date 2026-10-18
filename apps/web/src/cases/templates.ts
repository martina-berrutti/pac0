// Plantillas clínicas para el generador de pacientes ("dame un paciente con
// algo de garganta"). El generador inventa a la persona; el contenido clínico
// sale SOLO de acá, escrito por el equipo y a validar por un médico, y cada
// variante usa una imagen del banco con licencia (CREDITS.md).
// BORRADOR: valores inventados, nadie los revisó todavía.

import hipertension01 from "./hipertension-01.json";
import oido01 from "./oido-01.json";
import rodilla01 from "./rodilla-01.json";
import rodilla02 from "./rodilla-02.json";
import rodilla03 from "./rodilla-03.json";
import type { CaseInput, ChecklistItem, PainZone } from "./schema";

export type ClinicalTemplate = {
	id: string;
	zone: "orofaringe" | "oido" | "presion" | "rodilla";
	// Palabras con las que se pide ("algo de garganta", "anginas").
	keywords: string[];
	title: string;
	chiefComplaints: string[];
	hiddenHistory: Record<string, string>;
	vitals: CaseInput["vitals"];
	exam: CaseInput["exam"];
	truth: CaseInput["truth"];
	criticalErrors: string[];
	// Sin lista propia, la de garganta.
	checklist?: ChecklistItem[];
	notApplicable?: string[];
	// Dónde duele (rodilla): el lado lo sortea el generador.
	painSpot?: PainZone["spot"];
	// Edad mínima del paciente inventado, para que la historia cierre.
	minAge?: number;
};

// Plantillas que reutilizan lo clínico de un caso del banco: así se valida
// una sola vez (con el caso) y no hay dos versiones que se desfasen.
function fromBankCase(
	c: Pick<
		CaseInput,
		"title" | "hiddenHistory" | "exam" | "truth" | "notApplicable"
	> & {
		vitals: unknown;
		criticalErrors: string[];
		expectedChecklist: unknown;
	},
	extra: Pick<
		ClinicalTemplate,
		"id" | "zone" | "keywords" | "chiefComplaints"
	> &
		Partial<Pick<ClinicalTemplate, "minAge" | "painSpot">>,
): ClinicalTemplate {
	return {
		...extra,
		title: c.title,
		hiddenHistory: c.hiddenHistory,
		vitals: c.vitals as CaseInput["vitals"],
		exam: c.exam,
		truth: c.truth,
		criticalErrors: c.criticalErrors,
		checklist: c.expectedChecklist as ChecklistItem[],
		notApplicable: c.notApplicable,
	};
}

const OROFARINGE_HOTSPOTS = [
	"amigdala-izq",
	"amigdala-der",
	"uvula",
	"paladar",
	"lengua",
	"pared-posterior",
];

// Lista de cotejo común para los casos de garganta.
export const OROFARINGE_CHECKLIST: ChecklistItem[] = [
	{
		id: "presentacion",
		item: "se presenta y saluda",
		dimension: "comunicacion",
		weight: 2,
		keywords: ["hola", "buen día", "buenas", "me llamo", "soy"],
	},
	{
		id: "pregunta-abierta",
		item: "empieza con una pregunta abierta",
		dimension: "comunicacion",
		weight: 2,
		keywords: ["qué te trae", "en qué te puedo", "contame", "qué te pasa"],
	},
	{
		id: "inicio",
		item: "pregunta desde cuándo",
		dimension: "anamnesis",
		weight: 3,
		keywords: ["desde cuándo", "cuándo empez", "hace cuánto", "cuántos días"],
	},
	{
		id: "caracteristicas-dolor",
		item: "caracteriza el dolor",
		dimension: "anamnesis",
		weight: 2,
		keywords: ["al tragar", "cuánto te duele", "del 1 al 10", "intensidad"],
	},
	{
		id: "fiebre",
		item: "pregunta por fiebre",
		dimension: "anamnesis",
		weight: 3,
		keywords: ["fiebre", "temperatura", "chuchos"],
	},
	{
		id: "tos-catarro",
		item: "pregunta por tos o síntomas respiratorios",
		dimension: "anamnesis",
		weight: 2,
		keywords: ["tos", "mocos", "nariz", "congest"],
	},
	{
		id: "alergias",
		item: "alergias medicamentosas",
		dimension: "anamnesis",
		weight: 3,
		keywords: ["alérgic", "alergia"],
	},
	{
		id: "medicacion",
		item: "medicación actual",
		dimension: "anamnesis",
		weight: 3,
		keywords: [
			"medicación",
			"medicamento",
			"tomaste algo",
			"estás tomando",
			"remedio",
		],
	},
	{
		id: "antecedentes",
		item: "antecedentes personales",
		dimension: "anamnesis",
		weight: 2,
		keywords: ["antecedente", "enfermedad", "operad", "internad"],
	},
	{
		id: "consentimiento",
		item: "explica y pide consentimiento antes de examinar",
		dimension: "examen",
		weight: 3,
		keywords: [
			"te voy a examinar",
			"puedo?",
			"puedo revisar",
			"puedo mirar",
			"puedo examinar",
			"permiso",
			"te parece si",
		],
	},
	{
		id: "orofaringe",
		item: "inspecciona la orofaringe completa",
		dimension: "examen",
		weight: 3,
		keywords: [],
	},
	{
		id: "describe-hallazgo",
		item: "describe lo que vio",
		dimension: "examen",
		weight: 2,
		keywords: ["exudado", "placas", "roj", "amígdalas", "eritema"],
	},
	{
		id: "resume",
		item: "resume y verifica que entendió",
		dimension: "comunicacion",
		weight: 1,
		keywords: ["entonces", "si entendí bien", "resumiendo", "alguna duda"],
	},
];

const RODILLA_WORDS = ["rodilla", "traumatolog"];

export const CLINICAL_TEMPLATES: ClinicalTemplate[] = [
	fromBankCase(rodilla01, {
		id: "lesion-menisco",
		zone: "rodilla",
		painSpot: "interlinea-interna",
		keywords: [...RODILLA_WORDS, "menisco", "meniscal", "se traba"],
		chiefComplaints: [
			"Me duele la rodilla desde que jugué al fútbol y a veces se me traba",
			"Me torcí la rodilla girando y me duele por dentro",
		],
	}),
	fromBankCase(rodilla02, {
		id: "lesion-lca",
		zone: "rodilla",
		painSpot: "centro",
		keywords: [...RODILLA_WORDS, "cruzado", "ligamento", "lca"],
		chiefComplaints: [
			"Me lastimé la rodilla jugando y se me hinchó enseguida",
			"Sentí un crack en la rodilla y siento que se me va",
		],
	}),
	fromBankCase(rodilla03, {
		id: "esguince-colateral",
		zone: "rodilla",
		painSpot: "colateral-interno",
		keywords: [...RODILLA_WORDS, "colateral", "ligamento", "esguince"],
		chiefComplaints: [
			"Me pegaron en la rodilla jugando y me duele por dentro",
			"Me golpearon la rodilla de costado y me duele",
		],
	}),
	fromBankCase(oido01, {
		id: "otitis-externa",
		zone: "oido",
		keywords: ["oído", "oido", "oreja", "otitis", "otoscop"],
		chiefComplaints: [
			"Me duele mucho el oído desde hace unos días",
			"Tengo el oído tapado y me duele cuando me toco la oreja",
		],
	}),
	fromBankCase(hipertension01, {
		id: "hipertension",
		minAge: 45,
		zone: "presion",
		keywords: [
			"presión",
			"presion",
			"hipertens",
			"tensión",
			"tension",
			"tensiómetro",
			"tensiometro",
		],
		chiefComplaints: [
			"Vengo al control de la presión",
			"Me mandaron a controlar la presión porque la tengo alta",
		],
	}),
	{
		id: "faringoamigdalitis-exudativa",
		zone: "orofaringe",
		keywords: [
			"garganta",
			"angina",
			"amígdala",
			"amigdala",
			"tragar",
			"faring",
		],
		title: "Dolor de garganta",
		chiefComplaints: [
			"Me duele mucho la garganta desde hace unos días",
			"No puedo ni tragar, me duele la garganta",
		],
		hiddenHistory: {
			inicio: "empezó hace tres días",
			dolor: "me duele mucho al tragar",
			fiebre: "anoche tuve casi 39",
			tos: "no tengo tos",
			mocos: "no, la nariz bien",
			alergias: "no soy alérgico a nada",
			medicacion: "tomé un ibuprofeno",
			antecedentes: "nada importante",
			alcohol: "los fines de semana, poco",
			tabaco: "no fumo",
			drogas: "no",
		},
		vitals: { pa: [115, 72], fc: 98, fr: 16, tax: 38.4 },
		exam: {
			orofaringe: {
				variants: {
					parcial: "mouth-partial-01",
					completa: "throat-exudate-01",
				},
				hotspots: OROFARINGE_HOTSPOTS,
				expected: "Amígdalas rojas con exudado blanquecino, úvula central",
			},
		},
		truth: {
			diagnosis: "faringoamigdalitis aguda",
			acceptable: ["faringoamigdalitis", "amigdalitis", "angina", "faringitis"],
			differentials: ["estreptocócica", "viral", "mononucleosis"],
		},
		criticalErrors: ["examen sin consentimiento"],
	},
	{
		id: "faringitis-viral",
		zone: "orofaringe",
		keywords: ["garganta", "faring", "resfr", "catarro", "tos"],
		title: "Garganta irritada con catarro",
		chiefComplaints: [
			"Tengo la garganta irritada y estoy con mocos",
			"Me pica y me duele la garganta, y estoy resfriado",
		],
		hiddenHistory: {
			inicio: "hace dos días",
			dolor: "me molesta, pero puedo tragar",
			fiebre: "un poquito, 37 y algo",
			tos: "sí, tos seca",
			mocos: "sí, mucho moco y estornudos",
			contactos: "en casa están todos resfriados",
			alergias: "no",
			medicacion: "nada, solo té con miel",
			antecedentes: "nada",
			alcohol: "casi nunca",
			tabaco: "no",
			drogas: "no",
		},
		vitals: { pa: [118, 74], fc: 84, fr: 16, tax: 37.4 },
		exam: {
			orofaringe: {
				variants: {
					parcial: "mouth-partial-01",
					completa: "throat-erythema-01",
				},
				hotspots: OROFARINGE_HOTSPOTS,
				expected:
					"Eritema faríngeo difuso sin exudado, amígdalas no aumentadas",
			},
		},
		truth: {
			diagnosis: "faringitis viral aguda",
			acceptable: [
				"faringitis viral",
				"faringitis",
				"resfrío",
				"rinofaringitis",
			],
			differentials: [
				"faringoamigdalitis estreptocócica",
				"rinitis alérgica",
				"mononucleosis",
			],
		},
		criticalErrors: ["examen sin consentimiento"],
	},
];
