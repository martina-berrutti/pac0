"use client";

// Un clip de una consulta para el inicio, con el mismo avatar 3D de la
// práctica: la charla, la temperatura, la presión y la devolución. No usa voz
// (no gasta créditos): la boca se mueve con los subtítulos. Se carga recién
// cuando la sección se ve y tiene pausa (WCAG 2.2.2: lo que se mueve solo
// más de 5 s se tiene que poder frenar); con «reducir movimiento» arranca en
// pausa.
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
	PatientAvatar,
	type PatientAvatarHandle,
} from "@/components/avatar/patient-avatar";

const SCENE_MS = 5000;
const SCENES = [
	{
		label: "La charla",
		you: "Hola, soy Ana, estudiante. ¿Qué te trae por acá?",
		patient: "Me duele la garganta desde hace tres días.",
	},
	{
		label: "La temperatura",
		you: "Te voy a tomar la temperatura, ¿puedo?",
		patient: "Dale. ¿Tengo fiebre?",
	},
	{
		label: "La presión",
		you: "Ahora la presión. Apoyá el brazo y no hables, ¿sí?",
		patient: "",
	},
	{
		label: "Tu devolución",
		you: "",
		patient: "",
	},
] as const;
const TOTAL_MS = SCENE_MS * SCENES.length;
const TICK_MS = 100;
// Cuándo contesta el paciente dentro de cada escena.
const REPLY_AT = 1800;
const TEMP_C = 38.4;

const clamp = (x: number, lo: number, hi: number) =>
	Math.min(hi, Math.max(lo, x));

function time(ms: number) {
	return `0:${String(Math.floor(ms / 1000)).padStart(2, "0")}`;
}

// La presión del manguito en la escena: infla hasta 170 y baja hasta 60.
function cuffAt(local: number) {
	return local < 1500
		? 170 * (local / 1500)
		: 170 - 110 * clamp((local - 1500) / 3000, 0, 1);
}

export function ConsultationDemo() {
	const box = useRef<HTMLDivElement>(null);
	const avatar = useRef<PatientAvatarHandle>(null);
	const [visible, setVisible] = useState(false);
	const [ready, setReady] = useState(false);
	const [t, setT] = useState(0);
	const [playing, setPlaying] = useState(true);
	const lastScene = useRef(-1);
	const spoke = useRef(-1);

	// El modelo pesa: se carga recién cuando el clip entra en pantalla.
	useEffect(() => {
		const node = box.current;
		if (!node) return;
		const io = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					setVisible(true);
					io.disconnect();
				}
			},
			{ rootMargin: "200px" },
		);
		io.observe(node);
		return () => io.disconnect();
	}, []);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
			setPlaying(false);
	}, []);

	useEffect(() => {
		if (!playing || !ready) return;
		const id = setInterval(
			() => setT((x) => (x + TICK_MS) % TOTAL_MS),
			TICK_MS,
		);
		return () => clearInterval(id);
	}, [playing, ready]);

	const scene = Math.floor(t / SCENE_MS);
	const local = t % SCENE_MS;
	const current = SCENES[scene] ?? SCENES[0];

	// Lo que hace el avatar en cada momento.
	useEffect(() => {
		const a = avatar.current;
		if (!a || !ready) return;
		if (scene !== lastScene.current) {
			lastScene.current = scene;
			spoke.current = -1;
			if (scene === 0) {
				a.exam(null);
				a.run({ kind: "face", face: "preocupado" });
			}
			if (scene === 1) a.exam({ kind: "temperatura", step: "levantar" });
			if (scene === 3) {
				a.exam(null);
				a.run({ kind: "mood", mood: "happy" });
			}
		}
		if (scene === 1 && local >= 1600)
			a.exam({ kind: "temperatura", step: "midiendo" });
		if (scene === 2) a.exam({ kind: "presion", mmHg: cuffAt(local) });
		if (current.patient && local >= REPLY_AT && spoke.current !== scene) {
			spoke.current = scene;
			a.mimicSpeech(1600);
		}
	}, [scene, local, ready, current.patient]);

	const jump = useCallback((i: number) => {
		lastScene.current = -1;
		setT(i * SCENE_MS);
	}, []);

	const temp = 35.2 + (TEMP_C - 35.2) * clamp((local - 1800) / 2500, 0, 1);

	return (
		<figure className="grid gap-3">
			<div
				ref={box}
				className="relative overflow-hidden border-2 border-foreground/80 bg-card"
				style={{ borderRadius: "18px 22px 16px 24px / 22px 16px 24px 18px" }}
			>
				<div className="relative aspect-[4/3] w-full bg-[color-mix(in_oklch,var(--sage)_25%,var(--card))]">
					{visible && (
						<div className="absolute inset-0">
							<PatientAvatar
								ref={avatar}
								className="size-full"
								onReady={() => setReady(true)}
							/>
						</div>
					)}

					{/* Lecturas sobre la escena */}
					{ready && scene === 1 && local >= 1800 && (
						<span className="absolute top-4 left-4 rounded-md border-2 border-foreground/70 bg-card px-2 py-0.5 font-mono text-xl tabular-nums">
							{temp.toFixed(1).replace(".", ",")} °C
						</span>
					)}
					{ready && scene === 2 && (
						<span className="absolute top-4 left-4 grid rounded-md border-2 border-foreground/70 bg-card px-2 py-1 leading-tight">
							<span className="font-mono text-xl tabular-nums">
								{Math.round(cuffAt(local) / 2) * 2}
							</span>
							<span className="text-muted-foreground text-xs">mmHg</span>
							{local > 4200 && (
								<span className="font-hand text-pen text-xl">118/76</span>
							)}
						</span>
					)}

					{/* La devolución */}
					{ready && scene === 3 && (
						<div className="absolute inset-0 grid place-items-center bg-background/55">
							<div
								className="relative w-[70%] max-w-xs rotate-[-2deg] border border-border bg-card px-5 py-4 shadow-lg"
								style={{
									borderRadius: "14px 18px 15px 20px / 18px 14px 20px 15px",
									animation: "pac0-rise 0.5s ease-out both",
								}}
							>
								<p className="font-display font-semibold">Tu devolución</p>
								<ul className="mt-1 font-hand text-[1.15rem] leading-snug sm:text-xl">
									<li>✓ te presentaste</li>
									<li>✓ fiebre y presión bien tomadas</li>
									<li className="text-pen">→ la próxima, preguntá alergias</li>
								</ul>
								<span className="absolute -top-5 -right-4 grid size-14 rotate-[-10deg] place-items-center rounded-[48%_52%_45%_55%/55%_45%_55%_45%] border-[2.5px] border-pen bg-card font-hand text-2xl text-pen">
									87
								</span>
							</div>
						</div>
					)}

					{/* Subtítulos */}
					{ready && scene < 3 && (
						<div className="absolute inset-x-3 bottom-3 grid gap-1.5 text-sm sm:text-[0.95rem]">
							<p className="w-fit max-w-[85%] justify-self-end rounded-xl rounded-br-sm bg-primary px-3 py-1.5 text-primary-foreground">
								{current.you}
							</p>
							{current.patient && local > REPLY_AT && (
								<p className="w-fit max-w-[85%] rounded-xl rounded-bl-sm border border-border bg-card px-3 py-1.5">
									<span className="font-semibold">Lucía:</span>{" "}
									{current.patient}
								</p>
							)}
						</div>
					)}
				</div>

				{/* Controles del clip */}
				<div className="flex items-center gap-3 border-border border-t px-3 py-2">
					<button
						type="button"
						onClick={() => setPlaying((p) => !p)}
						disabled={!ready}
						className="grid size-8 place-items-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
						aria-label={playing ? "Pausar el clip" : "Reproducir el clip"}
					>
						{playing ? (
							<Pause className="size-4" aria-hidden="true" />
						) : (
							<Play className="size-4" aria-hidden="true" />
						)}
					</button>
					<div className="relative h-1.5 flex-1 rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-pen"
							style={{ width: `${(t / TOTAL_MS) * 100}%` }}
						/>
					</div>
					<span className="font-mono text-muted-foreground text-xs tabular-nums">
						{time(t)} / {time(TOTAL_MS)}
					</span>
				</div>
			</div>

			{/* Capítulos: también sirven para saltar de escena */}
			<figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
				{SCENES.map((s, i) => (
					<button
						key={s.label}
						type="button"
						disabled={!ready}
						onClick={() => jump(i)}
						className={`underline-offset-4 hover:underline disabled:opacity-40 ${i === scene ? "font-semibold text-foreground underline decoration-2 decoration-pen" : "text-muted-foreground"}`}
						aria-current={i === scene ? "step" : undefined}
					>
						{i + 1}. {s.label}
					</button>
				))}
			</figcaption>
		</figure>
	);
}
