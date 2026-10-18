import Link from "next/link";

import { ConsultationDemo } from "@/frontend/consultation-demo";
import { PacoFace } from "@/frontend/logo";
import {
	Highlight,
	linkButtonClass,
	Note,
	Underline,
} from "@/frontend/ui";

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
				<div className="mx-auto w-full max-w-2xl">
					<ConsultationDemo />
					<p className="mt-3 text-muted-foreground text-xs">
						Es una ilustración. En la app, Paco habla de verdad, se mueve y
						reacciona a cómo lo tratás.
					</p>
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
