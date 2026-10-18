"use client";

// "¿Te duele acá?": panel con las dos rodillas de frente. El estudiante toca
// una zona; la paciente contesta con una pista hasta que da en el lugar. La
// zona no es el diagnóstico (puede viajar al navegador).
import { Button } from "@pac0/ui/components/button";
import { type RefObject, useEffect, useState } from "react";
import type { PainZone } from "@/cases/schema";
import type { PatientAvatarHandle } from "@/components/avatar/patient-avatar";

type Side = PainZone["side"];
type Spot = PainZone["spot"];

// Centro de cada zona en el dibujo de UNA rodilla, con el lado interno hacia
// -x (la rodilla izquierda de la paciente, a la derecha de la pantalla). La
// otra se espeja. `ix` mide hacia adentro (hacia la otra pierna).
const ZONES: Record<
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
const SURFACE: Spot[] = [
	"interlinea-interna",
	"colateral-interno",
	"interlinea-externa",
	"colateral-externo",
	"rotula",
	"tendon-rotuliano",
];
const SIDES: Side[] = ["derecha", "izquierda"];
// Centro de cada rodilla en el dibujo. La derecha de la paciente va a la
// izquierda de la pantalla.
const KNEE_X: Record<Side, number> = { derecha: 105, izquierda: 295 };
const NEAR = 12;

const keyOf = (side: Side, spot: Spot) => `${side}:${spot}`;

// Respuesta de la paciente según lo tocado y lo correcto.
export function painHint(zone: PainZone, side: Side, spot: Spot): string {
	if (side !== zone.side) return "No, en la otra rodilla.";
	if (spot === zone.spot) return "¡Ahí! Justo ahí me duele.";
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

function Leg({
	side,
	zone,
	hover,
	wrong,
	found,
	onHover,
	onPick,
}: {
	side: Side;
	zone: PainZone;
	hover: string | null;
	wrong: Set<string>;
	found: boolean;
	onHover: (k: string | null) => void;
	onPick: (side: Side, spot: Spot) => void;
}) {
	// Derecha de la paciente: se espeja para que "interno" mire a la otra pierna.
	const flip = side === "derecha" ? -1 : 1;
	const order: Spot[] = ["centro", ...SURFACE];
	return (
		<g transform={`translate(${KNEE_X[side]} 0) scale(${flip} 1)`}>
			{/* Pierna: muslo, rodilla y pierna, de frente */}
			<path
				d="M-52 6 C-50 70 -46 120 -43 158 C-43 180 -40 204 -37 236 C-34 276 -33 316 -32 352 L32 352 C33 316 34 276 37 236 C40 204 43 180 43 158 C46 120 50 70 52 6 Z"
				fill="color-mix(in oklch, var(--clay) 45%, var(--card))"
				stroke="var(--foreground)"
				strokeOpacity="0.55"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			{/* Cuádriceps y cóndilos del fémur */}
			<path
				d="M-20 40 C-18 80 -16 110 -14 134 M20 40 C18 80 16 110 14 134"
				fill="none"
				stroke="var(--foreground)"
				strokeOpacity="0.18"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<path
				d="M-40 168 C-36 144 -16 138 -4 142 M40 168 C36 144 16 138 4 142"
				fill="none"
				stroke="var(--foreground)"
				strokeOpacity="0.25"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			{/* Meseta tibial y cresta de la tibia */}
			<path
				d="M-42 180 C-20 186 20 186 42 180 M0 232 C1 270 1 310 0 348"
				fill="none"
				stroke="var(--foreground)"
				strokeOpacity="0.22"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			{/* Tendón rotuliano y rótula */}
			<path
				d="M-9 186 L9 186 L6 232 L-6 232 Z"
				fill="color-mix(in oklch, var(--card) 60%, var(--clay))"
				stroke="var(--foreground)"
				strokeOpacity="0.4"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
			<ellipse
				cx="0"
				cy="166"
				rx="19"
				ry="22"
				fill="color-mix(in oklch, var(--card) 70%, var(--clay))"
				stroke="var(--foreground)"
				strokeOpacity="0.55"
				strokeWidth="2"
			/>
			{/* Zonas tocables (la central va primero: queda detrás) */}
			{order.map((spot) => {
				const z = ZONES[spot];
				const k = keyOf(side, spot);
				const isRight = found && side === zone.side && spot === zone.spot;
				const fill = isRight
					? "var(--pen)"
					: wrong.has(k)
						? "color-mix(in oklch, var(--foreground) 35%, transparent)"
						: hover === k
							? "color-mix(in oklch, var(--pen) 28%, transparent)"
							: "transparent";
				const x = -z.ix;
				// Los rótulos de la zona central y la rótula se leen sin espejar.
				return (
					// biome-ignore lint/a11y/useSemanticElements: zona dentro de un SVG, no puede ser <button>
					<ellipse
						key={spot}
						cx={x}
						cy={z.y}
						rx={z.rx}
						ry={z.ry}
						role="button"
						tabIndex={0}
						aria-label={`Rodilla ${side}: ${z.label}`}
						fill={fill}
						stroke={
							spot === "centro"
								? "var(--foreground)"
								: hover === k
									? "var(--pen)"
									: "transparent"
						}
						strokeOpacity={spot === "centro" ? 0.3 : 1}
						strokeDasharray={spot === "centro" ? "4 4" : undefined}
						strokeWidth="1.6"
						className="cursor-pointer outline-none transition-colors focus-visible:stroke-[var(--pen)]"
						onPointerEnter={() => onHover(k)}
						onPointerLeave={() => onHover(null)}
						onFocus={() => onHover(k)}
						onBlur={() => onHover(null)}
						onClick={() => onPick(side, spot)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onPick(side, spot);
							}
						}}
					>
						<title>{z.label}</title>
					</ellipse>
				);
			})}
		</g>
	);
}

export function DolorView({
	avatar,
	zone,
	onClose,
	onFound,
}: {
	avatar: RefObject<PatientAvatarHandle | null>;
	zone: PainZone;
	onClose: () => void;
	onFound?: () => void;
}) {
	const [wrong, setWrong] = useState<Set<string>>(new Set());
	const [found, setFound] = useState(false);
	const [hover, setHover] = useState<string | null>(null);
	const [said, setSaid] = useState("");

	// Cuerpo entero mientras el panel está abierto.
	useEffect(() => {
		avatar.current?.run({ kind: "view", view: "full" });
	}, [avatar]);

	function pick(side: Side, spot: Spot) {
		if (found) return;
		setSaid(painHint(zone, side, spot));
		if (side === zone.side && spot === zone.spot) {
			setFound(true);
			onFound?.();
			return;
		}
		setWrong((w) => new Set(w).add(keyOf(side, spot)));
	}

	return (
		<div className="grid gap-3 rounded-2xl border bg-card p-4">
			<p className="text-muted-foreground text-sm">
				¿Te duele acá? Tocá un lugar de la rodilla.
			</p>
			<svg
				viewBox="0 0 400 360"
				className="w-full"
				aria-label="Las dos rodillas de frente"
			>
				{SIDES.map((side) => (
					<Leg
						key={side}
						side={side}
						zone={zone}
						hover={hover}
						wrong={wrong}
						found={found}
						onHover={setHover}
						onPick={pick}
					/>
				))}
				<text
					x={KNEE_X.derecha}
					y="12"
					textAnchor="middle"
					fontSize="12"
					fill="var(--muted-foreground)"
				>
					derecha de la paciente
				</text>
				<text
					x={KNEE_X.izquierda}
					y="12"
					textAnchor="middle"
					fontSize="12"
					fill="var(--muted-foreground)"
				>
					izquierda de la paciente
				</text>
			</svg>
			<p className="text-muted-foreground text-xs">
				{hover
					? (ZONES[hover.split(":")[1] as Spot]?.label ?? "")
					: "El óvalo punteado es adentro, en el centro."}
			</p>
			<p
				className="min-h-[3.5rem] rounded-2xl border border-foreground/10 bg-background px-3 py-2 font-hand text-foreground text-xl"
				aria-live="polite"
			>
				{said}
			</p>
			<div className="flex gap-2">
				<Button variant={found ? "default" : "outline"} onClick={onClose}>
					{found ? "Listo" : "Cancelar"}
				</Button>
			</div>
		</div>
	);
}
