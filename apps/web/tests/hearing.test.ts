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

test("un turno nuevo se juzga entero", () => {
	const { hearing, closes } = setup();
	hearing.heard("Ahora te miro el oído, quedate quieto");
	hearing.examOpened();
	hearing.heard("Ya está");
	vi.advanceTimersByTime(700);
	expect(closes).toEqual(["Ya está"]);
});
