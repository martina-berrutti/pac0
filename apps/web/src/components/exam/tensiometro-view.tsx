"use client";

// Tensiómetro virtual (plan.md, sección 6, afiche HC-01). Se elige el
// manguito, se lo arrastra al brazo, se mantiene Espacio para inflar y al
// soltar desinfla despacio. Los ruidos (sintetizados, no son una grabación
// clínica) suenan entre la PAS y la PAD que marca el manómetro. S marca la PAS
// y D la PAD. Lo que marca el manómetro lo decide el servidor.
import { Button } from "@pac0/ui/components/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api-client";
import type { BpReading, CuffSize } from "@/lib/contracts/exam";
import type { BpStart } from "@/server/vitals";

const CUFFS: { size: CuffSize; label: string }[] = [
	{ size: "chico", label: "Chico (17 a 22 cm)" },
	{ size: "adecuado", label: "Adulto (22 a 32 cm)" },
	{ size: "grande", label: "Grande (32 a 42 cm)" },
];

const MAX_MMHG = 300;
const INFLATE_PER_S = 60;
const DEFLATE_PER_S = 4;
const OPEN_VALVE_PER_S = 40;

type Stage = "cargando" | "colocar" | "medir" | "guardando";

// Un "tum" corto: seno grave con envolvente rápida.
function thump(ctx: AudioContext) {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.frequency.value = 55;
	gain.gain.setValueAtTime(0.0001, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.015);
	gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
	osc.connect(gain).connect(ctx.destination);
	osc.start();
	osc.stop(ctx.currentTime + 0.13);
}

export function TensiometroView({
	sessionId,
	start,
	onClose,
}: {
	sessionId: string;
	// Medición que ya creó medir_presion (voz); sin ella, se crea al abrir.
	start: BpStart | null;
	onClose: () => void;
}) {
	const [stage, setStage] = useState<Stage>(start ? "colocar" : "cargando");
	const [measurementId, setMeasurementId] = useState<string | null>(
		start?.measurementId ?? null,
	);
	const [armCm, setArmCm] = useState<number | null>(start?.armCm ?? null);
	const [cuff, setCuff] = useState<CuffSize | null>(null);
	const [rolledUp, setRolledUp] = useState(false);
	const [drag, setDrag] = useState<{
		size: CuffSize;
		x: number;
		y: number;
	} | null>(null);
	const [picked, setPicked] = useState<CuffSize | null>(null);
	const arm = useRef<HTMLButtonElement>(null);
	const started = useRef(false);

	// Simulación: refs para no re-renderizar en cada cuadro.
	const gauge = useRef<BpReading | null>(null);
	const pulse = useRef(72);
	const pressure = useRef(0);
	const inflating = useRef(false);
	const valveOpen = useRef(false);
	const lastBeat = useRef(0);
	const audio = useRef<AudioContext | null>(null);
	const [shown, setShown] = useState(0);
	const [beat, setBeat] = useState(false);
	const [marked, setMarked] = useState<{ s: number | null; d: number | null }>({
		s: null,
		d: null,
	});

	useEffect(() => {
		// Una sola medición aunque React monte dos veces en desarrollo.
		if (started.current || measurementId) return;
		started.current = true;
		api
			.startBp(sessionId)
			.then((r) => {
				setMeasurementId(r.measurementId);
				setArmCm(r.armCm);
				setStage("colocar");
			})
			.catch((e) => {
				toast.error(
					e instanceof ApiError
						? e.message
						: "No se pudo abrir el tensiómetro.",
				);
				onClose();
			});
	}, [sessionId, onClose, measurementId]);

	async function startMeasuring() {
		if (!measurementId || !cuff) return;
		audio.current = new AudioContext();
		try {
			const r = await api.placeCuff(sessionId, measurementId, cuff, !rolledUp);
			gauge.current = r.gauge;
			pulse.current = r.pulse;
			setStage("medir");
		} catch (e) {
			toast.error(
				e instanceof ApiError ? e.message : "No se pudo colocar el manguito.",
			);
		}
	}

	useEffect(() => {
		if (stage !== "medir") return;
		let frame = 0;
		let last = performance.now();
		const loop = (now: number) => {
			const dt = (now - last) / 1000;
			last = now;
			const p = pressure.current;
			if (inflating.current) {
				pressure.current = Math.min(MAX_MMHG, p + INFLATE_PER_S * dt);
			} else if (p > 0) {
				const rate = valveOpen.current ? OPEN_VALVE_PER_S : DEFLATE_PER_S;
				pressure.current = Math.max(0, p - rate * dt);
			}
			const g = gauge.current;
			const audible =
				g !== null &&
				!inflating.current &&
				pressure.current <= g.pas &&
				pressure.current >= g.pad;
			if (audible && now - lastBeat.current > 60_000 / pulse.current) {
				lastBeat.current = now;
				if (audio.current) thump(audio.current);
				setBeat(true);
				setTimeout(() => setBeat(false), 120);
			}
			setShown(Math.round(pressure.current / 2) * 2);
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	}, [stage]);

	const mark = useCallback((which: "s" | "d") => {
		const value = Math.round(pressure.current / 2) * 2;
		setMarked((m) => ({ ...m, [which]: value }));
	}, []);

	useEffect(() => {
		if (stage !== "medir") return;
		const down = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				e.preventDefault();
				inflating.current = true;
				valveOpen.current = false;
			} else if (e.key === "s" || e.key === "S") mark("s");
			else if (e.key === "d" || e.key === "D") mark("d");
		};
		const up = (e: KeyboardEvent) => {
			if (e.code === "Space") inflating.current = false;
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, [stage, mark]);

	useEffect(() => () => void audio.current?.close(), []);

	async function save() {
		if (!measurementId || marked.s === null || marked.d === null) return;
		setStage("guardando");
		try {
			await api.markBp(sessionId, measurementId, {
				pas: marked.s,
				pad: marked.d,
			});
			onClose();
		} catch (e) {
			toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
			setStage("medir");
		}
	}

	// Arrastrar el manguito al brazo (mouse o dedo).
	function startDrag(size: CuffSize, e: React.PointerEvent) {
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		setDrag({ size, x: e.clientX, y: e.clientY });
	}
	function moveDrag(e: React.PointerEvent) {
		if (drag) setDrag({ ...drag, x: e.clientX, y: e.clientY });
	}
	function endDrag(e: React.PointerEvent) {
		if (!drag) return;
		const rect = arm.current?.getBoundingClientRect();
		const inside =
			rect &&
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		if (inside) setCuff(drag.size);
		setDrag(null);
	}

	if (stage === "cargando") {
		return <p className="text-muted-foreground text-sm">Preparando…</p>;
	}

	if (stage === "colocar") {
		return (
			<div className="grid gap-3 border p-3">
				<p className="text-sm">
					Perímetro del brazo: <strong>{armCm} cm</strong>. Arrastrá el manguito
					que corresponde hasta el brazo (o tocá el manguito y después el
					brazo).
				</p>
				<div className="flex flex-wrap gap-2">
					{CUFFS.map((c) => (
						<button
							key={c.size}
							type="button"
							onPointerDown={(e) => startDrag(c.size, e)}
							onPointerMove={moveDrag}
							onPointerUp={endDrag}
							onClick={() => setPicked(c.size)}
							aria-pressed={picked === c.size}
							className={`touch-none select-none border px-3 py-2 text-sm ${
								picked === c.size ? "border-primary bg-primary/10" : "bg-muted"
							}`}
						>
							{c.label}
						</button>
					))}
				</div>
				<button
					type="button"
					ref={arm}
					onClick={() => picked && setCuff(picked)}
					className={`grid h-24 place-items-center border-2 border-dashed text-sm ${
						rolledUp ? "bg-orange-200/40" : "bg-sky-800/30"
					}`}
				>
					{cuff
						? `Manguito ${CUFFS.find((c) => c.size === cuff)?.label} ${
								rolledUp ? "sobre la piel" : "sobre la manga del buzo"
							}`
						: rolledUp
							? "Brazo (arremangado)"
							: "Brazo (con buzo de manga larga)"}
				</button>
				<Button variant="outline" onClick={() => setRolledUp((r) => !r)}>
					{rolledUp ? "Bajar la manga" : "Arremangar"}
				</Button>
				<div className="flex gap-2">
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={startMeasuring} disabled={!cuff}>
						Empezar a medir
					</Button>
				</div>
				{drag && (
					<div
						className="pointer-events-none fixed z-50 border bg-primary px-2 py-1 text-primary-foreground text-xs"
						style={{ left: drag.x + 8, top: drag.y + 8 }}
					>
						Manguito
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="grid gap-3 border p-3">
			<p className="text-muted-foreground text-sm">
				Mantené <kbd>Espacio</kbd> para inflar; al soltar desinfla despacio.
				Marcá <kbd>S</kbd> en el primer ruido y <kbd>D</kbd> cuando dejan de
				sonar.
			</p>
			<div className="grid place-items-center gap-1">
				<span className="font-mono text-5xl tabular-nums" aria-live="off">
					{shown}
				</span>
				<span className="text-muted-foreground text-xs">mmHg</span>
				<div className="h-2 w-full bg-muted">
					<div
						className="h-2 bg-primary"
						style={{ width: `${(shown / MAX_MMHG) * 100}%` }}
					/>
				</div>
				<span
					className={`text-sm transition-opacity ${beat ? "opacity-100" : "opacity-0"}`}
				>
					♥ tum
				</span>
			</div>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Button
					className="touch-none select-none"
					onPointerDown={() => {
						inflating.current = true;
						valveOpen.current = false;
					}}
					onPointerUp={() => {
						inflating.current = false;
					}}
					onPointerLeave={() => {
						inflating.current = false;
					}}
				>
					Inflar (mantener)
				</Button>
				<Button variant="outline" onClick={() => mark("s")}>
					PAS (S): {marked.s ?? "–"}
				</Button>
				<Button variant="outline" onClick={() => mark("d")}>
					PAD (D): {marked.d ?? "–"}
				</Button>
				<Button
					variant="outline"
					onClick={() => {
						valveOpen.current = true;
					}}
				>
					Abrir la válvula
				</Button>
			</div>
			<div className="flex gap-2">
				<Button variant="outline" onClick={onClose}>
					Cancelar
				</Button>
				<Button
					onClick={save}
					disabled={
						stage === "guardando" || marked.s === null || marked.d === null
					}
				>
					Listo
				</Button>
			</div>
		</div>
	);
}
