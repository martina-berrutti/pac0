// AbortSignal.timeout llegó en Safari 16: en un iPhone con iOS 15 tira un
// TypeError y ningún pedido funcionaría. Este reemplazo anda en todos lados.
export function timeoutSignal(ms: number): AbortSignal {
	if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
	const controller = new AbortController();
	setTimeout(
		() => controller.abort(new DOMException("Tiempo agotado", "TimeoutError")),
		ms,
	);
	return controller.signal;
}
