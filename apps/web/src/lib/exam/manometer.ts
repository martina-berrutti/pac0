// Física del tensiómetro de pera (plan.md, sección 6, afiche HC-01): cada
// apretón de la pera sube la presión del manguito y la válvula decide cuánto
// baja. Como en el aparato real, con la válvula cerrada no baja (salvo una
// pérdida mínima): para medir hay que abrirla apenas, de 2 a 3 mmHg por
// segundo. Valores iniciales, a calibrar con un docente.

export type Valve = "cerrada" | "poco" | "abierta";

export const MAX_MMHG = 300;
// Lo que sube cada apretón; con la válvula abierta del todo el aire se va.
export const PUMP_MMHG: Record<Valve, number> = {
	cerrada: 18,
	poco: 14,
	abierta: 3,
};
// Lo que baja por segundo.
export const LEAK_PER_S: Record<Valve, number> = {
	cerrada: 0.3,
	poco: 3,
	abierta: 40,
};
// Después de apretar, el ruido del inflado tapa los de Korotkoff.
export const PUMP_NOISE_MS = 400;

export const NEXT_VALVE: Record<Valve, Valve> = {
	cerrada: "poco",
	poco: "abierta",
	abierta: "cerrada",
};

export function pump(pressure: number, valve: Valve) {
	return Math.min(MAX_MMHG, pressure + PUMP_MMHG[valve]);
}

export function leak(pressure: number, valve: Valve, dtSeconds: number) {
	return Math.max(0, pressure - LEAK_PER_S[valve] * dtSeconds);
}

// Ángulo de la aguja (grados) para un manómetro de 0 a 300 mmHg en 300°.
export function needleAngle(pressure: number) {
	return -150 + (Math.min(MAX_MMHG, Math.max(0, pressure)) / MAX_MMHG) * 300;
}

// Se oyen los ruidos entre la PAS y la PAD del manómetro, sin estar inflando.
export function audible(
	pressure: number,
	gauge: { pas: number; pad: number },
	msSincePump: number,
) {
	return (
		msSincePump > PUMP_NOISE_MS &&
		pressure <= gauge.pas &&
		pressure >= gauge.pad
	);
}
