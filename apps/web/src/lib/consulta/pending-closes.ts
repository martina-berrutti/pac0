// Cierres de examen en curso: la página pide cerrar (el examen guarda lo que
// se miró por su camino) y el informe espera a que termine. Un guardado que no
// vuelve no traba el informe.
export function createPendingCloses(timeoutMs = 10_000) {
	let resolveCurrent: (() => void) | null = null;
	const pending: Promise<void>[] = [];
	return {
		// true si arrancó un cierre; false si ya había uno en curso.
		request(): boolean {
			if (resolveCurrent) return false;
			pending.push(
				new Promise<void>((resolve) => {
					const finish = () => {
						if (resolveCurrent === finish) resolveCurrent = null;
						resolve();
					};
					resolveCurrent = finish;
					setTimeout(finish, timeoutMs);
				}),
			);
			return true;
		},
		// El examen terminó de guardar y se cerró.
		closed() {
			resolveCurrent?.();
		},
		settled() {
			return Promise.all(pending).then(() => undefined);
		},
	};
}
