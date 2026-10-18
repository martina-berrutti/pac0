"use client";

// "¿Te duele donde voy a tocar?": panel con las dos rodillas de frente. El
// estudiante toca una zona y la paciente contesta sí o no (en voz alta si hay
// voz, y con la cabeza). Solo queda marcada la última zona tocada. La zona
// correcta es el diagnóstico: no viaja al navegador, la compara el servidor.
import { Button } from "@pac0/ui/components/button";
import { type RefObject, useEffect, useState } from "react";
import type { PainZone } from "@/cases/schema";
import type { PatientAvatarHandle } from "@/components/avatar/patient-avatar";
import { api } from "@/lib/api-client";
import { ZONES } from "@/lib/exam/pain-zones";

type Side = PainZone["side"];
type Spot = PainZone["spot"];

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

const keyOf = (side: Side, spot: Spot) => `${side}:${spot}`;

function Leg({
	side,
	hover,
	wrong,
	foundKey,
	onHover,
	onPick,
}: {
	side: Side;
	hover: string | null;
	wrong: Set<string>;
	foundKey: string | null;
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
				const isRight = foundKey === k;
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
	sessionId,
	onClose,
	onAnswer,
	speaks = false,
}: {
	avatar: RefObject<PatientAvatarHandle | null>;
	sessionId: string;
	onClose: () => void;
	// Cada toque: si ahí le duele o no (la consulta se lo hace decir).
	onAnswer?: (found: boolean) => void;
	// Con voz, la paciente lo dice en voz alta y no hace falta el texto.
	speaks?: boolean;
}) {
	// Última zona tocada y si ahí le duele.
	const [last, setLast] = useState<{ key: string; found: boolean } | null>(
		null,
	);
	const [everFound, setEverFound] = useState(false);
	const [asking, setAsking] = useState(false);
	const [hover, setHover] = useState<string | null>(null);
	const wrong = new Set(last && !last.found ? [last.key] : []);
	const foundKey = last?.found ? last.key : null;

	// Cuerpo entero mientras el panel está abierto.
	useEffect(() => {
		avatar.current?.run({ kind: "view", view: "full" });
	}, [avatar]);

	async function pick(side: Side, spot: Spot) {
		if (asking) return;
		setAsking(true);
		try {
			const r = await api.locatePain(sessionId, side, spot);
			setLast({ key: keyOf(side, spot), found: r.found });
			if (r.found) setEverFound(true);
			onAnswer?.(r.found);
		} catch {
			setLast(null);
		} finally {
			setAsking(false);
		}
	}

	return (
		<div className="grid gap-3 rounded-2xl border bg-card p-4">
			<p className="text-muted-foreground text-sm">
				Preguntale «¿te duele donde voy a tocar?» y tocá un lugar de la rodilla.
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
						hover={hover}
						wrong={wrong}
						foundKey={foundKey}
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
			{/* Sin voz, la respuesta se lee: sí o no, corto. */}
			{!speaks && last && (
				<p
					className={`font-hand text-2xl ${last.found ? "text-pen" : "text-muted-foreground"}`}
					aria-live="polite"
				>
					{last.found ? "¡Sííí, ahí!" : "Nooo, ahí no."}
				</p>
			)}
			<div className="flex gap-2">
				<Button variant={everFound ? "default" : "outline"} onClick={onClose}>
					{everFound ? "Listo" : "Cancelar"}
				</Button>
			</div>
		</div>
	);
}
