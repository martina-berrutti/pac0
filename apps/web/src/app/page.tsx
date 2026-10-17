import Link from "next/link";

import { PacoFace } from "@/frontend/logo";
import {
	DoodleChart,
	DoodleStethoscope,
	DoodleTalk,
	Highlight,
	linkButtonClass,
	Note,
	Paper,
	Underline,
} from "@/frontend/ui";

const STEPS = [
	{
		doodle: DoodleTalk,
		title: "Hablás con el paciente",
		text: "Por voz, como en el consultorio. Puede estar nervioso, apurado o de mal humor, y responde según cómo lo tratás.",
	},
	{
		doodle: DoodleStethoscope,
		title: "Lo examinás",
		text: "Le pedís que abra la boca y mirás con la linterna, le tomás la presión o usás el otoscopio. La técnica cuenta.",
	},
	{
		doodle: DoodleChart,
		title: "Te devuelve una devolución",
		text: "Qué hiciste bien, qué te faltó y cómo hacerlo la próxima vez, con tus propias frases como evidencia.",
	},
];

export default function Home() {
	return (
		<main className="mx-auto grid w-full max-w-5xl gap-24 overflow-x-clip px-5 pt-12 pb-16 sm:pt-20">
			{/* Portada */}
			<section className="grid items-center gap-14 md:grid-cols-[1.15fr_1fr]">
				<div className="grid min-w-0 gap-7">
					<Note className="-rotate-2 text-2xl text-pen">
						para estudiantes de medicina ↓
					</Note>
					<h1 className="text-balance font-display text-[2.7rem] leading-[1.05] sm:text-[3.6rem]">
						Practicá la consulta <Highlight>antes de la consulta</Highlight>.
					</h1>
					<p className="max-w-lg text-lg text-muted-foreground leading-relaxed">
						Paco es tu paciente 0. Le hacés la entrevista, lo examinás y al
						final te dice, con tus propias palabras, qué salió bien y qué podés
						mejorar. Equivocarte acá no tiene costo.
					</p>
					<div className="flex flex-wrap items-center gap-5">
						<Link href="/entrar" className={linkButtonClass("primary")}>
							Empezar a practicar
						</Link>
						<a href="#como-funciona" className={linkButtonClass("quiet")}>
							¿Cómo funciona?
						</a>
					</div>
					<p className="text-muted-foreground text-sm">
						Entrás con un alias. Los casos son inventados: no hay datos de
						pacientes reales.
					</p>
				</div>

				<PatientSheet />
			</section>

			{/* Cómo funciona */}
			<section id="como-funciona" className="grid scroll-mt-24 gap-12">
				<h2 className="max-w-xl font-display text-3xl sm:text-4xl">
					Una consulta entera, <Underline>de punta a punta</Underline>
				</h2>
				<ol className="grid gap-10 md:grid-cols-3 md:gap-8">
					{STEPS.map((s, i) => (
						<li key={s.title} className="grid content-start gap-3">
							<div className="flex items-end gap-2">
								<s.doodle className={i === 1 ? "rotate-6" : "-rotate-3"} />
								<span className="font-hand text-3xl text-pen">{i + 1}.</span>
							</div>
							<h3 className="font-display text-xl">{s.title}</h3>
							<p className="text-muted-foreground leading-relaxed">{s.text}</p>
						</li>
					))}
				</ol>
			</section>

			{/* Cierre */}
			<section className="grid justify-items-start gap-6 border-border border-t border-dashed pt-14 md:grid-cols-[auto_1fr] md:items-center md:gap-10">
				<PacoFace className="size-24 -rotate-6" strokeWidth={2.6} />
				<div className="grid gap-4">
					<h2 className="font-display text-3xl sm:text-4xl">
						Paco ya está en la sala de espera.
					</h2>
					<p className="max-w-lg text-muted-foreground">
						Cada consulta dura hasta 8 minutos. Elegí un paciente y arrancá
						cuando quieras.
					</p>
					<Link
						href="/entrar"
						className={`${linkButtonClass("primary")} w-fit`}
					>
						Atender a Paco
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

// La ficha de un paciente, escrita a mano y corregida en birome. Decorativa.
function PatientSheet() {
	return (
		<div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
			<Paper
				tape="tape"
				tilt={2}
				className="grid gap-4 bg-[repeating-linear-gradient(transparent_0,transparent_31px,color-mix(in_oklch,var(--sky)_55%,transparent)_31px,color-mix(in_oklch,var(--sky)_55%,transparent)_32px)] px-6 pt-8 pb-7"
			>
				<div className="flex items-baseline justify-between">
					<span className="font-display font-semibold">Ficha de consulta</span>
					<span className="font-hand text-lg text-muted-foreground">17/10</span>
				</div>
				<dl className="grid gap-1 font-hand text-[1.45rem] leading-[32px]">
					<div className="flex gap-2">
						<dt className="text-muted-foreground">Paciente:</dt>
						<dd>Lucía, 24 años</dd>
					</div>
					<div>
						<dt className="inline text-muted-foreground">Motivo: </dt>
						<dd className="inline">
							"me duele la garganta desde hace tres días"
						</dd>
					</div>
				</dl>
				<ul className="grid font-hand text-[1.35rem] leading-[32px]">
					<li>✓ ¿desde cuándo?</li>
					<li>✓ ¿tuviste fiebre?</li>
					<li>✓ pidió permiso para examinar</li>
					<li className="text-muted-foreground line-through decoration-pen">
						¿alergias?
					</li>
				</ul>
			</Paper>
			<div className="absolute -right-2 -bottom-10 grid rotate-[-8deg] justify-items-center sm:-right-8">
				<span className="grid size-20 place-items-center rounded-[48%_52%_45%_55%/55%_45%_55%_45%] border-[2.5px] border-pen font-hand text-4xl text-pen">
					87
				</span>
				<span className="font-hand text-pen text-xl">¡muy bien!</span>
			</div>
		</div>
	);
}
