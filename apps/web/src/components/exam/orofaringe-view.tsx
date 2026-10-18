"use client";

// Vista de examen de orofaringe con linterna (plan.md, sección 6). Un círculo
// de luz sigue al mouse o al dedo y se mide cuánto tiempo pasa sobre cada
// zona. Si el asset del caso tiene foto registrada (lib/exam/oropharynx.ts),
// la muestra oscurecida con sus zonas; si no, un esquema (no es una imagen
// clínica).
import { Button } from "@pac0/ui/components/button";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ExamResult } from "@/lib/contracts/exam";
import {
	DEPRESSOR_KEY,
	DEPRESSOR_ZONES,
	lightRate,
	photoFor,
	spotFor,
	ZONE_LABELS,
} from "@/lib/exam/oropharynx";

const LIGHT_RADIUS = 14;
// En desarrollo, la tecla Z muestra las zonas y las coordenadas del puntero
// para ubicarlas sobre una foto nueva.
const CALIBRATE_KEY = "z";
const CAN_CALIBRATE = process.env.NODE_ENV !== "production";

export function OrofaringeView({
	exam,
	onClose,
	endRequest = 0,
	bare = false,
}: {
	exam: ExamResult;
	onClose: (hotspotTimesMs: Record<string, number>) => void;
	// Solo la foto con la linterna, sin tiempos ni botones (consulta a
	// pantalla completa: se cierra hablando; el abatelenguas, con la tecla A).
	bare?: boolean;
	// Sube cuando el estudiante termina el examen hablando ("cerrá la boca"):
	// se cierra igual que con el botón, con los tiempos medidos.
	endRequest?: number;
}) {
	const box = useRef<HTMLDivElement>(null);
	const [light, setLight] = useState<{ x: number; y: number } | null>(null);
	const times = useRef<Record<string, number>>({});
	const close = useRef(onClose);
	close.current = onClose;
	useEffect(() => {
		if (endRequest > 0) close.current({ ...times.current });
	}, [endRequest]);
	const [, force] = useState(0);
	// Abatelenguas: solo con la boca bien abierta (plan.md, sección 6).
	const canDepress = exam.action.variant === "completa";
	const [depressor, setDepressor] = useState(false);
	const [calibrate, setCalibrate] = useState(false);
	const photo = photoFor(exam.assetKey);
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
				const h = spotFor(key, photo);
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
	}, [light, visible, depressor, photo]);

	// La tecla A prende y apaga el abatelenguas; la Z, las zonas (desarrollo).
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const target = e.target as HTMLElement | null;
			if (e.repeat || target?.closest("input, textarea, [contenteditable]"))
				return;
			const key = e.key.toLowerCase();
			if (key === DEPRESSOR_KEY && canDepress) setDepressor((d) => !d);
			if (key === CALIBRATE_KEY && CAN_CALIBRATE) setCalibrate((c) => !c);
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
				className={`relative aspect-[4/3] w-full touch-none select-none overflow-hidden bg-neutral-900 ${bare ? "rounded-xl shadow-2xl" : ""}`}
				role="img"
				aria-label={`Examen de orofaringe, apertura ${exam.action.variant}${depressor ? ", con abatelenguas" : ""}`}
			>
				{photo ? (
					// biome-ignore lint/performance/noImgElement: foto local fija, sin optimizar
					<img
						src={photo.src}
						alt={photo.alt}
						draggable={false}
						className="absolute inset-0 h-full w-full object-cover"
					/>
				) : (
					<div className="absolute inset-[12%] rounded-[45%] bg-rose-950" />
				)}
				{visible.map((key) => {
					const h = spotFor(key, photo);
					if (!h) return null;
					// Sin abatelenguas, la lengua sube y tapa parte de la garganta:
					// en el esquema la zona se apaga; sobre la foto, se sombrea.
					const hidden = canDepress && !depressor && DEPRESSOR_ZONES.has(key);
					const y = key === "lengua" && depressor && !photo ? h.y + 6 : h.y;
					const box = {
						left: `${h.x - h.r}%`,
						top: `${y - h.r * 1.33}%`,
						width: `${h.r * 2}%`,
						height: `${h.r * 2.66}%`,
					};
					if (photo)
						return hidden ? (
							<div
								key={key}
								className="absolute rounded-full bg-black/50 blur-sm"
								style={box}
							/>
						) : null;
					return (
						<div
							key={key}
							className="absolute rounded-full border border-rose-300/40 bg-rose-800/70 transition-all"
							style={{ ...box, opacity: hidden ? 0.45 : 1 }}
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
				{calibrate &&
					visible.map((key) => {
						const h = spotFor(key, photo);
						if (!h) return null;
						return (
							<div
								key={key}
								className="pointer-events-none absolute rounded-full border-2 border-sky-400 text-[10px] text-sky-200"
								style={{
									left: `${h.x - h.r}%`,
									top: `${h.y - h.r * 1.33}%`,
									width: `${h.r * 2}%`,
									height: `${h.r * 2.66}%`,
								}}
							>
								{key}
							</div>
						);
					})}
				<p className="absolute bottom-1 left-2 text-[10px] text-neutral-400">
					{calibrate && light
						? `x ${light.x.toFixed(0)} · y ${light.y.toFixed(0)}`
						: photo
							? photo.credit
							: `Esquema. Foto pendiente: ${exam.assetKey ?? "sin imagen"}`}
				</p>
			</div>
			{!bare && (
				<>
					<ul className="grid grid-cols-2 gap-1 text-xs">
						{visible.map((key) => (
							<li key={key} className="text-muted-foreground">
								{ZONE_LABELS[key] ?? key}:{" "}
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
							{depressor ? "Sacar el abatelenguas" : "Usar el abatelenguas"}{" "}
							(tecla A)
						</Button>
					)}
					<Button onClick={() => onClose({ ...times.current })}>
						Terminar el examen
					</Button>
				</>
			)}
		</div>
	);
}
