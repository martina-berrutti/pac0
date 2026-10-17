"use client";

// Vista de examen de orofaringe con linterna (plan.md, sección 6). Un círculo
// de luz sigue al mouse o al dedo y se mide cuánto tiempo pasa sobre cada
// zona. Sin foto con licencia todavía: muestra un esquema (no es una imagen
// clínica). La foto real la pone la Persona 3 en assets/ con CREDITS.md.
import { Button } from "@pac0/ui/components/button";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ExamResult } from "@/lib/contracts/exam";
import {
	DEPRESSOR_KEY,
	DEPRESSOR_ZONES,
	lightRate,
} from "@/lib/exam/oropharynx";

// Posición (en %) y radio de cada zona sobre la imagen.
const HOTSPOTS: Record<
	string,
	{ x: number; y: number; r: number; label: string }
> = {
	"amigdala-izq": { x: 32, y: 52, r: 9, label: "Amígdala izquierda" },
	"amigdala-der": { x: 68, y: 52, r: 9, label: "Amígdala derecha" },
	uvula: { x: 50, y: 44, r: 6, label: "Úvula" },
	paladar: { x: 50, y: 24, r: 11, label: "Paladar" },
	lengua: { x: 50, y: 82, r: 13, label: "Lengua" },
	"pared-posterior": { x: 50, y: 58, r: 8, label: "Pared posterior" },
};

const LIGHT_RADIUS = 14;

export function OrofaringeView({
	exam,
	onClose,
}: {
	exam: ExamResult;
	onClose: (hotspotTimesMs: Record<string, number>) => void;
}) {
	const box = useRef<HTMLDivElement>(null);
	const [light, setLight] = useState<{ x: number; y: number } | null>(null);
	const times = useRef<Record<string, number>>({});
	const [, force] = useState(0);
	// Abatelenguas: solo con la boca bien abierta (plan.md, sección 6).
	const canDepress = exam.action.variant === "completa";
	const [depressor, setDepressor] = useState(false);
	// En apertura parcial solo se ve la lengua (plan.md: labios y dientes).
	const visible = useMemo(
		() =>
			exam.action.variant === "completa"
				? exam.hotspots
				: exam.hotspots.filter((h) => h === "lengua"),
		[exam],
	);

	useEffect(() => {
		if (!light) return;
		const tick = 100;
		const id = setInterval(() => {
			for (const key of visible) {
				const h = HOTSPOTS[key];
				if (
					h &&
					Math.hypot(light.x - h.x, light.y - h.y) < h.r + LIGHT_RADIUS / 2
				) {
					times.current[key] =
						(times.current[key] ?? 0) + tick * lightRate(key, depressor);
				}
			}
			force((n) => n + 1);
		}, tick);
		return () => clearInterval(id);
	}, [light, visible, depressor]);

	// La tecla A prende y apaga el abatelenguas.
	useEffect(() => {
		if (!canDepress) return;
		function onKey(e: KeyboardEvent) {
			const target = e.target as HTMLElement | null;
			if (
				e.repeat ||
				e.key.toLowerCase() !== DEPRESSOR_KEY ||
				target?.closest("input, textarea, [contenteditable]")
			)
				return;
			setDepressor((d) => !d);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [canDepress]);

	function move(e: React.PointerEvent) {
		const rect = box.current?.getBoundingClientRect();
		if (!rect) return;
		setLight({
			x: ((e.clientX - rect.left) / rect.width) * 100,
			y: ((e.clientY - rect.top) / rect.height) * 100,
		});
	}

	if (exam.action.variant === "negado") {
		return (
			<div className="grid gap-2 border p-3">
				<p>
					El paciente no quiso abrir la boca. Explicale qué vas a hacer y pedile
					permiso.
				</p>
				<Button variant="outline" onClick={() => onClose({})}>
					Volver a la consulta
				</Button>
			</div>
		);
	}

	return (
		<div className="grid gap-2">
			<div
				ref={box}
				onPointerMove={move}
				onPointerDown={move}
				onPointerLeave={() => setLight(null)}
				className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden bg-neutral-900"
				role="img"
				aria-label={`Examen de orofaringe, apertura ${exam.action.variant}${depressor ? ", con abatelenguas" : ""}`}
			>
				{/* Esquema hasta tener la foto con licencia. */}
				<div className="absolute inset-[12%] rounded-[45%] bg-rose-950" />
				{visible.map((key) => {
					const h = HOTSPOTS[key];
					if (!h) return null;
					// Sin abatelenguas, la lengua sube y tapa parte de la garganta.
					const hidden = canDepress && !depressor && DEPRESSOR_ZONES.has(key);
					const y = key === "lengua" && depressor ? h.y + 6 : h.y;
					return (
						<div
							key={key}
							className="absolute rounded-full border border-rose-300/40 bg-rose-800/70 transition-all"
							style={{
								opacity: hidden ? 0.45 : 1,
								left: `${h.x - h.r}%`,
								top: `${y - h.r * 1.33}%`,
								width: `${h.r * 2}%`,
								height: `${h.r * 2.66}%`,
							}}
						/>
					);
				})}
				{depressor && (
					<div
						className="absolute top-[74%] left-[30%] h-[5%] w-[55%] rounded-full bg-amber-200/90"
						aria-hidden
					/>
				)}
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background: light
							? `radial-gradient(circle at ${light.x}% ${light.y}%, transparent ${LIGHT_RADIUS}%, rgba(0,0,0,0.94) ${LIGHT_RADIUS + 6}%)`
							: "rgba(0,0,0,0.94)",
					}}
				/>
				<p className="absolute bottom-1 left-2 text-[10px] text-neutral-400">
					Esquema. Foto pendiente: {exam.assetKey ?? "sin imagen"}
				</p>
			</div>
			<ul className="grid grid-cols-2 gap-1 text-xs">
				{visible.map((key) => (
					<li key={key} className="text-muted-foreground">
						{HOTSPOTS[key]?.label ?? key}:{" "}
						{((times.current[key] ?? 0) / 1000).toFixed(1)} s
					</li>
				))}
			</ul>
			{canDepress && (
				<Button
					variant="outline"
					aria-pressed={depressor}
					onClick={() => setDepressor((d) => !d)}
				>
					{depressor ? "Sacar el abatelenguas" : "Usar el abatelenguas"} (tecla
					A)
				</Button>
			)}
			<Button onClick={() => onClose({ ...times.current })}>
				Terminar el examen
			</Button>
		</div>
	);
}
