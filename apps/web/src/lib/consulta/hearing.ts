// Lo que el estudiante va diciendo por voz, para decidir si pidió cerrar el
// examen: solo lo dicho desde que se abrió, y recién después de una pausa.
// "Listo, ahora sacá la lengua" no se corta en "Listo,", y "cerrá la boca.
// Ahora te miro el oído" no cierra también el oído que se abre después.
export function createHearing(onPause: (said: string) => void, pauseMs = 700) {
	let text = "";
	let from = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	return {
		// La transcripción acumulada del turno que se está diciendo.
		heard(next: string) {
			text = next;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				onPause(text.slice(from));
			}, pauseMs);
		},
		// Terminó el turno (se guardó lo dicho): lo pendiente se juzga ya, así
		// un "listo, cerrá la boca" seguido enseguida de otra frase no se
		// pierde, y el turno nuevo empieza de cero.
		turnEnded() {
			if (timer) {
				clearTimeout(timer);
				timer = null;
				onPause(text.slice(from));
			}
			text = "";
			from = 0;
		},
		// Se abrió un examen: lo dicho hasta acá en este turno no cuenta.
		examOpened() {
			from = text.length;
		},
		stop() {
			if (timer) clearTimeout(timer);
			timer = null;
		},
	};
}
