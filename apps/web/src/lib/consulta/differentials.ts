// Los diagnósticos diferenciales que el estudiante escribe al cerrar. Los
// límites son los de app/api/sessions/[id]/finish: más darían "Datos
// inválidos", así que se recortan antes y la pantalla avisa.
import { cutText } from "@/lib/cut-text";

export const MAX_DIFFERENTIALS = 10;
export const MAX_DIFFERENTIAL_LENGTH = 100;
export const MAX_HYPOTHESIS_LENGTH = 500;

// Separa por coma, punto y coma, renglón o " y "/" o " sueltos: "infarto y
// reflujo" son dos.
export function splitDifferentials(text: string): string[] {
	return text
		.split(/[,;\n]|\s+(?:y|e|o|u)\s+/i)
		.map((d) => d.trim().replace(/[.\s]+$/, ""))
		.filter(Boolean);
}

// Lo que se envía al servidor y lo que se perdió, para avisar antes.
export function prepareDifferentials(text: string) {
	const all = splitDifferentials(text);
	return {
		list: all
			.slice(0, MAX_DIFFERENTIALS)
			.map((d) => cutText(d, MAX_DIFFERENTIAL_LENGTH)),
		dropped: Math.max(0, all.length - MAX_DIFFERENTIALS),
		cut: all
			.slice(0, MAX_DIFFERENTIALS)
			.filter((d) => d.length > MAX_DIFFERENTIAL_LENGTH).length,
	};
}

// Aviso debajo del campo si algo no va a llegar al informe; vacío si todo va.
export function differentialsNotice(text: string) {
	const { dropped, cut } = prepareDifferentials(text);
	return [
		dropped > 0
			? `Se toman los primeros ${MAX_DIFFERENTIALS}: ${dropped === 1 ? "el último no entra" : `los últimos ${dropped} no entran`}.`
			: "",
		cut > 0
			? `${cut === 1 ? "Uno es muy largo y se corta" : `${cut} son muy largos y se cortan`} a ${MAX_DIFFERENTIAL_LENGTH} caracteres.`
			: "",
	]
		.filter(Boolean)
		.join(" ");
}
