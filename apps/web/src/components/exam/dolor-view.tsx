"use client";

// "¿Dónde te duele?": el estudiante toca la rodilla del avatar. Hay tres
// puntos por rodilla (interna, externa, anterior); la paciente corrige con
// una pista hasta que toca el correcto. La zona no es el diagnóstico.
import { Button } from "@pac0/ui/components/button";
import { type RefObject, useEffect, useRef, useState } from "react";

import type { PatientAvatarHandle } from "@/components/avatar/patient-avatar";
import type { KneeSide, KneeSpot } from "@/lib/avatar/exam-poses";

export type PainZoneProp = { side: KneeSide; spot: KneeSpot };

const SIDES: KneeSide[] = ["izquierda", "derecha"];
const SPOTS: KneeSpot[] = ["interna", "externa", "anterior"];
const FOUND_MS = 2000;

const keyOf = (side: KneeSide, spot: KneeSpot) => `${side}-${spot}`;

// Pista de la paciente según lo que tocaron.
export function painHint(
	zone: PainZoneProp,
	side: KneeSide,
	spot: KneeSpot,
): string {
	if (side !== zone.side) return "No, en la otra rodilla.";
	if (zone.spot === "interna") return "No, más hacia adentro.";
	if (zone.spot === "externa") return "No, más hacia afuera.";
	return spot === "anterior" ? "" : "Más adelante, en la rodilla.";
}

type Pt = { x: number; y: number };

export function DolorView({
	avatar,
	zone,
	onClose,
	onFound,
}: {
	avatar: RefObject<PatientAvatarHandle | null>;
	zone: PainZoneProp;
	onClose: () => void;
	onFound?: () => void;
}) {
	const [points, setPoints] = useState<Record<string, Pt>>({});
	const [wrong, setWrong] = useState<Set<string>>(new Set());
	const [found, setFound] = useState(false);
	const [bubble, setBubble] = useState<{ text: string; at: Pt } | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Cuerpo entero para que se vean las rodillas.
	useEffect(() => {
		avatar.current?.run({ kind: "view", view: "full" });
	}, [avatar]);

	// Los puntos siguen al avatar (como el termómetro con la axila).
	useEffect(() => {
		let frame = 0;
		const loop = () => {
			const next: Record<string, Pt> = {};
			for (const side of SIDES)
				for (const spot of SPOTS) {
					const p = avatar.current?.kneePoint(side, spot);
					if (p) next[keyOf(side, spot)] = p;
				}
			setPoints((prev) => {
				const same = Object.keys(next).every((k) => {
					const a = prev[k];
					const b = next[k] as Pt;
					return a && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
				});
				return same && Object.keys(prev).length === Object.keys(next).length
					? prev
					: next;
			});
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(frame);
			if (timer.current) clearTimeout(timer.current);
		};
	}, [avatar]);

	function pick(side: KneeSide, spot: KneeSpot) {
		if (found) return;
		const at = points[keyOf(side, spot)];
		if (!at) return;
		if (side === zone.side && spot === zone.spot) {
			setFound(true);
			setBubble({ text: "¡Ahí, justo ahí me duele!", at });
			onFound?.();
			timer.current = setTimeout(onClose, FOUND_MS);
			return;
		}
		setWrong((w) => new Set(w).add(keyOf(side, spot)));
		setBubble({ text: painHint(zone, side, spot), at });
	}

	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<p
				className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-foreground/10 bg-card px-4 py-2 text-center font-hand text-foreground text-lg shadow-md"
				aria-live="polite"
			>
				Tocá donde te muestra que le duele.
			</p>
			{SIDES.flatMap((side) =>
				SPOTS.map((spot) => {
					const k = keyOf(side, spot);
					const at = points[k];
					if (!at) return null;
					const isRight = found && side === zone.side && spot === zone.spot;
					return (
						<button
							key={k}
							type="button"
							aria-label={`Rodilla ${side}, cara ${spot}`}
							onClick={() => pick(side, spot)}
							style={{ left: at.x, top: at.y }}
							className={`pointer-events-auto absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors ${
								isRight
									? "border-[var(--pen)] bg-[var(--pen)]"
									: wrong.has(k)
										? "border-foreground/40 bg-foreground/40"
										: "border-foreground/50 bg-foreground/10 hover:bg-foreground/25"
							}`}
						/>
					);
				}),
			)}
			{bubble?.text && (
				<p
					key={bubble.text + bubble.at.x}
					style={{ left: bubble.at.x, top: bubble.at.y - 24 }}
					className="fade-in absolute w-max max-w-[16rem] -translate-x-1/2 -translate-y-full animate-in rounded-2xl border border-foreground/10 bg-card px-3 py-2 text-center font-hand text-foreground text-lg shadow-md"
					aria-live="polite"
				>
					{bubble.text}
				</p>
			)}
			<div className="absolute inset-x-0 bottom-5 flex justify-center">
				<Button
					variant="secondary"
					className="pointer-events-auto shadow"
					onClick={onClose}
				>
					Listo
				</Button>
			</div>
		</div>
	);
}
