// Órdenes al avatar (Persona 3). Traduce un pedido en castellano a una acción
// de TalkingHead. Por ahora lo usa la página de prueba /avatar; después lo van
// a disparar las herramientas del paciente (actualizar_estado, examinar).

export const MOODS = {
	neutral: "Neutral",
	happy: "Contento",
	sad: "Triste",
	angry: "Enojado",
	fear: "Asustado",
	disgust: "Asco",
	sleep: "Dormido",
} as const;
export type Mood = keyof typeof MOODS;

export const GESTURES = {
	handup: "Levantar la mano",
	index: "Señalar",
	ok: "OK",
	thumbup: "Pulgar arriba",
	thumbdown: "Pulgar abajo",
	shrug: "Encogerse de hombros",
	namaste: "Manos juntas",
} as const;
export type Gesture = keyof typeof GESTURES;

export const FACES = {
	dolor: { emoji: "😬", label: "Cara de dolor" },
	preocupado: { emoji: "🥺", label: "Preocupado" },
	duda: { emoji: "🤔", label: "Pensando" },
	si: { emoji: "yes", label: "Decir que sí" },
	no: { emoji: "no", label: "Decir que no" },
	saludo: { emoji: "👋", label: "Saludar" },
} as const;
export type Face = keyof typeof FACES;

export const VIEWS = {
	head: "Cara",
	mid: "Plano medio",
	full: "Cuerpo entero",
} as const;
export type View = keyof typeof VIEWS;

export type AvatarAction =
	| { kind: "mood"; mood: Mood }
	| { kind: "gesture"; gesture: Gesture }
	| { kind: "face"; face: Face }
	// ms: cuánto queda abierta (por defecto unos segundos; 0 la cierra).
	| { kind: "mouth"; tongue: boolean; ms?: number }
	| { kind: "eyes" }
	| { kind: "view"; view: View };

// Palabras clave sin tildes. Gana la primera regla que coincide, así que las
// más específicas van antes ("saca la lengua" antes que "abri la boca").
const RULES: [RegExp, AvatarAction][] = [
	[/lengua|deci a+\b|decir a+\b/, { kind: "mouth", tongue: true }],
	[/(abr\w* |abierta).*boca|boca abierta/, { kind: "mouth", tongue: false }],
	[
		/mira\w*( a)? (la camara|a mi|aca|me)|mirame|contacto visual/,
		{ kind: "eyes" },
	],
	[/levant\w* (la )?mano|mano arriba/, { kind: "gesture", gesture: "handup" }],
	[
		/pulgar (arriba|para arriba)|todo bien|joya/,
		{ kind: "gesture", gesture: "thumbup" },
	],
	[/pulgar (abajo|para abajo)/, { kind: "gesture", gesture: "thumbdown" }],
	[/hombros|no se\b|ni idea/, { kind: "gesture", gesture: "shrug" }],
	[/senal\w*|apunt\w*/, { kind: "gesture", gesture: "index" }],
	[/\bok\b|okey|de acuerdo/, { kind: "gesture", gesture: "ok" }],
	[/manos juntas|rez\w*|gracias/, { kind: "gesture", gesture: "namaste" }],
	[/dolor|duele|dolid/, { kind: "face", face: "dolor" }],
	[/preocupad/, { kind: "face", face: "preocupado" }],
	[/pens\w*|duda/, { kind: "face", face: "duda" }],
	[/salud\w*|hola|chau/, { kind: "face", face: "saludo" }],
	[
		/(deci|decir|asenti\w*) (que )?si|\bsi\b con la cabeza/,
		{ kind: "face", face: "si" },
	],
	[
		/(deci|decir|neg\w*) (que )?no|\bno\b con la cabeza/,
		{ kind: "face", face: "no" },
	],
	[/content|feliz|sonre\w*|sonri\w*/, { kind: "mood", mood: "happy" }],
	[/triste|llor\w*/, { kind: "mood", mood: "sad" }],
	[/enojad|calient|molest|furios/, { kind: "mood", mood: "angry" }],
	[/asustad|miedo|nervios|ansios/, { kind: "mood", mood: "fear" }],
	[/asco/, { kind: "mood", mood: "disgust" }],
	[/dorm\w*|sueno|cansad/, { kind: "mood", mood: "sleep" }],
	[/normal|neutr|tranquil|calm/, { kind: "mood", mood: "neutral" }],
	[/cara|acerca\w*|primer plano/, { kind: "view", view: "head" }],
	[/cuerpo entero|alej\w*|todo el cuerpo/, { kind: "view", view: "full" }],
	[/plano medio|medio cuerpo/, { kind: "view", view: "mid" }],
];

export function normalize(text: string) {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[¿?¡!.,;:]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function parseCommand(text: string): AvatarAction | null {
	const t = normalize(text);
	if (!t) return null;
	return RULES.find(([re]) => re.test(t))?.[1] ?? null;
}

export function describeAction(a: AvatarAction): string {
	switch (a.kind) {
		case "mood":
			return `Ánimo: ${MOODS[a.mood]}`;
		case "gesture":
			return GESTURES[a.gesture];
		case "face":
			return FACES[a.face].label;
		case "mouth":
			return a.tongue ? "Abrir la boca y sacar la lengua" : "Abrir la boca";
		case "eyes":
			return "Mirar a la cámara";
		case "view":
			return `Vista: ${VIEWS[a.view]}`;
	}
}
