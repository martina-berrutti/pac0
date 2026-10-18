import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createHearing } from "@/lib/consulta/hearing";
import { asksToEndExam } from "@/lib/exam/end-intent";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
	const closes: string[] = [];
	const hearing = createHearing((said) => {
		if (asksToEndExam(said)) closes.push(said);
	});
	return { hearing, closes };
}

test("una frase a medio decir no cierra el examen", () => {
	const { hearing, closes } = setup();
	hearing.heard("Listo,");
	vi.advanceTimersByTime(300);
	hearing.heard("Listo, ahora sacá la lengua y decí aaa");
	vi.advanceTimersByTime(700);
	expect(closes).toEqual([]);
});

test("después de la pausa, 'listo, cerrá la boca' sí cierra", () => {
	const { hearing, closes } = setup();
	hearing.heard("Listo, cerrá la boca");
	vi.advanceTimersByTime(700);
	expect(closes).toHaveLength(1);
});

test("lo dicho antes de abrir el examen no cierra el nuevo", () => {
	const { hearing, closes } = setup();
	hearing.heard("Listo, cerrá la boca.");
	vi.advanceTimersByTime(700);
	closes.length = 0;
	// El modelo abre el oído y sigue llegando el mismo turno.
	hearing.examOpened();
	hearing.heard("Listo, cerrá la boca. Ahora te miro el oído");
	vi.advanceTimersByTime(700);
	expect(closes).toEqual([]);
});

test("un turno nuevo se juzga entero, aunque sea más largo que el anterior", () => {
	const { hearing, closes } = setup();
	hearing.heard("A ver, abrí la boca");
	hearing.examOpened();
	hearing.turnEnded();
	hearing.heard("Bueno, ahora cerrá la boca, gracias");
	vi.advanceTimersByTime(700);
	expect(closes).toEqual(["Bueno, ahora cerrá la boca, gracias"]);
});

test("un cierre seguido enseguida de otro turno no se pierde", () => {
	const { hearing, closes } = setup();
	hearing.heard("Listo, cerrá la boca");
	vi.advanceTimersByTime(400);
	hearing.turnEnded();
	hearing.heard("Y contame, ¿desde cuándo?");
	vi.advanceTimersByTime(700);
	expect(closes).toHaveLength(1);
});

test("una herramienta que corta el turno en 'Listo,' no cierra el examen", () => {
	const { hearing, closes } = setup();
	hearing.heard(" Listo,");
	// El modelo llama a examinar: se guarda el turno con lo poco transcripto.
	hearing.turnEnded();
	hearing.heard(" ahora sacá la lengua y decí aaa");
	vi.advanceTimersByTime(700);
	expect(closes).toEqual([]);
});

test("después de la pausa, el turno siguiente se juzga solo", () => {
	const { hearing, closes } = setup();
	hearing.heard("Abrí grande");
	vi.advanceTimersByTime(700);
	hearing.turnEnded();
	hearing.heard("Ya está");
	vi.advanceTimersByTime(700);
	expect(closes).toEqual(["Ya está"]);
});

test("lo ya juzgado no vuelve a cerrar: el siguiente 'ya está' cierra el otro examen", () => {
	const { hearing, closes } = setup();
	hearing.heard("Listo, cerrá la boca");
	vi.advanceTimersByTime(700);
	hearing.heard("Listo, cerrá la boca. Ahora quedate quieta");
	vi.advanceTimersByTime(700);
	expect(closes).toHaveLength(1);
	hearing.heard("Listo, cerrá la boca. Ahora quedate quieta. Ya está");
	vi.advanceTimersByTime(700);
	expect(closes).toEqual(["Listo, cerrá la boca", ". Ya está"]);
});
