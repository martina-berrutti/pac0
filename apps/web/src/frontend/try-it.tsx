"use client";

// "Probalo vos" en el inicio: tomarle la temperatura o la presión a la
// paciente del clip, con el mouse o el dedo y directo sobre el avatar 3D.
// Usa valores de ejemplo y no llama al servidor (no se guarda nada).
//
// Temperatura: se arrastra el termómetro a la axila y se lo sostiene hasta
// que suena. Presión: se arrastra el manguito al brazo, se infla con la
// rueda del mouse o dos dedos en el touchpad, se gira la válvula para
// desinflar despacio y se marca cuándo empiezan y terminan los ruidos.
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PatientAvatarHandle } from "@/components/avatar/patient-avatar";
import type { ExamPoint } from "@/lib/avatar/exam-poses";
import {
	MAX_MMHG,
	needleAngle,
	TOO_FAST_PER_S,
	VALVE_MAX_DEG,
	valveRate,
	wheelPump,
} from "@/lib/exam/manometer";

export type TryMode = "temperatura" | "presion";

// Valores de ejemplo de la paciente del clip.
const TEMP_C = 38.4;
const PAS = 118;
const PAD = 76;
const PULSE = 72;
// Lo que hay que sostener el termómetro (acortado).
const HOLD_MS = 3000;
// Qué tan cerca hay que soltar (px).
const DROP_RADIUS = 70;
// Margen para dar por bien marcada una lectura.
const TOLERANCE = 6;

type Drag = { x: number; y: number } | null;

let audioCtx: AudioContext | null = null;
function audio() {
	audioCtx ??= new AudioContext();
	return audioCtx;
}

function tone(freq: number, at: number, length: number, volume: number) {
	const ctx = audio();
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.frequency.value = freq;
	const t = ctx.currentTime + at;
	gain.gain.setValueAtTime(0.0001, t);
	gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
	gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
	osc.connect(gain).connect(ctx.destination);
	osc.start(t);
	osc.stop(t + length + 0.01);
}

const beep = () => {
	for (const at of [0, 0.18, 0.36]) tone(3100, at, 0.1, 0.12);
};
const thump = () => tone(55, 0, 0.12, 0.6);

// Sigue en pantalla la axila o el brazo del avatar.
function useAnchor(
	avatar: RefObject<PatientAvatarHandle | null>,
	part: ExamPoint,
) {
	const [p, setP] = useState<{ x: number; y: number } | null>(null);
	useEffect(() => {
		let frame = 0;
		let last = { x: -1, y: -1 };
		const loop = () => {
			const next = avatar.current?.point(part);
			if (
				next &&
				(Math.abs(next.x - last.x) > 1 || Math.abs(next.y - last.y) > 1)
			) {
				last = next;
				setP(next);
			}
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	}, [avatar, part]);
	return p;
}

function near(a: { x: number; y: number } | null, b: Drag, box: DOMRect) {
	if (!a || !b) return false;
	return Math.hypot(b.x - box.left - a.x, b.y - box.top - a.y) < DROP_RADIUS;
}

function Hint({ children }: { children: React.ReactNode }) {
	return (
		<p
			className="absolute top-3 left-1/2 w-[min(92%,26rem)] -translate-x-1/2 rounded-xl bg-card/95 px-3 py-2 text-center text-sm shadow"
			aria-live="polite"
		>
			{children}
		</p>
	);
}

// Bandeja con el instrumento, abajo a la izquierda, para arrastrar.
function Tray({
	label,
	children,
	onStart,
	onMove,
	onEnd,
}: {
	label: string;
	children: React.ReactNode;
	onStart: (e: React.PointerEvent) => void;
	onMove: (e: React.PointerEvent) => void;
	onEnd: (e: React.PointerEvent) => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onPointerDown={onStart}
			onPointerMove={onMove}
			onPointerUp={onEnd}
			className="absolute bottom-3 left-3 grid touch-none select-none justify-items-center gap-1 rounded-2xl border-2 border-foreground/50 border-dashed bg-card/95 px-4 py-2 shadow"
		>
			{children}
			<span className="font-hand text-lg leading-none">{label}</span>
		</button>
	);
}

function Thermometer({ className = "" }: { className?: string }) {
	return (
		<span
			className={`relative block h-3.5 w-16 rounded-full border-2 border-foreground/70 bg-card ${className}`}
		>
			<span className="absolute top-[2px] left-1.5 h-1.5 w-6 rounded-sm bg-[color-mix(in_oklch,var(--foreground)_75%,var(--card))]" />
		</span>
	);
}

function Cuff({ className = "" }: { className?: string }) {
	return (
		<span
			className={`block h-7 w-16 rounded-md border-2 border-foreground/60 ${className}`}
			style={{
				background: "color-mix(in oklch, var(--sky) 45%, var(--primary) 25%)",
			}}
		/>
	);
}

function Result({
	title,
	children,
	onAgain,
	onOther,
	otherLabel,
}: {
	title: string;
	children: React.ReactNode;
	onAgain: () => void;
	onOther: () => void;
	otherLabel: string;
}) {
	return (
		<div className="absolute inset-x-3 bottom-3 grid gap-2 rounded-2xl border bg-card/95 p-4 shadow-lg sm:inset-x-auto sm:right-3 sm:w-80">
			<p className="font-display text-xl">{title}</p>
			<div className="text-sm">{children}</div>
			<div className="flex flex-wrap gap-2 pt-1">
				<button
					type="button"
					onClick={onAgain}
					className="rounded-[0.7rem] border px-3 py-1.5 font-semibold text-sm hover:bg-muted"
				>
					Otra vez
				</button>
				<button
					type="button"
					onClick={onOther}
					className="rounded-[0.7rem] bg-primary px-3 py-1.5 font-semibold text-primary-foreground text-sm"
				>
					{otherLabel}
				</button>
			</div>
		</div>
	);
}

// ── Temperatura ─────────────────────────────────────────────────────────

function TryTemperature({
	avatar,
	onOther,
}: {
	avatar: RefObject<PatientAvatarHandle | null>;
	onOther: () => void;
}) {
	const box = useRef<HTMLDivElement>(null);
	const armpit = useAnchor(avatar, "axila");
	const [stage, setStage] = useState<"poner" | "sostener" | "listo">("poner");
	const [drag, setDrag] = useState<Drag>(null);
	const [held, setHeld] = useState(0);
	const [holding, setHolding] = useState(false);
	const [slipped, setSlipped] = useState(false);

	const reset = useCallback(() => {
		setStage("poner");
		setHeld(0);
		setHolding(false);
		avatar.current?.exam({ kind: "temperatura", step: "levantar" });
	}, [avatar]);

	useEffect(() => {
		reset();
		return () => avatar.current?.exam(null);
	}, [reset, avatar]);

	// Mientras se sostiene, avanza; si se suelta antes, se cae.
	useEffect(() => {
		if (stage !== "sostener" || !holding) return;
		let frame = 0;
		let last = performance.now();
		const loop = (now: number) => {
			// El intervalo se calcula antes: el actualizador corre más tarde.
			const dt = now - last;
			last = now;
			setHeld((h) => Math.min(HOLD_MS, h + dt));
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	}, [stage, holding]);

	useEffect(() => {
		if (stage === "sostener" && held >= HOLD_MS) {
			beep();
			setHolding(false);
			setStage("listo");
		}
	}, [stage, held]);

	function release() {
		if (stage === "sostener" && holding && held < HOLD_MS) {
			setSlipped(true);
			reset();
		}
		setHolding(false);
	}

	const progress = held / HOLD_MS;
	const shown = 35.2 + (TEMP_C - 35.2) * (1 - (1 - progress) ** 3);

	return (
		<div ref={box} className="absolute inset-0">
			<Hint>
				{stage === "poner"
					? slipped
						? "Se te movió y hubo que sacarlo. Ponelo de nuevo en la axila."
						: "Arrastrá el termómetro hasta la axila de Lucía."
					: stage === "sostener"
						? "Mantené apretado sobre el termómetro hasta que suene."
						: "¡Sonó!"}
			</Hint>

			{/* Destino: la axila */}
			{armpit && stage === "poner" && (
				<span
					aria-hidden="true"
					className={`absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-pen border-dashed transition-colors ${
						drag &&
						box.current &&
						near(armpit, drag, box.current.getBoundingClientRect())
							? "bg-pen/25"
							: "bg-pen/10"
					}`}
					style={{ left: armpit.x, top: armpit.y }}
				/>
			)}

			{/* Sostener: un anillo que se llena */}
			{armpit && stage === "sostener" && (
				<button
					type="button"
					aria-label="Sostener el termómetro"
					onPointerDown={(e) => {
						(e.target as HTMLElement).setPointerCapture(e.pointerId);
						setSlipped(false);
						setHolding(true);
					}}
					onPointerUp={release}
					onPointerCancel={release}
					className="absolute grid size-24 -translate-x-1/2 -translate-y-1/2 touch-none select-none place-items-center rounded-full"
					style={{
						left: armpit.x,
						top: armpit.y,
						background: `conic-gradient(var(--pen) ${progress * 360}deg, color-mix(in oklch, var(--card) 70%, transparent) 0)`,
					}}
				>
					<span className="grid size-[4.6rem] place-items-center rounded-full bg-card font-mono text-sm tabular-nums">
						{holding || held > 0
							? `${shown.toFixed(1).replace(".", ",")}°`
							: "apretá"}
					</span>
				</button>
			)}

			{stage === "poner" && (
				<Tray
					label="termómetro"
					onStart={(e) => {
						(e.target as HTMLElement).setPointerCapture(e.pointerId);
						audio();
						setDrag({ x: e.clientX, y: e.clientY });
					}}
					onMove={(e) => drag && setDrag({ x: e.clientX, y: e.clientY })}
					onEnd={() => {
						const r = box.current?.getBoundingClientRect();
						if (r && near(armpit, drag, r)) {
							avatar.current?.exam({ kind: "temperatura", step: "midiendo" });
							setStage("sostener");
						}
						setDrag(null);
					}}
				>
					<Thermometer />
				</Tray>
			)}

			{drag && (
				<div
					className="pointer-events-none fixed z-50"
					style={{ left: drag.x - 32, top: drag.y - 7 }}
				>
					<Thermometer className="rotate-[-25deg] shadow-lg" />
				</div>
			)}

			{stage === "listo" && (
				<Result
					title={`${TEMP_C.toFixed(1).replace(".", ",")} °C: tiene fiebre`}
					onAgain={reset}
					onOther={onOther}
					otherLabel="Tomale la presión"
				>
					En un dolor de garganta, la fiebre es un dato clave. En la consulta,
					la temperatura es la del caso y queda en tu informe.
				</Result>
			)}
		</div>
	);
}

// ── Presión ─────────────────────────────────────────────────────────────

type BpStage = "manguito" | "inflar" | "listo";

function TryPressure({
	avatar,
	onOther,
}: {
	avatar: RefObject<PatientAvatarHandle | null>;
	onOther: () => void;
}) {
	const box = useRef<HTMLDivElement>(null);
	const arm = useAnchor(avatar, "brazo");
	const [stage, setStage] = useState<BpStage>("manguito");
	const [drag, setDrag] = useState<Drag>(null);
	const pressure = useRef(0);
	const valve = useRef(0);
	const lastPump = useRef(0);
	const lastBeat = useRef(0);
	const lastSent = useRef(-1);
	const [shown, setShown] = useState(0);
	const [valveDeg, setValveDeg] = useState(0);
	const [beat, setBeat] = useState(false);
	const [marks, setMarks] = useState<number[]>([]);
	const [tooFast, setTooFast] = useState(false);
	const knob = useRef<HTMLButtonElement>(null);
	// En pantallas táctiles no hay rueda: se infla con la pera.
	const [touch, setTouch] = useState(false);
	useEffect(() => {
		setTouch(window.matchMedia("(pointer: coarse)").matches);
	}, []);
	const turning = useRef<number | null>(null);

	const reset = useCallback(() => {
		pressure.current = 0;
		valve.current = 0;
		lastSent.current = -1;
		setValveDeg(0);
		setShown(0);
		setMarks([]);
		setTooFast(false);
		setStage("manguito");
		avatar.current?.exam(null);
		// Plano medio: tiene que verse el brazo para ponerle el manguito.
		avatar.current?.run({ kind: "view", view: "mid" });
	}, [avatar]);

	useEffect(() => {
		reset();
		return () => avatar.current?.exam(null);
	}, [reset, avatar]);

	// La física: baja según la válvula; los ruidos suenan entre PAS y PAD.
	useEffect(() => {
		if (stage !== "inflar") return;
		let frame = 0;
		let last = performance.now();
		const loop = (now: number) => {
			const dt = (now - last) / 1000;
			last = now;
			const rate = valveRate(valve.current);
			const p = Math.max(0, pressure.current - rate * dt);
			pressure.current = p;
			if (rate > TOO_FAST_PER_S && p > PAD - 15 && p < PAS + 30) {
				setTooFast(true);
				valve.current = 0;
				setValveDeg(0);
			}
			if (
				p <= PAS &&
				p >= PAD &&
				now - lastPump.current > 400 &&
				now - lastBeat.current > 60_000 / PULSE
			) {
				lastBeat.current = now;
				thump();
				setBeat(true);
				setTimeout(() => setBeat(false), 140);
			}
			const rounded = Math.round(p / 2) * 2;
			setShown(rounded);
			if (Math.abs(rounded - lastSent.current) >= 2) {
				lastSent.current = rounded;
				avatar.current?.exam({ kind: "presion", mmHg: rounded });
			}
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	}, [stage, avatar]);

	// Rueda del mouse o dos dedos en el touchpad: infla. (No pasivo: si no,
	// la página se desplaza.)
	useEffect(() => {
		const el = box.current;
		if (!el || stage !== "inflar") return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			audio();
			pressure.current = wheelPump(pressure.current, e.deltaY);
			lastPump.current = performance.now();
			setTooFast(false);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [stage]);

	// Girar la válvula: arrastrar en círculo alrededor de la perilla.
	function angleAt(e: React.PointerEvent) {
		const r = knob.current?.getBoundingClientRect();
		if (!r) return 0;
		return (
			(Math.atan2(
				e.clientY - (r.top + r.height / 2),
				e.clientX - (r.left + r.width / 2),
			) *
				180) /
			Math.PI
		);
	}
	function turn(e: React.PointerEvent) {
		if (turning.current === null) return;
		const a = angleAt(e);
		let d = a - turning.current;
		if (d > 180) d -= 360;
		if (d < -180) d += 360;
		turning.current = a;
		valve.current = Math.min(VALVE_MAX_DEG, Math.max(0, valve.current + d));
		setValveDeg(valve.current);
	}

	function mark() {
		const value = Math.round(pressure.current / 2) * 2;
		const next = [...marks, value];
		setMarks(next);
		if (next.length === 2) {
			setStage("listo");
			avatar.current?.exam({ kind: "presion", mmHg: 0 });
		}
	}

	const pas = marks[0];
	const pad = marks[1];
	const good =
		pas !== undefined &&
		pad !== undefined &&
		Math.abs(pas - PAS) <= TOLERANCE &&
		Math.abs(pad - PAD) <= TOLERANCE;

	return (
		<div ref={box} className="absolute inset-0 touch-none">
			<Hint>
				{stage === "listo"
					? "¡Listo! Mirá cómo te fue."
					: stage === "manguito"
						? "Arrastrá el manguito hasta el brazo de Lucía."
						: tooFast
							? "Desinflaste muy rápido: los ruidos pasan sin que los escuches. Volvé a inflar y abrí apenas la válvula."
							: shown < 150 && valveDeg === 0
								? touch
									? "Apretá la pera varias veces, hasta pasar 150."
									: "Inflá con la rueda del mouse o deslizando dos dedos en el touchpad, hasta pasar 150."
								: valveDeg === 0
									? "Ahora girá la válvula de a poco, arrastrando en círculo."
									: marks.length === 0
										? "Escuchá: tocá «¡Lo escuché!» con el primer latido."
										: "Ahora tocá cuando dejes de escucharlo."}
			</Hint>

			{/* Destino: el brazo */}
			{arm && stage === "manguito" && (
				<span
					aria-hidden="true"
					className={`absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-pen border-dashed ${
						drag &&
						box.current &&
						near(arm, drag, box.current.getBoundingClientRect())
							? "bg-pen/25"
							: "bg-pen/10"
					}`}
					style={{ left: arm.x, top: arm.y }}
				/>
			)}

			{/* El latido, sobre el pliegue del codo */}
			{arm && stage === "inflar" && (
				<span
					aria-hidden="true"
					className={`absolute font-hand text-2xl text-pen transition-opacity ${beat ? "opacity-100" : "opacity-0"}`}
					style={{ left: arm.x + 30, top: arm.y + 10 }}
				>
					tum
				</span>
			)}

			{stage === "manguito" && (
				<Tray
					label="manguito"
					onStart={(e) => {
						(e.target as HTMLElement).setPointerCapture(e.pointerId);
						audio();
						setDrag({ x: e.clientX, y: e.clientY });
					}}
					onMove={(e) => drag && setDrag({ x: e.clientX, y: e.clientY })}
					onEnd={() => {
						const r = box.current?.getBoundingClientRect();
						if (r && near(arm, drag, r)) {
							avatar.current?.exam({ kind: "presion", mmHg: 0 });
							setStage("inflar");
						}
						setDrag(null);
					}}
				>
					<Cuff />
				</Tray>
			)}

			{drag && (
				<div
					className="pointer-events-none fixed z-50"
					style={{ left: drag.x - 32, top: drag.y - 14 }}
				>
					<Cuff className="shadow-lg" />
				</div>
			)}

			{stage !== "manguito" && (
				<>
					{/* Manómetro */}
					<svg
						viewBox="0 0 100 100"
						className="absolute top-20 left-2 size-16 text-foreground sm:top-16 sm:left-3 sm:size-28"
						aria-label={`Manómetro: ${shown} mmHg`}
						role="img"
					>
						<circle
							cx="50"
							cy="50"
							r="46"
							fill="var(--card)"
							stroke="currentColor"
							strokeWidth="3"
						/>
						{Array.from({ length: 16 }, (_, i) => i * 20).map((v) => {
							const a = ((needleAngle(v) - 90) * Math.PI) / 180;
							const long = v % 60 === 0;
							return (
								<path
									key={v}
									d={`M${50 + Math.cos(a) * (long ? 32 : 36)} ${50 + Math.sin(a) * (long ? 32 : 36)} L ${50 + Math.cos(a) * 41} ${50 + Math.sin(a) * 41}`}
									stroke="currentColor"
									strokeWidth={long ? 2 : 1}
								/>
							);
						})}
						<path
							d="M50 50 L 50 14"
							stroke="var(--pen)"
							strokeWidth="3"
							strokeLinecap="round"
							transform={`rotate(${needleAngle(shown)} 50 50)`}
						/>
						<circle cx="50" cy="50" r="3.5" fill="var(--pen)" />
						<text
							x="50"
							y="76"
							textAnchor="middle"
							fontSize="11"
							fill="currentColor"
						>
							{shown}
						</text>
					</svg>

					{stage === "inflar" && (
						<>
							{/* Válvula para girar */}
							<div className="absolute right-3 bottom-3 grid justify-items-center gap-1">
								<button
									ref={knob}
									type="button"
									aria-label={`Válvula: arrastrá en círculo para abrirla (${Math.round(valveDeg)}°)`}
									onPointerDown={(e) => {
										(e.target as HTMLElement).setPointerCapture(e.pointerId);
										turning.current = angleAt(e);
									}}
									onPointerMove={turn}
									onPointerUp={() => {
										turning.current = null;
									}}
									onKeyDown={(e) => {
										// Alternativa sin mouse: flechas.
										if (e.key === "ArrowRight" || e.key === "ArrowUp")
											valve.current = Math.min(
												VALVE_MAX_DEG,
												valve.current + 10,
											);
										if (e.key === "ArrowLeft" || e.key === "ArrowDown")
											valve.current = Math.max(0, valve.current - 10);
										setValveDeg(valve.current);
									}}
									className="relative size-14 touch-none select-none rounded-full border-2 border-foreground/70 bg-card shadow sm:size-20"
								>
									<span
										className="absolute inset-0"
										style={{ transform: `rotate(${valveDeg}deg)` }}
									>
										<span className="absolute top-1.5 left-1/2 h-6 w-1.5 -translate-x-1/2 rounded-full bg-pen" />
									</span>
								</button>
								<span className="rounded bg-card/90 px-1.5 font-hand text-lg leading-none">
									válvula
								</span>
							</div>

							{/* Pera, para quien no tiene rueda (pantallas táctiles) */}
							<button
								type="button"
								onClick={() => {
									audio();
									pressure.current = Math.min(MAX_MMHG, pressure.current + 18);
									lastPump.current = performance.now();
									setTooFast(false);
								}}
								className="absolute bottom-3 left-3 rounded-full border-2 border-foreground/50 bg-card/95 px-3 py-2 font-hand text-lg shadow"
							>
								apretar la pera
							</button>

							{valveDeg > 0 && (
								<button
									type="button"
									onClick={mark}
									className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-[0.7rem] border-black/25 border-b-[3px] bg-primary px-4 py-2 font-semibold text-primary-foreground shadow"
								>
									¡Lo escuché!
									{marks[0] !== undefined && (
										<span className="ml-2 font-hand text-lg">{marks[0]}/…</span>
									)}
								</button>
							)}
						</>
					)}
				</>
			)}

			{stage === "listo" && pas !== undefined && pad !== undefined && (
				<Result
					title={good ? `${pas}/${pad}: ¡muy bien!` : `${pas}/${pad}: casi`}
					onAgain={reset}
					onOther={onOther}
					otherLabel="Tomale la temperatura"
				>
					{good
						? `Coincide con la presión de Lucía (${PAS}/${PAD}). En la consulta, además, cuenta cómo preparás a la paciente.`
						: `La de Lucía era ${PAS}/${PAD}. La sistólica es el primer latido y la diastólica cuando dejás de oírlo: desinflá de 2 a 3 mmHg por segundo.`}
				</Result>
			)}
		</div>
	);
}

export function TryIt({
	mode,
	avatar,
	onMode,
}: {
	mode: TryMode;
	avatar: RefObject<PatientAvatarHandle | null>;
	onMode: (mode: TryMode) => void;
}) {
	return mode === "temperatura" ? (
		<TryTemperature avatar={avatar} onOther={() => onMode("presion")} />
	) : (
		<TryPressure avatar={avatar} onOther={() => onMode("temperatura")} />
	);
}
