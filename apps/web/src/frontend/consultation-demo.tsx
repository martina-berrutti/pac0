"use client";

// Un "video" dibujado de una consulta con Paco, para el inicio: la charla,
// la temperatura, la presión y la devolución. Es una ilustración en bucle,
// con pausa (WCAG 2.2.2: lo que se mueve solo más de 5 s se tiene que poder
// frenar). Con «reducir movimiento» arranca en pausa.
import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { PacoFace } from "./logo";

const SCENE_MS = 4000;
const SCENES = [
	{
		label: "La charla",
		you: "Hola, soy Ana, estudiante. ¿Qué te trae por acá?",
		paco: "Me duele la garganta desde hace tres días.",
	},
	{
		label: "La temperatura",
		you: "Te voy a tomar la temperatura, ¿puedo?",
		paco: "Dale. ¿Tengo fiebre?",
	},
	{
		label: "La presión",
		you: "Ahora la presión. Apoyá el brazo y no hables, ¿sí?",
		paco: "…",
	},
	{
		label: "Tu devolución",
		you: "Cerrás con tu diagnóstico.",
		paco: "Y te cuento cómo te fue.",
	},
] as const;
const TOTAL_MS = SCENE_MS * SCENES.length;
const TICK_MS = 100;

const clamp = (x: number, lo: number, hi: number) =>
	Math.min(hi, Math.max(lo, x));

function time(ms: number) {
	const s = Math.floor(ms / 1000);
	return `0:${String(s).padStart(2, "0")}`;
}

export function ConsultationDemo() {
	const [t, setT] = useState(0);
	const [playing, setPlaying] = useState(true);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setPlaying(false);
			// Sin animación, cada escena se muestra completa.
			setT(SCENE_MS - TICK_MS);
		}
	}, []);

	useEffect(() => {
		if (!playing) return;
		const id = setInterval(
			() => setT((x) => (x + TICK_MS) % TOTAL_MS),
			TICK_MS,
		);
		return () => clearInterval(id);
	}, [playing]);

	const scene = Math.floor(t / SCENE_MS);
	const local = t % SCENE_MS;
	const current = SCENES[scene] ?? SCENES[0];

	// Termómetro: de 36,0 a 38,4 en 2,5 s.
	const temp = 36 + 2.4 * clamp((local - 600) / 2500, 0, 1);
	// Manómetro: infla hasta 170 en 1,4 s y desinfla hasta 60.
	const pressure =
		local < 1400
			? 170 * (local / 1400)
			: 170 - 110 * clamp((local - 1400) / 2000, 0, 1);
	const needle = -120 + (clamp(pressure, 0, 300) / 300) * 240;

	return (
		<figure className="grid gap-3">
			<div
				className="relative overflow-hidden border-2 border-foreground/80 bg-card"
				style={{ borderRadius: "18px 22px 16px 24px / 22px 16px 24px 18px" }}
			>
				{/* La escena */}
				<div className="relative aspect-[4/3] w-full">
					<svg
						viewBox="0 0 400 300"
						className="absolute inset-0 size-full text-primary"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.6"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						{/* El consultorio: una línea de pared y un cuadro torcido. */}
						<path
							d="M0 168 C 120 165, 280 171, 400 166"
							stroke="var(--border)"
							strokeWidth="2"
						/>
						<path
							d="M300 40 L 352 44 L 349 92 L 297 88 Z"
							stroke="var(--border)"
							strokeWidth="2"
						/>
						{/* Cuerpo de Paco */}
						<path
							d="M118 300 C 112 250, 116 215, 132 192 C 150 170, 210 168, 230 188 C 246 206, 250 250, 246 300"
							fill="var(--card)"
						/>
						{/* Brazo extendido (para la presión) */}
						<path
							d="M232 200 C 262 206, 292 214, 322 224 C 334 228, 333 244, 320 243 C 290 238, 260 232, 236 228"
							fill="var(--card)"
						/>
						{/* Brazo pegado al cuerpo (para el termómetro) */}
						<path d="M134 204 C 120 228, 116 256, 120 288" />

						{scene === 1 && (
							<g>
								{/* Termómetro bajo el brazo */}
								<g transform="rotate(-28 128 214)">
									<rect
										x="92"
										y="206"
										width="44"
										height="12"
										rx="6"
										fill="var(--card)"
									/>
									<rect
										x="98"
										y="209"
										width="16"
										height="6"
										rx="1.5"
										fill="var(--sky)"
										stroke="none"
									/>
								</g>
								<path
									d="M96 196 C 80 180, 70 172, 58 166"
									stroke="var(--muted-foreground)"
									strokeWidth="1.6"
									strokeDasharray="3 4"
								/>
							</g>
						)}

						{scene === 2 && (
							<g>
								{/* Manguito en el brazo */}
								<rect
									x="258"
									y="200"
									width="34"
									height="34"
									rx="7"
									transform="rotate(14 275 217)"
									fill="color-mix(in oklch, var(--clay) 55%, var(--card))"
								/>
								{/* Tubo al manómetro */}
								<path
									d="M282 204 C 296 170, 316 152, 330 140"
									strokeWidth="2"
								/>
								{/* Manómetro */}
								<circle cx="340" cy="112" r="30" fill="var(--card)" />
								{Array.from({ length: 9 }, (_, i) => {
									const a = ((-120 + i * 30) * Math.PI) / 180;
									return (
										<path
											key={a}
											d={`M${340 + Math.sin(a) * 22} ${112 - Math.cos(a) * 22} L ${340 + Math.sin(a) * 27} ${112 - Math.cos(a) * 27}`}
											strokeWidth="1.6"
										/>
									);
								})}
								<path
									d="M340 112 L 340 90"
									stroke="var(--pen)"
									strokeWidth="2.4"
									transform={`rotate(${needle} 340 112)`}
								/>
								<circle
									cx="340"
									cy="112"
									r="2.6"
									fill="var(--pen)"
									stroke="none"
								/>
							</g>
						)}
					</svg>

					{/* La cara de Paco, sobre el cuerpo */}
					<div className="absolute top-[21%] left-[30%] w-[31%]">
						<PacoFace className="size-full" strokeWidth={2.2} blush />
					</div>

					{/* Lectura del termómetro */}
					{scene === 1 && (
						<span className="absolute top-[45%] left-[3%] rotate-[-4deg] rounded-md border-2 border-foreground/70 bg-card px-2 py-0.5 font-hand text-2xl tabular-nums">
							{temp.toFixed(1).replace(".", ",")} °C
						</span>
					)}

					{/* Lectura de la presión */}
					{scene === 2 && local > 3300 && (
						<span className="absolute top-[4%] right-[24%] rotate-3 font-hand text-2xl text-pen">
							118/76
						</span>
					)}

					{/* La devolución */}
					{scene === 3 && (
						<div className="absolute inset-0 grid place-items-center bg-background/70">
							<div
								className="relative w-[70%] rotate-[-2deg] border border-border bg-card px-5 py-4 shadow-lg"
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
					{scene < 3 && (
						<div className="absolute inset-x-3 bottom-3 grid gap-1.5 text-sm sm:text-[0.95rem]">
							<p className="w-fit max-w-[85%] justify-self-end rounded-xl rounded-br-sm bg-primary px-3 py-1.5 text-primary-foreground">
								{current.you}
							</p>
							{local > 1500 && (
								<p className="w-fit max-w-[85%] rounded-xl rounded-bl-sm border border-border bg-card px-3 py-1.5">
									<span className="font-semibold">Paco:</span> {current.paco}
								</p>
							)}
						</div>
					)}
				</div>

				{/* Controles del "video" */}
				<div className="flex items-center gap-3 border-border border-t px-3 py-2">
					<button
						type="button"
						onClick={() => setPlaying((p) => !p)}
						className="grid size-8 place-items-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						aria-label={
							playing ? "Pausar la animación" : "Reproducir la animación"
						}
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
						onClick={() =>
							setT(i * SCENE_MS + (playing ? 0 : SCENE_MS - TICK_MS))
						}
						className={`underline-offset-4 hover:underline ${i === scene ? "font-semibold text-foreground underline decoration-2 decoration-pen" : "text-muted-foreground"}`}
						aria-current={i === scene ? "step" : undefined}
					>
						{i + 1}. {s.label}
					</button>
				))}
			</figcaption>
		</figure>
	);
}
