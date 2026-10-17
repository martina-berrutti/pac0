// Otoscopio virtual (plan.md, sección 6, afiche HC-02). Pasos del afiche:
// higiene de manos, explicar el procedimiento, inspeccionar el oído externo,
// verificar la luz y elegir el espéculo. Técnica: mano del mismo lado que el
// oído, traccionar el pabellón (en el adulto hacia arriba, atrás y afuera),
// introducir suavemente bajo visión directa y observar el conducto y después
// el tímpano. Los errores los calcula este código con lo que hizo el
// estudiante.
import type {
	Ear,
	EarAppearance,
	OtoscopyError,
	OtoscopyPrep,
	OtoscopyRecord,
} from "@/lib/contracts/exam";
import type { Turn } from "@/lib/contracts/session";

// Profundidad del espéculo, de 0 a 100.
export const CANAL_DEPTH = 20;
// Sin tracción, el conducto en S tapa la vista desde acá.
export const BLOCKED_DEPTH = 40;
export const TYMPANUM_DEPTH = 60;
export const TOO_DEEP = 90;
// Tiempo mínimo mirando cada parte para contarla como observada.
export const MIN_LOOK_MS = 1000;

type Technique = { label: string; why: string; tip: string };

export const OTOSCOPY_TECHNIQUE: Record<OtoscopyError, Technique> = {
	"sin-higiene": {
		label: "No te lavaste las manos antes de la otoscopia.",
		why: "La higiene de manos es el primer paso del afiche y evita transmitir infecciones.",
		tip: "Empezá siempre por la higiene de manos.",
	},
	"sin-explicar": {
		label: "No explicaste el procedimiento antes de examinar el oído.",
		why: "Explicar baja la ansiedad y es parte del consentimiento.",
		tip: "Contale qué vas a hacer: «te voy a mirar el oído con una lucecita, puede molestar un poco».",
	},
	"sin-inspeccion-externa": {
		label: "No inspeccionaste el oído externo antes de introducir el espéculo.",
		why: "El pabellón y la entrada del conducto pueden mostrar lesiones o secreción que cambian la técnica.",
		tip: "Mirá el pabellón y la entrada del conducto antes de introducir.",
	},
	"sin-verificar-luz": {
		label: "No verificaste la luz del otoscopio.",
		why: "Sin buena luz no se ve el tímpano y se alarga el examen.",
		tip: "Prendé el otoscopio y verificá la luz antes de empezar.",
	},
	"especulo-inadecuado": {
		label: "Elegiste un espéculo que no corresponde al conducto.",
		why: "Un espéculo chico no deja ver bien y uno grande lastima.",
		tip: "Elegí el espéculo más grande que entre cómodo en el conducto.",
	},
	"mano-cruzada": {
		label: "Sostuviste el otoscopio con la mano del lado contrario al oído.",
		why: "Con la mano del mismo lado apoyás los dedos sobre la cabeza y acompañás si el paciente se mueve.",
		tip: "Oído derecho, mano derecha; oído izquierdo, mano izquierda.",
	},
	"sin-traccion": {
		label: "Introdujiste el espéculo sin traccionar el pabellón.",
		why: "Sin tracción el conducto no se endereza: duele y no se ve el tímpano.",
		tip: "Traccioná el pabellón hacia arriba, atrás y afuera antes de introducir.",
	},
	"traccion-incorrecta": {
		label:
			"Traccionaste el pabellón en una dirección que no endereza el conducto.",
		why: "En el adulto el conducto se endereza hacia arriba, atrás y afuera.",
		tip: "En el adulto, arriba, atrás y afuera; en el niño chico, abajo y atrás.",
	},
	"introduce-brusco": {
		label: "Introdujiste el espéculo de golpe.",
		why: "El conducto es sensible: entrar rápido duele y el paciente se mueve.",
		tip: "Introducí despacio, mirando por el otoscopio todo el tiempo.",
	},
	"introduce-demasiado": {
		label: "Introdujiste el espéculo demasiado profundo.",
		why: "Pasar el tercio externo del conducto duele y puede lastimar.",
		tip: "Quedate en la entrada del conducto: el tímpano se ve sin ir más hondo.",
	},
	"no-observa-conducto": {
		label: "No observaste el conducto auditivo.",
		why: "El conducto puede tener eritema, secreción o un cuerpo extraño.",
		tip: "Mirá primero el conducto y después el tímpano.",
	},
	"no-observa-timpano": {
		label: "No llegaste a observar el tímpano.",
		why: "El tímpano es el objetivo de la otoscopia.",
		tip: "Con buena tracción y despacio, avanzá hasta ver el tímpano.",
	},
};

export type OtoscopyScenario = {
	appearance: Record<Ear, EarAppearance>;
	speculum: "pediatrico" | "adulto";
	traction: "arriba-atras" | "abajo-atras";
};

const NORMAL: EarAppearance = { canal: "sano", tympanum: "nacarado" };

// Hallazgos por caso. Sin entrada, los dos oídos son normales. Más adelante
// pueden pasar al JSON del caso.
const APPEARANCE: Record<string, Partial<Record<Ear, EarAppearance>>> = {
	// Otitis externa derecha: conducto rojo con secreción, tímpano sano.
	"oido-01": { derecho: { canal: "secrecion", tympanum: "nacarado" } },
	// Pacientes generados con la plantilla de otitis externa.
	"otitis-externa": { derecho: { canal: "secrecion", tympanum: "nacarado" } },
};

// Por id del caso, o por plantilla en los generados (gen-<plantilla>-…).
function appearanceFor(caseId: string) {
	return (
		APPEARANCE[caseId] ??
		Object.entries(APPEARANCE).find(([key]) =>
			caseId.startsWith(`gen-${key}-`),
		)?.[1] ??
		{}
	);
}

export function otoscopyScenario(
	caseId: string,
	age: number,
): OtoscopyScenario {
	const found = appearanceFor(caseId);
	return {
		appearance: {
			derecho: found.derecho ?? NORMAL,
			izquierdo: found.izquierdo ?? NORMAL,
		},
		speculum: age < 8 ? "pediatrico" : "adulto",
		traction: age < 3 ? "abajo-atras" : "arriba-atras",
	};
}

const EARS: Ear[] = ["derecho", "izquierdo"];

function isNormal(a: EarAppearance) {
	return a.canal === NORMAL.canal && a.tympanum === NORMAL.tympanum;
}

// El oído con hallazgos, si hay uno solo. Con los dos afectados (o ninguno),
// no hay un oído sano por donde empezar.
export function affectedEar(scenario: OtoscopyScenario): Ear | null {
	const affected = EARS.filter((e) => !isNormal(scenario.appearance[e]));
	return affected.length === 1 ? (affected[0] ?? null) : null;
}

const CANAL_TEXT: Record<EarAppearance["canal"], string> = {
	sano: "conducto sano",
	eritema: "conducto enrojecido",
	secrecion: "conducto enrojecido con secreción",
};
const TYMPANUM_TEXT: Record<EarAppearance["tympanum"], string> = {
	nacarado: "tímpano nacarado con triángulo luminoso",
	eritematoso: "tímpano enrojecido",
	abombado: "tímpano abombado",
};

// El hallazgo esperado en palabras, para el informe y el juez con IA.
export function describeEars(scenario: OtoscopyScenario) {
	return EARS.map((e) => {
		const a = scenario.appearance[e];
		return `oído ${e}: ${isNormal(a) ? "normal" : `${CANAL_TEXT[a.canal]}, ${TYMPANUM_TEXT[a.tympanum]}`}`;
	}).join("; ");
}

export type EarPhoto = { src: string; alt: string; credit: string };

// Fotos por hallazgo: "conducto-<canal>" y "timpano-<tímpano>" (EarAppearance).
// Mismas reglas que las de la orofaringe (lib/exam/oropharynx.ts): archivo en
// apps/web/public/exam/, registrado en CREDITS.md, nunca generado con IA. Sin
// foto, la vista del otoscopio dibuja el esquema.
export const EAR_PHOTOS: Record<string, EarPhoto> = {};

export function earPhoto(part: "conducto" | "timpano", value: string) {
	return EAR_PHOTOS[`${part}-${value}`] ?? null;
}

const EXPLAIN_WORDS = ["oido", "otoscop", "orejas", "la oreja"];
const PREP_ERRORS: Record<OtoscopyPrep, OtoscopyError> = {
	higiene: "sin-higiene",
	"inspeccion-externa": "sin-inspeccion-externa",
	"verificar-luz": "sin-verificar-luz",
};

function normalize(s: string) {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

export function assessOtoscopy(
	ear: Ear,
	record: OtoscopyRecord,
	studentTurnsBefore: Turn[],
	scenario: OtoscopyScenario,
): { steps: string[]; errors: OtoscopyError[] } {
	const errors: OtoscopyError[] = [];
	const steps: string[] = [];
	const ok = (step: string) => steps.push(step);

	for (const [prep, error] of Object.entries(PREP_ERRORS) as [
		OtoscopyPrep,
		OtoscopyError,
	][]) {
		if (record.prep.includes(prep)) ok(prep);
		else errors.push(error);
	}
	const explained = studentTurnsBefore.some((t) =>
		EXPLAIN_WORDS.some((w) => normalize(t.text).includes(w)),
	);
	if (explained) ok("explica");
	else errors.push("sin-explicar");

	if (record.speculum === scenario.speculum) ok("especulo");
	else errors.push("especulo-inadecuado");
	const sameSide =
		(ear === "derecho" && record.hand === "derecha") ||
		(ear === "izquierdo" && record.hand === "izquierda");
	if (sameSide) ok("mano-del-lado");
	else errors.push("mano-cruzada");

	if (record.traction === null) {
		if (record.maxDepth >= CANAL_DEPTH) errors.push("sin-traccion");
	} else if (record.traction === scenario.traction) ok("traccion");
	else errors.push("traccion-incorrecta");

	if (record.roughInsertions > 0) errors.push("introduce-brusco");
	if (record.maxDepth > TOO_DEEP) errors.push("introduce-demasiado");
	if (record.canalMs >= MIN_LOOK_MS) ok("observa-conducto");
	else errors.push("no-observa-conducto");
	if (record.tympanumMs >= MIN_LOOK_MS) ok("observa-timpano");
	else errors.push("no-observa-timpano");

	return { steps, errors };
}
