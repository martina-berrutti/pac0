"use client";

// Tensiómetro virtual (plan.md, sección 6, afiche HC-01), todo con el mouse o
// el dedo. Se elige el manguito y se lo arrastra al brazo; después se aprieta
// la pera para inflar, se abre apenas la válvula para que baje despacio y se
// escucha con el estetoscopio. Los ruidos (sintetizados, no son una grabación
// clínica) suenan entre la PAS y la PAD que marca el manómetro; lo que marca
// lo decide el servidor. La física está en lib/exam/manometer.ts.
import { Button } from "@pac0/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api-client";
import type { BpReading, CuffSize } from "@/lib/contracts/exam";
import {
	audible,
	leak,
	NEXT_VALVE,
	needleAngle,
	pump,
	type Valve,
} from "@/lib/exam/manometer";
import type { BpStart } from "@/server/vitals";

const CUFFS: { size: CuffSize; label: string; range: string; w: number }[] = [
	{ size: "chico", label: "Chico", range: "17 a 22 cm", w: 56 },
	{ size: "adecuado", label: "Adulto", range: "22 a 32 cm", w: 72 },
	{ size: "grande", label: "Grande", range: "32 a 42 cm", w: 88 },
];

const VALVE_LABEL: Record<Valve, string> = {
	cerrada: "válvula cerrada",
	poco: "válvula abierta apenas",
	abierta: "válvula abierta del todo",
};
const VALVE_ANGLE: Record<Valve, number> = {
	cerrada: 0,
	poco: 50,
	abierta: 120,
};

type Stage = "cargando" | "colocar" | "medir" | "guardando";

const SKIN = "color-mix(in oklch, var(--clay) 55%, var(--card))";
const SLEEVE = "color-mix(in oklch, var(--sky) 80%, var(--foreground) 10%)";
const CUFF = "color-mix(in oklch, var(--sky) 45%, var(--primary) 25%)";

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

// El brazo dibujado, de costado. Con manga, si no se arremangó.
function ArmDrawing({
	sleeve,
	children,
}: {
	sleeve: boolean;
	children?: React.ReactNode;
}) {
	return (
		<>
			{/* Brazo de costado: grueso arriba, más fino al codo, antebrazo y mano */}
			<path
				d="M0 146 C 90 143, 180 148, 246 156 C 290 162, 330 165, 366 167 C 378 164, 392 165, 398 171 L 399 186 C 392 192, 380 190, 366 188 C 330 192, 290 194, 246 196 C 180 202, 90 206, 0 208 Z"
				fill={SKIN}
			/>
			{/* Dedos insinuados y pulgar */}
			<path
				d="M384 168 L 386 188 M391 169 L 393 187 M372 189 C 376 197, 384 199, 390 195"
				strokeWidth="1.4"
				opacity="0.6"
			/>
			{/* Pliegue del codo */}
			<path d="M246 166 C 251 174, 251 182, 246 190" strokeWidth="1.8" />
			{sleeve ? (
				<>
					{/* Manga de remera holgada, con dobladillo */}
					<path
						d="M0 132 C 80 130, 160 134, 214 140 C 228 160, 228 196, 214 216 C 150 214, 70 216, 0 220 Z"
						fill={SLEEVE}
					/>
					<path d="M214 140 C 228 160, 228 196, 214 216" strokeWidth="3" />
					<path
						d="M205 142 C 218 162, 218 196, 205 214"
						strokeWidth="1"
						opacity="0.5"
					/>
				</>
			) : (
				// Rollito de tela arriba, cerca del hombro
				<>
					<rect x="4" y="134" width="40" height="80" rx="18" fill={SLEEVE} />
					<path
						d="M24 138 C 30 160, 30 190, 24 210"
						strokeWidth="1.2"
						opacity="0.5"
					/>
				</>
			)}
			{children}
		</>
	);
}

export function TensiometroView({
	sessionId,
	start,
	onPressure,
	onClose,
}: {
	sessionId: string;
	// Medición que ya creó medir_presion (voz); sin ella, se crea al abrir.
	start: BpStart | null;
	// La presión del manguito, para inflarlo también en el avatar.
	onPressure?: (mmHg: number) => void;
	onClose: () => void;
}) {
	const [stage, setStage] = useState<Stage>(start ? "colocar" : "cargando");
	const [measurementId, setMeasurementId] = useState<string | null>(
		start?.measurementId ?? null,
	);
	const [armCm, setArmCm] = useState<number | null>(start?.armCm ?? null);
	const [cuff, setCuff] = useState<CuffSize | null>(null);
	const [rolledUp, setRolledUp] = useState(false);
	// Mientras se coloca el manguito: sin doble clic.
	const [placing, setPlacing] = useState(false);
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
	const valveRef = useRef<Valve>("cerrada");
	const lastPump = useRef(0);
	const lastBeat = useRef(0);
	const lastSent = useRef(-1);
	const pressureListener = useRef(onPressure);
	pressureListener.current = onPressure;
	const audio = useRef<AudioContext | null>(null);
	const [valve, setValve] = useState<Valve>("cerrada");
	const [shown, setShown] = useState(0);
	const [beat, setBeat] = useState(false);
	const [squeezed, setSqueezed] = useState(false);
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
		if (!measurementId || !cuff || placing) return;
		setPlacing(true);
		// Uno solo por tensiómetro, aunque se reintente después de un error.
		audio.current ??= new AudioContext();
		try {
			const r = await api.placeCuff(sessionId, measurementId, cuff, !rolledUp);
			gauge.current = r.gauge;
			pulse.current = r.pulse;
			setStage("medir");
		} catch (e) {
			toast.error(
				e instanceof ApiError ? e.message : "No se pudo colocar el manguito.",
			);
		} finally {
			setPlacing(false);
		}
	}

	useEffect(() => {
		if (stage !== "medir") return;
		let frame = 0;
		let last = performance.now();
		const loop = (now: number) => {
			const dt = (now - last) / 1000;
			last = now;
			pressure.current = leak(pressure.current, valveRef.current, dt);
			const g = gauge.current;
			if (
				g &&
				audible(pressure.current, g, now - lastPump.current) &&
				now - lastBeat.current > 60_000 / pulse.current
			) {
				lastBeat.current = now;
				if (audio.current) thump(audio.current);
				setBeat(true);
				setTimeout(() => setBeat(false), 140);
			}
			const rounded = Math.round(pressure.current / 2) * 2;
			setShown(rounded);
			// Al avatar, solo cuando cambia (no en cada cuadro).
			if (Math.abs(rounded - lastSent.current) >= 2) {
				lastSent.current = rounded;
				pressureListener.current?.(rounded);
			}
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	}, [stage]);

	useEffect(() => () => void audio.current?.close(), []);

	function squeeze() {
		pressure.current = pump(pressure.current, valveRef.current);
		lastPump.current = performance.now();
		setSqueezed(true);
		setTimeout(() => setSqueezed(false), 160);
	}

	function turnValve() {
		const next = NEXT_VALVE[valveRef.current];
		valveRef.current = next;
		setValve(next);
	}

	function mark(which: "s" | "d") {
		const value = Math.round(pressure.current / 2) * 2;
		setMarked((m) => ({ ...m, [which]: value }));
	}

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

	const placedCuff = CUFFS.find((c) => c.size === cuff);

	if (stage === "colocar") {
		return (
			<div className="grid gap-4 rounded-2xl border bg-card p-4">
				<p className="text-sm">
					El brazo mide <strong>{armCm} cm</strong> de perímetro. Elegí el
					manguito y arrastralo hasta el brazo.
				</p>
				<div className="flex flex-wrap gap-3">
					{CUFFS.map((c) => (
						<button
							key={c.size}
							type="button"
							onPointerDown={(e) => startDrag(c.size, e)}
							onPointerMove={moveDrag}
							onPointerUp={endDrag}
							onClick={() => setPicked(c.size)}
							aria-pressed={picked === c.size}
							className={`grid touch-none select-none justify-items-center gap-1 rounded-xl border px-3 py-2 text-xs transition-colors ${
								picked === c.size
									? "border-primary bg-secondary"
									: "bg-background hover:bg-muted"
							}`}
						>
							<span
								aria-hidden="true"
								className="h-6 rounded-md border border-foreground/40"
								style={{ width: c.w, background: CUFF }}
							/>
							<span className="font-medium">{c.label}</span>
							<span className="text-muted-foreground">{c.range}</span>
						</button>
					))}
				</div>
				<button
					type="button"
					ref={arm}
					onClick={() => picked && setCuff(picked)}
					aria-label={
						placedCuff
							? `Brazo con el manguito ${placedCuff.label.toLowerCase()} ${rolledUp ? "sobre la piel" : "sobre la manga"}`
							: "Brazo: soltá acá el manguito"
					}
					className="relative overflow-hidden rounded-xl border-2 border-dashed bg-background"
				>
					<svg
						viewBox="0 70 400 160"
						className="w-full text-primary"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.2"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<ArmDrawing sleeve={!rolledUp}>
							{placedCuff && (
								<rect
									x={140 - placedCuff.w}
									y="140"
									width={placedCuff.w * 1.6}
									height="76"
									rx="10"
									fill={CUFF}
								/>
							)}
						</ArmDrawing>
					</svg>
					{!placedCuff && (
						<span className="absolute inset-x-0 top-2 text-muted-foreground text-xs">
							soltá el manguito acá
						</span>
					)}
				</button>
				<Button variant="outline" onClick={() => setRolledUp((r) => !r)}>
					{rolledUp ? "Bajar la manga" : "Arremangar"}
				</Button>
				<div className="flex gap-2">
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={startMeasuring} disabled={!cuff || placing}>
						Listo, a medir
					</Button>
				</div>
				{drag && (
					<div
						className="pointer-events-none fixed z-50 h-6 rounded-md border border-foreground/40"
						style={{
							left: drag.x - 30,
							top: drag.y - 12,
							width: CUFFS.find((c) => c.size === drag.size)?.w,
							background: CUFF,
						}}
					/>
				)}
			</div>
		);
	}

	// El manguito se hincha con la presión.
	const swell = (shown / 300) * 18;

	return (
		<div className="grid gap-4 rounded-2xl border bg-card p-4">
			<p className="text-muted-foreground text-sm">
				Apretá la pera varias veces para inflar. Después abrí apenas la válvula
				para que baje despacio, y escuchá.
			</p>

			<div className="relative">
				<svg
					viewBox="0 0 400 260"
					className="w-full text-primary"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<ArmDrawing sleeve={!rolledUp}>
						{/* Manguito */}
						<rect
							x="70"
							y={140 - swell / 2}
							width="120"
							height={76 + swell}
							rx="12"
							fill={CUFF}
						/>
						<path
							d="M84 150 L 84 206 M 96 150 L 96 206"
							strokeWidth="1.2"
							opacity="0.5"
						/>
					</ArmDrawing>

					{/* Tubos: manguito → manómetro y manguito → pera */}
					<path d="M110 140 C 108 118, 140 112, 158 104" />
					<path d="M160 140 C 180 104, 250 100, 300 96" />

					{/* Manómetro de aguja */}
					<circle
						cx="190"
						cy="70"
						r="52"
						fill="var(--card)"
						strokeWidth="2.6"
					/>
					{Array.from({ length: 16 }, (_, i) => i * 20).map((mmHg, i) => {
						const a = ((needleAngle(mmHg) - 90) * Math.PI) / 180;
						const long = i % 3 === 0;
						return (
							<path
								key={mmHg}
								d={`M${190 + Math.cos(a) * (long ? 38 : 42)} ${70 + Math.sin(a) * (long ? 38 : 42)} L ${190 + Math.cos(a) * 47} ${70 + Math.sin(a) * 47}`}
								strokeWidth={long ? 2 : 1.2}
							/>
						);
					})}
					{[0, 60, 120, 180, 240, 300].map((v) => {
						const a = ((needleAngle(v) - 90) * Math.PI) / 180;
						return (
							<text
								key={v}
								x={190 + Math.cos(a) * 28}
								y={70 + Math.sin(a) * 28 + 3}
								textAnchor="middle"
								fontSize="8"
								fill="var(--muted-foreground)"
								stroke="none"
							>
								{v}
							</text>
						);
					})}
					<path
						d="M190 70 L 190 26"
						stroke="var(--pen)"
						strokeWidth="2.6"
						transform={`rotate(${needleAngle(shown)} 190 70)`}
					/>
					<circle cx="190" cy="70" r="3.4" fill="var(--pen)" stroke="none" />
					<text
						x="190"
						y="104"
						textAnchor="middle"
						fontSize="7"
						fill="var(--muted-foreground)"
						stroke="none"
					>
						mmHg
					</text>

					{/* Válvula */}
					<g transform={`rotate(${VALVE_ANGLE[valve]} 306 96)`}>
						<circle cx="306" cy="96" r="9" fill="var(--card)" />
						<path d="M306 88 L 306 93" strokeWidth="2.4" />
					</g>

					{/* Pera */}
					<g
						style={{
							transform: squeezed ? "scale(1.16, 0.8)" : "none",
							transformOrigin: "345px 112px",
							transition: "transform 120ms ease-out",
						}}
					>
						<path
							d="M318 100 C 322 82, 342 76, 352 84 C 368 96, 372 130, 360 146 C 350 160, 328 156, 322 138 C 318 126, 316 112, 318 100 Z"
							fill="color-mix(in oklch, var(--foreground) 70%, var(--card))"
						/>
					</g>

					{/* Estetoscopio sobre el pliegue del codo */}
					<path
						d="M262 176 C 290 150, 300 110, 278 70 C 268 50, 258 30, 262 0"
						strokeWidth="1.8"
					/>
					<circle
						cx="258"
						cy="180"
						r="13"
						fill="var(--muted)"
						stroke={beat ? "var(--pen)" : "currentColor"}
						strokeWidth={beat ? 3.2 : 2.2}
					/>
				</svg>

				{/* Lo que se toca: la pera y la válvula */}
				<button
					type="button"
					onClick={squeeze}
					aria-label="Apretar la pera para inflar"
					className="absolute top-[28%] left-[78%] h-[34%] w-[16%] cursor-pointer rounded-[45%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				/>
				<button
					type="button"
					onClick={turnValve}
					aria-label={`Girar la válvula (ahora: ${VALVE_LABEL[valve]})`}
					className="absolute top-[31%] left-[73%] size-[7%] cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				/>

				{/* Lo que pasa */}
				<span
					className={`absolute top-[74%] left-[66%] font-hand text-pen text-xl transition-opacity ${beat ? "opacity-100" : "opacity-0"}`}
					aria-hidden="true"
				>
					tum
				</span>
				<span className="absolute top-[3%] right-[1%] max-w-[26%] text-right font-hand text-lg text-muted-foreground leading-none">
					{VALVE_LABEL[valve]}
				</span>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<Button
					variant="outline"
					className="h-auto py-2"
					onClick={() => mark("s")}
				>
					<span className="grid">
						<span>Oí el primer ruido</span>
						<span className="font-hand text-lg text-pen leading-none">
							PAS {marked.s ?? "—"}
						</span>
					</span>
				</Button>
				<Button
					variant="outline"
					className="h-auto py-2"
					onClick={() => mark("d")}
				>
					<span className="grid">
						<span>Dejé de oír</span>
						<span className="font-hand text-lg text-pen leading-none">
							PAD {marked.d ?? "—"}
						</span>
					</span>
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
