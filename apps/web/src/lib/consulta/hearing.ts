// Lo que el estudiante va diciendo por voz, para decidir si pidió cerrar el
// examen: solo lo dicho desde que se abrió, y recién después de una pausa.
// "Listo, ahora sacá la lengua" no se corta en "Listo,", y "cerrá la boca.
// Ahora te miro el oído" no cierra también el oído que se abre después.
export function createHearing(onPause: (said: string) => void, pauseMs = 700) {
	// Lo del turno anterior que todavía espera la pausa, y lo del turno actual.
	let before = "";
	let current = "";
	let from = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	const all = () => before + current;
	function wait() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			onPause(all().slice(from).trim());
			// Lo juzgado no se vuelve a juzgar: queda solo lo que se diga después
			// en este turno.
			before = "";
			from = current.length;
		}, pauseMs);
	}
	return {
		// La transcripción acumulada del turno que se está diciendo.
		heard(next: string) {
			current = next;
			wait();
		},
		// Terminó el turno (se guardó lo dicho). La pausa sigue corriendo: una
		// herramienta puede cortar el turno con "Listo," apenas transcripto, y
		// el resto ("ahora sacá la lengua") llega como turno nuevo enseguida.
		turnEnded() {
			if (timer) {
				before = `${all()} `;
			} else {
				before = "";
				from = 0;
			}
			current = "";
		},
		// Se abrió un examen: lo dicho hasta acá no cuenta.
		examOpened() {
			from = all().length;
		},
		stop() {
			if (timer) clearTimeout(timer);
			timer = null;
		},
	};
}
