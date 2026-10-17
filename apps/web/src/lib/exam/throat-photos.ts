// Fotos de orofaringe con licencia (Persona 3): fuente, licencia y autor en
// CREDITS.md. Recortadas a 4:3 sin tocar el color, porque el color es el
// hallazgo. Las zonas están ubicadas a ojo sobre cada foto, en % del ancho y
// del alto; hay que revisarlas con quien valide las imágenes.

export type Spot = { x: number; y: number; r: number };

export type ThroatPhoto = {
	src: string;
	// Para el pie de la imagen.
	credit: string;
	spots: Record<string, Spot>;
};

// Clave del asset del caso (exam.*.variants) -> foto.
export const THROAT_PHOTOS: Record<string, ThroatPhoto> = {
	"throat-exudate-01": {
		src: "/assets/exam/throat-exudate-01.jpg",
		credit: "Michaelbladon, Wikimedia Commons, dominio público",
		spots: {
			"amigdala-izq": { x: 34, y: 42, r: 12 },
			"amigdala-der": { x: 71, y: 46, r: 11 },
			uvula: { x: 54, y: 35, r: 6 },
			paladar: { x: 54, y: 10, r: 11 },
			lengua: { x: 50, y: 80, r: 13 },
			"pared-posterior": { x: 55, y: 52, r: 6 },
		},
	},
	"throat-erythema-01": {
		src: "/assets/exam/throat-erythema-01.jpg",
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
		src: "/assets/exam/throat-normal-01.jpg",
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
