// Orofaringe con linterna (plan.md, sección 6). Opcional del plan: una tecla
// para el abatelenguas mejora la visibilidad de las amígdalas. Sin él, la
// lengua tapa en parte las amígdalas y la pared posterior.
export const DEPRESSOR_KEY = "a";

// Zonas que la lengua tapa sin abatelenguas.
export const DEPRESSOR_ZONES = new Set([
	"amigdala-izq",
	"amigdala-der",
	"pared-posterior",
]);

// Cuánto vale cada milisegundo de luz sobre la zona. Sin abatelenguas, las
// zonas tapadas cuentan la mitad: hace falta el doble de tiempo para verlas.
// Valor inicial, a calibrar con un docente.
export const HIDDEN_RATE = 0.5;

export function lightRate(zone: string, depressor: boolean) {
	return !depressor && DEPRESSOR_ZONES.has(zone) ? HIDDEN_RATE : 1;
}
