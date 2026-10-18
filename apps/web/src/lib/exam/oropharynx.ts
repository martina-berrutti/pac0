// Orofaringe con linterna (plan.md, sección 6). Opcional del plan: una tecla
// para el abatelenguas mejora la visibilidad de las amígdalas. Sin él, la
// lengua tapa en parte las amígdalas y la pared posterior.
export const DEPRESSOR_KEY = "a";

// Zonas que la lengua tapa sin abatelenguas.
export const DEPRESSOR_ZONES = new Set([
	"amigdala-izq",
	"amigdala-der",
	"pared-posterior",
]);

// Cuánto vale cada milisegundo de luz sobre la zona. Sin abatelenguas, las
// zonas tapadas cuentan la mitad: hace falta el doble de tiempo para verlas.
// Valor inicial, a calibrar con un docente.
export const HIDDEN_RATE = 0.5;

export function lightRate(zone: string, depressor: boolean) {
	return !depressor && DEPRESSOR_ZONES.has(zone) ? HIDDEN_RATE : 1;
}

// Posición del centro y radio de una zona, en % del ancho y alto de la vista
// (que es 4:3).
export type ZoneSpot = { x: number; y: number; r: number };

export const ZONE_LABELS: Record<string, string> = {
	"amigdala-izq": "Amígdala izquierda",
	"amigdala-der": "Amígdala derecha",
	uvula: "Úvula",
	paladar: "Paladar",
	lengua: "Lengua",
	"pared-posterior": "Pared posterior",
};

// Zonas sobre el esquema dibujado (sin foto).
export const SCHEMATIC_SPOTS: Record<string, ZoneSpot> = {
	"amigdala-izq": { x: 32, y: 52, r: 9 },
	"amigdala-der": { x: 68, y: 52, r: 9 },
	uvula: { x: 50, y: 44, r: 6 },
	paladar: { x: 50, y: 24, r: 11 },
	lengua: { x: 50, y: 82, r: 13 },
	"pared-posterior": { x: 50, y: 58, r: 8 },
};

export type OropharynxPhoto = {
	// Ruta pública: el archivo va en apps/web/public/exam/.
	src: string;
	alt: string;
	// Atribución que pide la licencia; se muestra sobre la foto.
	credit: string;
	// Zonas ubicadas sobre esta foto. Las que falten usan el esquema.
	spots: Partial<Record<string, ZoneSpot>>;
};

// Fotos por clave de asset (cases/*.json: exam.<zona>.variants). Cada una
// tiene que estar en CREDITS.md con fuente, licencia, atribución y quién la
// validó (AGENTS.md); tests/oropharynx.test.ts lo controla. Ninguna imagen
// clínica generada con IA. Para ubicar las zonas: en desarrollo, la tecla Z
// en la vista muestra las zonas y las coordenadas del puntero.
//
// Fotos de la Persona 3: recortadas a 4:3 sin tocar el color (el color es el
// hallazgo). Zonas ubicadas a ojo; falta que las valide quien valide las
// fotos.
export const OROPHARYNX_PHOTOS: Record<string, OropharynxPhoto> = {
	"throat-erythema-01": {
		src: "/exam/throat-erythema-01.jpg",
		alt: "Garganta con la pared posterior roja, sin placas",
		credit: "FreeMediaKid!, Wikimedia Commons, CC0",
		spots: {
			"amigdala-izq": { x: 25, y: 60, r: 9 },
			"amigdala-der": { x: 78, y: 58, r: 9 },
			uvula: { x: 50, y: 27, r: 6 },
			paladar: { x: 50, y: 16, r: 10 },
			lengua: { x: 54, y: 82, r: 12 },
			"pared-posterior": { x: 49, y: 53, r: 12 },
		},
	},
	"throat-normal-01": {
		src: "/exam/throat-normal-01.jpg",
		alt: "Garganta normal",
		credit: "JonaLane, Wikimedia Commons, CC0",
		spots: {
			"amigdala-izq": { x: 27, y: 50, r: 8 },
			"amigdala-der": { x: 65, y: 51, r: 8 },
			uvula: { x: 46, y: 50, r: 6 },
			paladar: { x: 45, y: 20, r: 12 },
			lengua: { x: 50, y: 80, r: 14 },
			"pared-posterior": { x: 58, y: 50, r: 5 },
		},
	},
};

export function photoFor(assetKey: string | null) {
	return assetKey ? (OROPHARYNX_PHOTOS[assetKey] ?? null) : null;
}

export function spotFor(zone: string, photo: OropharynxPhoto | null) {
	return photo?.spots[zone] ?? SCHEMATIC_SPOTS[zone];
}
