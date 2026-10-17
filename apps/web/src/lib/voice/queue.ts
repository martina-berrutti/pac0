// Fila de escrituras de la voz: cada tarea empieza cuando terminó la anterior,
// aunque la anterior haya fallado. Así los turnos quedan en el orden en que se
// dijeron, el permiso se anota antes de que corra examinar y dos escrituras de
// la misma sesión no se pisan.
export function createWriteQueue() {
	let tail: Promise<unknown> = Promise.resolve();
	return {
		enqueue<T>(task: () => Promise<T>): Promise<T> {
			const next = tail.then(task, task);
			tail = next.catch(() => {});
			return next;
		},
		// Espera a que termine todo lo encolado hasta ahora.
		drain(): Promise<void> {
			return tail.then(() => {});
		},
	};
}
