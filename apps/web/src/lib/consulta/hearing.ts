// Lo que el estudiante va diciendo por voz, para decidir si pidió cerrar el
// examen: solo lo dicho desde que se abrió, y recién después de una pausa.
// "Listo, ahora sacá la lengua" no se corta en "Listo,", y "cerrá la boca.
// Ahora te miro el oído" no cierra también el oído que se abre después.
export function createHearing(onPause: (said: string) => void, pauseMs = 700) {
	let text = "";
	let from = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	return {
		// La transcripción acumulada del turno (vuelve a empezar en cada turno).
		heard(next: string) {
			if (next.length < text.length) from = 0;
			text = next;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				onPause(text.slice(from));
			}, pauseMs);
		},
		// Se abrió un examen: lo dicho hasta acá no cuenta para cerrarlo.
		examOpened() {
			from = text.length;
		},
		stop() {
			if (timer) clearTimeout(timer);
			timer = null;
		},
	};
}
