// Voces de Gemini Live para el paciente. Cada consulta sortea una al
// empezar, acorde al sexo del paciente, y la mantiene toda la consulta
// (aunque se reconecte). Las eligió el equipo escuchando muestras.
export const VOICES = {
	f: ["Kore", "Aoede", "Leda", "Zephyr"],
	m: ["Puck", "Charon"],
} as const;

export const ALL_VOICES: string[] = [...VOICES.f, ...VOICES.m];

// Además de las del sorteo, las que usan las personalidades (personalities.ts):
// Fenrir (agitada, ansioso) y Orus (firme, enojado y desconfiado). Son de las
// ocho voces originales de Gemini Live.
export const PERSONALITY_VOICES = {
	f: [...VOICES.f],
	m: [...VOICES.m, "Fenrir", "Orus"],
} as const;

// Con una personalidad elegida (enojado, feliz…), su voz acorde; con la del
// caso, una al azar.
export function voiceFor(
	archetypeVoice: { f: string; m: string } | undefined,
	sex: "f" | "m" | undefined,
	rand: () => number = Math.random,
): string {
	if (archetypeVoice && sex) return archetypeVoice[sex];
	return pickVoice(sex, rand);
}

export function pickVoice(
	sex: "f" | "m" | undefined,
	rand: () => number = Math.random,
): string {
	const options: readonly string[] = sex ? VOICES[sex] : ALL_VOICES;
	return options[Math.floor(rand() * options.length)] ?? "Kore";
}
