import {
	ArrowRight,
	ClipboardCheck,
	Flashlight,
	HeartPulse,
	Mic,
	ShieldCheck,
	Sparkles,
	Stethoscope,
} from "lucide-react";
import Link from "next/link";

import { LogoMark } from "@/frontend/logo";
import { IconBubble, linkButtonClass, Pill, Surface } from "@/frontend/ui";

const STEPS = [
	{
		icon: Mic,
		tone: "primary" as const,
		title: "Hablá",
		text: "Entrevistá por voz a un paciente que responde como una persona de verdad: con dudas, nervios o mal humor.",
	},
	{
		icon: Flashlight,
		tone: "coral" as const,
		title: "Examiná",
		text: "Pedile que abra la boca y mirá con la linterna, tomá la presión o usá el otoscopio. La técnica cuenta.",
	},
	{
		icon: ClipboardCheck,
		tone: "sun" as const,
		title: "Aprendé",
		text: "Recibí un informe con puntaje, lo que hiciste bien y qué hacer distinto la próxima vez, con tus propias frases como evidencia.",
	},
];

export default function Home() {
	return (
		<main className="mx-auto grid w-full max-w-6xl gap-20 overflow-x-clip px-4 pt-10 pb-16 sm:pt-16">
			{/* Portada */}
			<section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
				<div className="grid min-w-0 animate-rise gap-6">
					<Pill tone="coral" className="w-fit">
						<Sparkles className="size-3.5" aria-hidden="true" />
						Práctica clínica con pacientes simulados
					</Pill>
					<h1 className="text-balance font-bold text-[2.6rem] leading-[1.04] sm:text-6xl">
						Practicá la consulta{" "}
						<span className="relative text-primary sm:whitespace-nowrap">
							antes de la consulta
							<svg
								viewBox="0 0 300 12"
								className="absolute -bottom-2 left-0 h-3 w-full text-coral"
								aria-hidden="true"
								preserveAspectRatio="none"
							>
								<path
									d="M2 9 C 80 2, 200 2, 298 8"
									fill="none"
									stroke="currentColor"
									strokeWidth="4"
									strokeLinecap="round"
								/>
							</svg>
						</span>
						.
					</h1>
					<p className="max-w-xl text-pretty text-lg text-muted-foreground">
						Conocé a <strong className="text-foreground">Paco</strong>, tu
						paciente 0: le hablás, lo examinás y te devuelve un feedback claro
						para que la próxima entrevista te salga mejor. Sin miedo a
						equivocarte.
					</p>
					<div className="flex flex-wrap gap-3">
						<Link href="/entrar" className={linkButtonClass("primary")}>
							Empezar a practicar
							<ArrowRight className="size-4" aria-hidden="true" />
						</Link>
						<a href="#como-funciona" className={linkButtonClass("outline")}>
							Cómo funciona
						</a>
					</div>
					<p className="flex items-center gap-2 text-muted-foreground text-sm">
						<ShieldCheck className="size-4 text-success" aria-hidden="true" />
						Entrás con un alias. Casos inventados, sin datos de pacientes
						reales.
					</p>
				</div>

				<ConsultationPreview />
			</section>

			{/* Cómo funciona */}
			<section id="como-funciona" className="grid scroll-mt-24 gap-8">
				<div className="grid gap-2 text-center">
					<p className="font-semibold text-primary text-xs uppercase tracking-[0.16em]">
						Cómo funciona
					</p>
					<h2 className="text-balance font-bold text-3xl sm:text-4xl">
						Tres pasos, una consulta completa
					</h2>
				</div>
				<ol className="grid gap-4 md:grid-cols-3">
					{STEPS.map((s, i) => (
						<Surface
							as="li"
							key={s.title}
							className="grid content-start gap-3 transition-transform hover:-translate-y-1"
						>
							<div className="flex items-center justify-between">
								<IconBubble icon={s.icon} tone={s.tone} />
								<span className="font-bold font-display text-4xl text-muted-foreground/30">
									0{i + 1}
								</span>
							</div>
							<h3 className="font-bold text-xl">{s.title}</h3>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{s.text}
							</p>
						</Surface>
					))}
				</ol>
			</section>

			{/* Llamado final */}
			<section className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
				<div
					className="absolute -top-16 -right-10 size-56 rounded-full bg-coral/30 blur-2xl"
					aria-hidden="true"
				/>
				<div
					className="absolute -bottom-20 -left-10 size-64 rounded-full bg-sun/25 blur-2xl"
					aria-hidden="true"
				/>
				<div className="relative grid justify-items-center gap-5">
					<LogoMark className="size-16 animate-float" />
					<h2 className="max-w-xl text-balance font-bold text-3xl sm:text-4xl">
						Tu próximo paciente te está esperando
					</h2>
					<p className="max-w-md text-primary-foreground/80">
						Cada consulta dura hasta 8 minutos. Elegí un caso y empezá cuando
						quieras.
					</p>
					<Link
						href="/entrar"
						className="inline-flex h-12 items-center gap-2 rounded-full bg-card px-6 font-semibold text-foreground text-sm transition-transform hover:-translate-y-0.5"
					>
						Empezar ahora
						<ArrowRight className="size-4" aria-hidden="true" />
					</Link>
				</div>
			</section>

			<p className="mx-auto max-w-2xl text-center text-muted-foreground text-xs">
				Herramienta educativa de práctica: no reemplaza a pacientes reales ni a
				docentes. Los casos son ficticios.
			</p>
		</main>
	);
}

// Ilustración de una consulta: mensajes, examen y puntaje. Es decorativa.
function ConsultationPreview() {
	return (
		<div className="relative mx-auto w-full max-w-md" aria-hidden="true">
			<div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-mint/60 via-transparent to-coral-soft blur-xl" />
			<Surface className="relative grid gap-4 rounded-[2rem] p-5">
				<div className="flex items-center gap-3">
					<span className="grid size-12 place-items-center rounded-2xl bg-coral font-bold font-display text-lg text-white">
						L
					</span>
					<div className="grid">
						<span className="font-semibold">Lucía, 24 años</span>
						<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<span className="size-2 animate-pulse-ring rounded-full bg-success" />
							En línea · te escucha
						</span>
					</div>
					<Pill tone="muted" className="ml-auto">
						6 min
					</Pill>
				</div>
				<div className="grid gap-2 text-sm">
					<p className="max-w-[85%] rounded-2xl rounded-tl-md bg-muted px-4 py-2.5">
						Me duele la garganta desde hace tres días, y anoche tuve fiebre.
					</p>
					<p className="max-w-[85%] justify-self-end rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-primary-foreground">
						Entiendo. ¿Puedo revisarte? Abrí bien grande y decí «aaa».
					</p>
				</div>
				<div className="relative h-36 overflow-hidden rounded-2xl bg-neutral-950">
					{/* Boca abierta: paladar, úvula, amígdalas y lengua. */}
					<div className="absolute inset-x-[22%] top-[10%] bottom-[-20%] rounded-t-[50%] bg-rose-950" />
					<div className="absolute inset-x-[30%] top-[22%] bottom-[-20%] rounded-t-[50%] bg-rose-900" />
					<div className="absolute top-[24%] left-1/2 h-9 w-4 -translate-x-1/2 rounded-b-full bg-rose-500" />
					<div className="absolute top-[42%] left-[31%] h-11 w-8 rounded-full bg-rose-400 ring-2 ring-amber-100/70" />
					<div className="absolute top-[42%] right-[31%] h-11 w-8 rounded-full bg-rose-400 ring-2 ring-amber-100/70" />
					<div className="absolute inset-x-[26%] bottom-[-35%] h-[60%] rounded-[50%] bg-rose-300" />
					<div className="absolute inset-0 bg-[radial-gradient(circle_at_44%_48%,transparent_22%,rgba(0,0,0,0.88)_40%)]" />
					<span className="absolute bottom-2 left-3 flex items-center gap-1 text-[10px] text-neutral-300">
						<Flashlight className="size-3" />
						Linterna
					</span>
				</div>
			</Surface>

			<Surface className="absolute -right-4 -bottom-8 flex animate-float items-center gap-3 rounded-2xl p-3 pr-4 sm:-right-10">
				<span className="grid size-11 place-items-center rounded-xl bg-success/15 font-bold font-display text-success">
					87
				</span>
				<span className="grid text-sm leading-tight">
					<span className="font-semibold">¡Lo hiciste bien!</span>
					<span className="text-muted-foreground text-xs">
						Pediste permiso antes de examinar
					</span>
				</span>
			</Surface>

			<Surface className="absolute -top-6 -left-4 flex animate-float items-center gap-2 rounded-2xl p-2.5 pr-3.5 [animation-delay:1.5s] sm:-left-10">
				<span className="grid size-8 place-items-center rounded-xl bg-sun-soft">
					<Stethoscope className="size-4" />
				</span>
				<span className="font-medium text-xs">Examen virtual</span>
				<HeartPulse className="size-4 text-coral" />
			</Surface>
		</div>
	);
}
