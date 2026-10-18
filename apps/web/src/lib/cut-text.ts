// Corta un texto a n unidades sin dejar medio emoji: Convex rechaza un texto
// que termina en la primera mitad de un par sustituto.
export function cutText(text: string, n: number) {
	return text.slice(0, n).replace(/[\uD800-\uDBFF]$/, "");
}
