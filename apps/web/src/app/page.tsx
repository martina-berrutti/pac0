import Link from "next/link";

import { PacoFace } from "@/frontend/logo";
import {
	Highlight,
	linkButtonClass,
	Note,
	Paper,
	Underline,
} from "@/frontend/ui";

// Una consulta de ejemplo con Paco: lo que dice el estudiante y lo que
// contesta él. Es una ilustración; la consulta real es por voz.
const CHAT = [
	{
		who: "vos",
		text: "Hola, soy Ana, estudiante de medicina. ¿Qué te trae por acá?",
	},
	{
		who: "paco",
		text: "Me duele la garganta hace tres días… y anoche tuve fiebre.",
	},
	{
		who: "vos",
		text: "Uh, qué feo. ¿Puedo revisarte? Abrí bien grande y decí «aaa».",
	},
	{ who: "paco", text: "Aaaaa…" },
] as const;

export default function Home() {
	return (
		<main className="mx-auto grid w-full max-w-5xl gap-28 overflow-x-clip px-5 pt-12 pb-16 sm:pt-20">
			{/* Portada: el título y Paco que saluda. */}
			<section className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr]">
				<div className="grid min-w-0 gap-7">
					<Note className="-rotate-2 text-2xl text-pen">
						para estudiantes de medicina
					</Note>
					<h1 className="text-balance font-display text-[2.6rem] leading-[1.06] sm:text-[3.5rem]">
						Tu primera consulta,{" "}
						<Highlight>antes de tu primer paciente</Highlight>.
					</h1>
					<p className="max-w-lg text-lg text-muted-foreground leading-relaxed">
						Practicá la entrevista clínica con Paco: hablale por voz, revisalo y
						descubrí qué tiene. Al final te cuenta cómo te fue, con tus propias
						palabras.
					</p>
					<div className="flex flex-wrap items-center gap-5">
						<Link href="/entrar" className={linkButtonClass("primary")}>
							Empezar a practicar
						</Link>
						<a href="#consulta" className={linkButtonClass("quiet")}>
							Mirá cómo es
						</a>
					</div>
				</div>

				<PacoSaysHi />
			</section>

			{/* Una consulta con Paco, contada como charla, y su ficha corregida. */}
			<section id="consulta" className="grid scroll-mt-24 gap-12">
				<h2 className="max-w-xl font-display text-3xl sm:text-4xl">
					Así es una consulta <Underline>con Paco</Underline>
				</h2>
				<div className="grid items-start gap-14 md:grid-cols-[1.15fr_1fr]">
					<ol className="grid gap-3" aria-label="Ejemplo de consulta">
						{CHAT.map((m) => (
							<li
								key={m.text}
								className={
									m.who === "vos"
										? "max-w-[85%] justify-self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground"
										: "flex max-w-[85%] items-end gap-2 justify-self-start"
								}
							>
								{m.who === "paco" ? (
									<>
										<PacoFace className="size-9" />
										<span className="rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3">
											{m.text}
										</span>
									</>
								) : (
									m.text
								)}
							</li>
						))}
						<li className="pt-2 text-center font-hand text-muted-foreground text-xl">
							… y así hasta que cerrás con tu diagnóstico
						</li>
					</ol>

					<GradedSheet />
				</div>
			</section>

			{/* Cierre */}
			<section className="grid justify-items-start gap-6 border-border border-t border-dashed pt-14 md:grid-cols-[auto_1fr] md:items-center md:gap-10">
				<PacoFace className="size-24 -rotate-6" strokeWidth={2.6} blush />
				<div className="grid gap-4">
					<h2 className="font-display text-3xl sm:text-4xl">
						Paco ya está en la sala de espera.
					</h2>
					<p className="max-w-lg text-muted-foreground">
						Cada consulta dura hasta 8 minutos. Entrás con un alias y arrancás
						cuando quieras.
					</p>
					<Link
						href="/entrar"
						className={`${linkButtonClass("primary")} w-fit`}
					>
						Hacer pasar a Paco
					</Link>
				</div>
			</section>

			<p className="text-muted-foreground text-xs">
				Herramienta educativa de práctica: no reemplaza a pacientes reales ni a
				docentes. Los casos son ficticios.
			</p>
		</main>
	);
}

// Paco grande, saludando desde un globo de diálogo.
function PacoSaysHi() {
	return (
		<div className="relative mx-auto grid w-full max-w-sm justify-items-center pt-28 sm:pt-32">
			<div className="absolute top-0 left-0 max-w-[16rem] -rotate-2">
				<div
					className="relative border-2 border-foreground bg-card px-5 py-4"
					style={{ borderRadius: "22px 26px 20px 28px / 26px 20px 28px 22px" }}
				>
					<p className="font-display text-2xl leading-tight">
						¡Hola! Soy Paco.
					</p>
					<p className="mt-1 font-hand text-muted-foreground text-xl leading-snug">
						Hoy vengo por la garganta. ¿Me atendés?
					</p>
					{/* La colita del globo, hacia Paco. */}
					<svg
						viewBox="0 0 40 30"
						className="absolute right-10 -bottom-[26px] h-7 w-9 text-foreground"
						aria-hidden="true"
					>
						<path
							d="M2 1 C 12 10, 22 20, 34 28 C 28 18, 26 9, 26 1"
							fill="var(--card)"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
			</div>
			<PacoFace
				className="size-52 animate-breathe sm:size-60"
				strokeWidth={2.2}
				blush
			/>
		</div>
	);
}

// La ficha de la consulta, corregida en birome como la devuelve Paco.
function GradedSheet() {
	return (
		<div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
			<Paper
				tape="tape"
				tilt={2}
				className="grid gap-4 bg-[repeating-linear-gradient(transparent_0,transparent_31px,color-mix(in_oklch,var(--sky)_55%,transparent)_31px,color-mix(in_oklch,var(--sky)_55%,transparent)_32px)] px-6 pt-8 pb-7"
			>
				<div className="flex items-baseline justify-between">
					<span className="font-display font-semibold">Tu devolución</span>
					<span className="font-hand text-lg text-muted-foreground">Paco</span>
				</div>
				<ul className="grid font-hand text-[1.35rem] leading-[32px]">
					<li>✓ te presentaste</li>
					<li>✓ ¿desde cuándo? ¿fiebre?</li>
					<li>✓ pediste permiso para revisar</li>
					<li className="text-muted-foreground line-through decoration-pen">
						¿alergias?
					</li>
					<li className="text-pen">→ la próxima, preguntá alergias</li>
				</ul>
			</Paper>
			<div className="absolute -right-2 -bottom-12 grid rotate-[-8deg] justify-items-center sm:-right-8">
				<span className="grid size-20 place-items-center rounded-[48%_52%_45%_55%/55%_45%_55%_45%] border-[2.5px] border-pen bg-card font-hand text-4xl text-pen">
					87
				</span>
				<span className="font-hand text-pen text-xl">¡muy bien!</span>
			</div>
		</div>
	);
}
