// Voces de Gemini Live para el paciente. Cada consulta sortea una al
// empezar, acorde al sexo del paciente, y la mantiene toda la consulta
// (aunque se reconecte). Las eligió el equipo escuchando muestras.
export const VOICES = {
	f: ["Kore", "Aoede", "Leda", "Zephyr"],
	m: ["Puck", "Charon"],
} as const;

export const ALL_VOICES: string[] = [...VOICES.f, ...VOICES.m];

export function pickVoice(
	sex: "f" | "m" | undefined,
	rand: () => number = Math.random,
): string {
	const options: readonly string[] = sex ? VOICES[sex] : ALL_VOICES;
	return options[Math.floor(rand() * options.length)] ?? "Kore";
}
