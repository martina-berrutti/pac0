// Claves que escribe la IA ("ocupación", "con quién vive") y terminan como
// nombres de campo en Convex, que solo acepta ASCII y no deja empezar con
// "$". En memoria (desarrollo y tests) no falla, así que sin esto el error
// aparecía solo en producción.
export function asciiKey(raw: string): string {
	const key = raw
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 40);
	return key || "dato";
}
