"use client";

// "Probalo vos" en el inicio: tomarle la temperatura o la presión a la
// paciente del clip, con el mouse o el dedo y directo sobre el avatar 3D.
// Usa valores de ejemplo y no llama al servidor (no se guarda nada).
//
// Temperatura: se arrastra el termómetro a la axila y los grados suben solos. Presión: se arrastra el manguito al brazo, se infla con la
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
// Lo que tardan en subir los grados (acortado).
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
			className="absolute top-3 left-1/2 w-[min(92%,26rem)] -translate-x-1/2 rounded-full border border-foreground/10 bg-card px-4 py-2 text-center font-sans font-semibold text-foreground text-sm shadow-md"
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
			className="absolute bottom-3 left-3 grid touch-none select-none justify-items-center gap-1 rounded-2xl border border-foreground/10 bg-card px-4 py-2.5 shadow-md"
		>
			{children}
			<span className="font-hand text-lg leading-none">{label}</span>
		</button>
	);
}

// Termómetro digital: cuerpo blanco, pantallita oscura y punta metálica.
function Thermometer({ className = "" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 96 24"
			className={`h-6 w-24 ${className}`}
			role="img"
			aria-label="Termómetro digital"
		>
			<rect
				x="14"
				y="4"
				width="78"
				height="16"
				rx="8"
				fill="#fff"
				stroke="var(--foreground)"
				strokeOpacity="0.45"
				strokeWidth="1.2"
			/>
			<rect x="26" y="8" width="26" height="8" rx="2" fill="#2f3438" />
			<circle cx="82" cy="12" r="2.6" fill="var(--sage)" />
			<path
				d="M2 12 L14 8.5 L14 15.5 Z"
				fill="#aeb4b9"
				stroke="var(--foreground)"
				strokeOpacity="0.45"
				strokeWidth="1"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// Manguito: tela azul grisácea con abrojo.
function Cuff({ className = "" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 80 40"
			className={`h-10 w-20 ${className}`}
			role="img"
			aria-label="Manguito"
		>
			<rect
				x="3"
				y="5"
				width="74"
				height="30"
				rx="6"
				fill="color-mix(in oklch, var(--sky) 55%, var(--foreground) 22%)"
				stroke="var(--foreground)"
				strokeOpacity="0.4"
				strokeWidth="1.2"
			/>
			<rect
				x="46"
				y="10"
				width="26"
				height="20"
				rx="3"
				fill="color-mix(in oklch, var(--sky) 30%, #fff 55%)"
			/>
			{[0, 1, 2, 3].map((i) => (
				<path
					key={i}
					d={`M${51 + i * 5} 13 V27`}
					stroke="var(--foreground)"
					strokeOpacity="0.25"
					strokeWidth="1"
				/>
			))}
			<circle
				cx="14"
				cy="20"
				r="3"
				fill="var(--foreground)"
				fillOpacity="0.55"
			/>
		</svg>
	);
}

function Result({
	title,
	children,
	onAgain,
}: {
	title: string;
	children: React.ReactNode;
	onAgain: () => void;
}) {
	return (
		<div className="absolute inset-x-3 bottom-3 grid gap-2 rounded-2xl border border-foreground/10 bg-card p-4 shadow-lg sm:inset-x-auto sm:right-3 sm:w-80">
			<p className="font-display text-xl">{title}</p>
			<div className="text-sm">{children}</div>
			<button
				type="button"
				onClick={onAgain}
				className="justify-self-start text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
			>
				Otra vez
			</button>
		</div>
	);
}

// ── Temperatura ─────────────────────────────────────────────────────────

function TryTemperature({
	avatar,
}: {
	avatar: RefObject<PatientAvatarHandle | null>;
}) {
	const box = useRef<HTMLDivElement>(null);
	const armpit = useAnchor(avatar, "axila");
	const [stage, setStage] = useState<"poner" | "midiendo" | "listo">("poner");
	const [drag, setDrag] = useState<Drag>(null);
	const [elapsed, setElapsed] = useState(0);

	const reset = useCallback(() => {
		setStage("poner");
		setElapsed(0);
		avatar.current?.exam({ kind: "temperatura", step: "levantar" });
	}, [avatar]);

	useEffect(() => {
		reset();
		return () => avatar.current?.exam(null);
	}, [reset, avatar]);

	// Los grados suben solos y al final suena.
	useEffect(() => {
		if (stage !== "midiendo") return;
		let frame = 0;
		const start = performance.now();
		const loop = (now: number) => {
			const t = Math.min(HOLD_MS, now - start);
			setElapsed(t);
			if (t >= HOLD_MS) {
				beep();
				setStage("listo");
				return;
			}
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	}, [stage]);

	const progress = elapsed / HOLD_MS;
	const shown = 35.2 + (TEMP_C - 35.2) * (1 - (1 - progress) ** 3);

	return (
		<div ref={box} className="absolute inset-0">
			<Hint>
				{stage === "poner"
					? "Agarrá el termómetro y ponelo en la axila."
					: stage === "midiendo"
						? "Midiendo…"
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

			{/* Los grados, al lado de la axila */}
			{armpit && stage !== "poner" && (
				<span
					className="absolute rounded-lg border border-foreground/10 bg-card px-2 py-0.5 font-mono text-sm tabular-nums shadow-md"
					style={{ left: armpit.x + 26, top: armpit.y - 14 }}
				>
					{shown.toFixed(1).replace(".", ",")}°
				</span>
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
							setStage("midiendo");
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
					style={{ left: drag.x - 48, top: drag.y - 12 }}
				>
					<Thermometer className="rotate-[-25deg] drop-shadow-lg" />
				</div>
			)}

			{stage === "listo" && (
				<Result
					title={`${TEMP_C.toFixed(1).replace(".", ",")} °C: tiene fiebre`}
					onAgain={reset}
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
}: {
	avatar: RefObject<PatientAvatarHandle | null>;
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
						? "1. Poné el manguito en el brazo."
						: tooFast
							? "Desinflaste muy rápido: inflá de nuevo y abrí apenas la válvula."
							: shown < 150 && valveDeg === 0
								? touch
									? "2. Apretá la pera hasta pasar 150."
									: "2. Inflá con la rueda o dos dedos hasta pasar 150."
								: valveDeg === 0
									? "3. Girá la válvula despacio, en círculo."
									: "4. Tocá «¡Lo escuché!» con el primer latido… y cuando deje de sonar."}
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
					style={{ left: drag.x - 40, top: drag.y - 20 }}
				>
					<Cuff className="drop-shadow-lg" />
				</div>
			)}

			{stage !== "manguito" && (
				<>
					{/* Manómetro */}
					<svg
						viewBox="0 0 100 100"
						className="absolute top-20 left-2 size-16 text-foreground drop-shadow-md sm:top-16 sm:left-3 sm:size-28"
						aria-label={`Manómetro: ${shown} mmHg`}
						role="img"
					>
						<circle
							cx="50"
							cy="50"
							r="46"
							fill="var(--card)"
							stroke="currentColor"
							strokeOpacity="0.5"
							strokeWidth="1.5"
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
									className="relative size-14 touch-none select-none rounded-full border border-foreground/30 bg-card shadow-md sm:size-20"
								>
									<span
										className="absolute inset-0"
										style={{ transform: `rotate(${valveDeg}deg)` }}
									>
										<span className="absolute top-1.5 left-1/2 h-6 w-1.5 -translate-x-1/2 rounded-full bg-pen" />
									</span>
								</button>
								<span className="rounded-full bg-card px-2 py-0.5 font-hand text-lg leading-none shadow-sm">
									válvula
								</span>
							</div>

							{/* Pera, para quien no tiene rueda (pantallas táctiles) */}
							{touch && (
								<button
									type="button"
									onClick={() => {
										audio();
										pressure.current = Math.min(
											MAX_MMHG,
											pressure.current + 18,
										);
										lastPump.current = performance.now();
										setTooFast(false);
									}}
									className="absolute bottom-3 left-3 rounded-full border border-foreground/10 bg-card px-3 py-2 font-hand text-lg shadow-md"
								>
									apretar la pera
								</button>
							)}

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
}: {
	mode: TryMode;
	avatar: RefObject<PatientAvatarHandle | null>;
}) {
	return mode === "temperatura" ? (
		<TryTemperature avatar={avatar} />
	) : (
		<TryPressure avatar={avatar} />
	);
}
