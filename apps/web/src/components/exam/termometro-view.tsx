"use client";

// Termómetro digital en la axila, con el mouse o el dedo: el paciente levanta
// el brazo, se arrastra el termómetro hasta la axila (o se lo toca y después
// la axila), el paciente baja el brazo y, al sonar, se lee la temperatura.
// Lo que marca lo decide el servidor (vitals.tax del caso).
import { Button } from "@pac0/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api-client";
import type { ExamPose } from "@/lib/avatar/exam-poses";

// Lo que tarda en medir (un termómetro digital real tarda más; acá se acorta).
const MEASURE_MS = 6000;
const START_C = 35.2;

type Stage = "poner" | "midiendo" | "listo";

// Bip-bip del termómetro.
function beep() {
	const ctx = new AudioContext();
	for (const at of [0, 0.18, 0.36]) {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.frequency.value = 3100;
		gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
		gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + at + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.1);
		osc.connect(gain).connect(ctx.destination);
		osc.start(ctx.currentTime + at);
		osc.stop(ctx.currentTime + at + 0.11);
	}
	setTimeout(() => void ctx.close(), 800);
}

export function TermometroView({
	sessionId,
	onAvatar,
	onClose,
}: {
	sessionId: string;
	// Mueve al avatar: levanta el brazo, lo baja con el termómetro.
	onAvatar?: (pose: ExamPose | null) => void;
	onClose: () => void;
}) {
	const [stage, setStage] = useState<Stage>("poner");
	const [celsius, setCelsius] = useState<number | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [picked, setPicked] = useState(false);
	const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
	const armpit = useRef<HTMLButtonElement>(null);
	const busy = useRef(false);

	useEffect(() => {
		onAvatar?.({ kind: "temperatura", step: "levantar" });
	}, [onAvatar]);

	useEffect(() => {
		if (stage !== "midiendo") return;
		const startedAt = performance.now();
		const id = setInterval(() => {
			const t = performance.now() - startedAt;
			setElapsed(t);
			if (t >= MEASURE_MS) {
				clearInterval(id);
				beep();
				setStage("listo");
			}
		}, 100);
		return () => clearInterval(id);
	}, [stage]);

	async function place() {
		if (busy.current) return;
		busy.current = true;
		try {
			const r = await api.takeTemperature(sessionId);
			setCelsius(r.celsius);
			onAvatar?.({ kind: "temperatura", step: "midiendo" });
			setStage("midiendo");
		} catch (e) {
			toast.error(
				e instanceof ApiError ? e.message : "No se pudo tomar la temperatura.",
			);
			busy.current = false;
		}
	}

	function startDrag(e: React.PointerEvent) {
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		setDrag({ x: e.clientX, y: e.clientY });
	}
	function moveDrag(e: React.PointerEvent) {
		if (drag) setDrag({ x: e.clientX, y: e.clientY });
	}
	function endDrag(e: React.PointerEvent) {
		if (!drag) return;
		const r = armpit.current?.getBoundingClientRect();
		const inside =
			r &&
			e.clientX >= r.left &&
			e.clientX <= r.right &&
			e.clientY >= r.top &&
			e.clientY <= r.bottom;
		setDrag(null);
		if (inside) void place();
	}

	function close() {
		onAvatar?.(null);
		onClose();
	}

	// La pantallita sube como un termómetro real: rápido al principio.
	const progress = Math.min(1, elapsed / MEASURE_MS);
	const shownC =
		celsius === null
			? null
			: stage === "listo"
				? celsius
				: START_C + (celsius - START_C) * (1 - (1 - progress) ** 3);
	const display =
		shownC === null ? "--,-" : shownC.toFixed(1).replace(".", ",");
	const armUp = stage === "poner";

	return (
		<div className="grid gap-4 rounded-2xl border bg-card p-4">
			<p className="text-muted-foreground text-sm">
				{stage === "poner"
					? "Arrastrá el termómetro hasta la axila del paciente."
					: stage === "midiendo"
						? "Esperá a que suene, sin moverlo."
						: "¡Sonó! Leé la temperatura."}
			</p>

			<div className="relative">
				<svg
					viewBox="0 0 300 220"
					className="w-full text-primary"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					{/* Torso de frente */}
					<path
						d="M96 220 C 92 170, 96 120, 110 92 C 130 74, 170 74, 190 92 C 204 120, 208 170, 204 220"
						fill="color-mix(in oklch, var(--sky) 55%, var(--card))"
					/>
					<path d="M136 80 C 140 92, 160 92, 164 80" />
					{/* Brazo derecho del paciente, al costado */}
					<path
						d="M110 96 C 96 130, 92 170, 96 210"
						fill="none"
						strokeWidth="2"
					/>
					{/* Brazo izquierdo del paciente: levantado o abajo */}
					<path
						d={
							armUp
								? "M190 92 C 222 80, 250 62, 272 40 C 278 34, 288 42, 282 50 C 262 74, 232 96, 198 112"
								: "M190 96 C 204 130, 208 170, 204 210"
						}
						fill="color-mix(in oklch, var(--clay) 55%, var(--card))"
						style={{ transition: "d 500ms ease-out" }}
					/>
					{/* Termómetro puesto */}
					{stage !== "poner" && (
						<g transform="rotate(-35 200 112)">
							<rect
								x="170"
								y="106"
								width="48"
								height="12"
								rx="6"
								fill="var(--card)"
							/>
							<rect
								x="176"
								y="109"
								width="18"
								height="6"
								rx="1.5"
								fill="color-mix(in oklch, var(--foreground) 80%, var(--card))"
								stroke="none"
							/>
						</g>
					)}
				</svg>

				{/* La axila: donde se suelta el termómetro */}
				{stage === "poner" && (
					<button
						type="button"
						ref={armpit}
						onClick={() => picked && void place()}
						aria-label="Axila del paciente: poner acá el termómetro"
						className="absolute top-[40%] left-[60%] size-[16%] rounded-full border-2 border-pen border-dashed bg-pen/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					/>
				)}

				{/* La pantalla del termómetro */}
				<div className="absolute top-[6%] left-[4%] grid justify-items-center gap-1">
					<span
						className={`rounded-md border-2 border-foreground/70 bg-[color-mix(in_oklch,var(--sage)_40%,var(--card))] px-2 py-0.5 font-mono text-2xl tabular-nums ${stage === "listo" ? "text-pen" : ""}`}
						aria-live={stage === "listo" ? "polite" : "off"}
					>
						{display} °C
					</span>
					{stage === "midiendo" && (
						<span className="h-1 w-full overflow-hidden rounded-full bg-muted">
							<span
								className="block h-full bg-primary"
								style={{ width: `${progress * 100}%` }}
							/>
						</span>
					)}
				</div>
			</div>

			{stage === "poner" && (
				<div className="flex items-center gap-3">
					<button
						type="button"
						onPointerDown={startDrag}
						onPointerMove={moveDrag}
						onPointerUp={endDrag}
						onClick={() => setPicked(true)}
						aria-pressed={picked}
						aria-label="Termómetro digital: arrastralo o tocalo y después tocá la axila"
						className={`flex h-10 w-32 touch-none select-none items-center gap-2 rounded-full border-2 px-3 ${
							picked
								? "border-primary bg-secondary"
								: "border-foreground/40 bg-card"
						}`}
					>
						<span className="h-3 w-10 rounded-sm bg-foreground/70" />
						<span className="font-medium text-xs">termómetro</span>
					</button>
					<span className="text-muted-foreground text-xs">
						{picked ? "Ahora tocá la axila." : ""}
					</span>
				</div>
			)}

			<div className="flex gap-2">
				<Button variant="outline" onClick={close}>
					{stage === "listo" ? "Sacar el termómetro" : "Cancelar"}
				</Button>
			</div>

			{drag && (
				<div
					className="pointer-events-none fixed z-50 h-3 w-14 rounded-full border border-foreground/50 bg-card"
					style={{ left: drag.x - 28, top: drag.y - 6 }}
				/>
			)}
		</div>
	);
}
