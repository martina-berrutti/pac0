// Zonas de la rodilla para "¿te duele acá?" y la pista de la paciente. La
// zona correcta es el diagnóstico (menisco, cruzado, colateral): la pista la
// calcula el servidor y al navegador solo llegan las coordenadas del dibujo.
import type { PainZone } from "@/cases/schema";

type Side = PainZone["side"];
type Spot = PainZone["spot"];

// Centro de cada zona en el dibujo de UNA rodilla, con el lado interno hacia
// -x (la rodilla izquierda de la paciente, a la derecha de la pantalla). La
// otra se espeja. `ix` mide hacia adentro (hacia la otra pierna).
export const ZONES: Record<
	Spot,
	{ label: string; ix: number; y: number; rx: number; ry: number }
> = {
	"interlinea-interna": {
		label: "línea de la articulación, por dentro",
		ix: 31,
		y: 178,
		rx: 12,
		ry: 8,
	},
	"colateral-interno": {
		label: "borde interno, a lo largo del ligamento",
		ix: 34,
		y: 142,
		rx: 8,
		ry: 22,
	},
	"interlinea-externa": {
		label: "línea de la articulación, por fuera",
		ix: -31,
		y: 178,
		rx: 12,
		ry: 8,
	},
	"colateral-externo": {
		label: "borde externo, a lo largo del ligamento",
		ix: -34,
		y: 142,
		rx: 8,
		ry: 22,
	},
	rotula: { label: "rótula", ix: 0, y: 166, rx: 18, ry: 20 },
	"tendon-rotuliano": {
		label: "tendón de la rótula",
		ix: 0,
		y: 212,
		rx: 8,
		ry: 18,
	},
	centro: { label: "adentro, en el centro", ix: 0, y: 172, rx: 36, ry: 38 },
};
const NEAR = 12;

// Respuesta de la paciente según lo tocado y lo correcto.
export function painHint(zone: PainZone, side: Side, spot: Spot): string {
	if (side !== zone.side) return "No, ahí no. Es en la otra rodilla.";
	if (spot === zone.spot) return "¡Sí! Ahí me duele.";
	if (zone.spot === "centro")
		return "No es en un punto de afuera… me duele adentro, en el medio de la rodilla.";
	const from = ZONES[spot];
	const to = ZONES[zone.spot];
	const dx = to.ix - from.ix;
	const dy = to.y - from.y;
	const side_ =
		Math.abs(dx) > NEAR ? (dx > 0 ? "hacia adentro" : "hacia afuera") : null;
	const vert = Math.abs(dy) > NEAR ? (dy > 0 ? "abajo" : "arriba") : null;
	if (side_ && vert) return `No, más ${side_} y un poco más ${vert}.`;
	if (side_) return `No, más ${side_}.`;
	if (vert) return `Un poquito más ${vert}.`;
	return "Casi, un poquito al lado.";
}
