import Link from "next/link";

import { PacoFace } from "@/frontend/logo";
import { Highlight, type Ink, Note, Paper } from "@/frontend/ui";

// Quién espera en la sala. Son los casos del banco (cases/*.json); llamar a
// uno lleva a entrar y de ahí a elegirlo.
const WAITING: {
	turn: number;
	name: string;
	age?: number;
	says: string;
	ink: Ink;
}[] = [
	{
		turn: 14,
		name: "Lucía",
		age: 24,
		says: "me duele la garganta y estoy con mocos",
		ink: "clay",
	},
	{
		turn: 15,
		name: "Diego",
		age: 29,
		says: "me duele un montón el oído derecho",
		ink: "sky",
	},
	{
		turn: 16,
		name: "El que vos inventes",
		says: "pedís un paciente a medida y te lo armamos",
		ink: "sage",
	},
];

export default function Home() {
	return (
		<main className="mx-auto w-full max-w-5xl overflow-x-clip px-5 pt-10 pb-16 sm:pt-16">
			<div className="grid gap-x-16 gap-y-14 md:grid-cols-[1.2fr_1fr]">
				<Letter />
				<WaitingRoom />
			</div>

			<p className="mt-20 max-w-xl text-muted-foreground text-xs leading-relaxed md:ml-auto md:text-right">
				Pac0 es una herramienta educativa de práctica: no reemplaza a pacientes
				reales ni a docentes. Los casos son ficticios y no se usan datos de
				pacientes reales.
			</p>
		</main>
	);
}

// Paco se presenta y cuenta, en primera persona, cómo es la consulta.
function Letter() {
	return (
		<div className="relative min-w-0">
			<Note className="absolute -top-7 right-4 z-10 rotate-3 text-pen">
				leé esto primero ↓
			</Note>
			<Paper
				tape="tape"
				tilt={-1.2}
				className="grid gap-5 px-7 pt-11 pb-8 sm:px-10 sm:pt-14 sm:pb-10"
			>
				<h1 className="font-display text-4xl leading-tight sm:text-5xl">
					Hola, soy Paco.
				</h1>
				<div className="grid max-w-prose gap-4 text-[1.05rem] leading-relaxed">
					<p>
						Soy tu paciente 0: el primero que vas a atender, antes de los de
						verdad. Hoy vengo porque me duele la garganta, aunque otros días me
						duele el oído o vengo apurado y de mal humor.
					</p>
					<p>
						Hablame como en el consultorio, en voz alta. Preguntame lo que
						necesites, y si me querés revisar,{" "}
						<Highlight>pedime permiso primero</Highlight>: me lo tomo en serio.
						Tenés una linterna para mirarme la garganta, un tensiómetro y un
						otoscopio.
					</p>
					<p>
						Cuando terminás, te cuento cómo te fue con tus propias frases: qué
						hiciste bien, qué te faltó preguntar y cómo hacerlo la próxima vez.
						Acá equivocarse no le hace mal a nadie.
					</p>
				</div>
				<div className="flex items-center gap-3 pt-2">
					<PacoFace className="size-12 -rotate-6" strokeWidth={2.8} />
					<span className="font-hand text-3xl leading-none">Paco</span>
				</div>
			</Paper>
		</div>
	);
}

// La sala de espera: cada paciente es un turno que se puede llamar.
function WaitingRoom() {
	return (
		<section aria-labelledby="sala" className="grid content-start gap-6">
			<div className="grid gap-1">
				<h2 id="sala" className="font-display text-3xl">
					En la sala de espera
				</h2>
				<p className="text-muted-foreground">
					Llamá al que quieras. Si es tu primera vez, empezá por Lucía.
				</p>
			</div>

			<ol className="grid gap-5">
				{WAITING.map((p, i) => (
					<li
						key={p.turn}
						style={{ transform: `rotate(${[0.8, -0.6, 0.4][i] ?? 0}deg)` }}
					>
						<Link
							href="/entrar"
							className="group grid grid-cols-[auto_1fr] items-center gap-4 rounded-xl border border-border bg-card py-4 pr-5 pl-4 shadow-[0_8px_20px_-16px_color-mix(in_oklch,var(--foreground)_50%,transparent)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						>
							<span
								className="grid h-full min-h-16 w-16 place-items-center border-border border-r border-dashed pr-4 text-center"
								aria-hidden="true"
							>
								<span className="font-hand text-muted-foreground text-sm leading-none">
									turno
								</span>
								<span
									className="font-display font-semibold text-3xl leading-none"
									style={{
										color: `color-mix(in oklch, var(--${p.ink}) 55%, var(--foreground))`,
									}}
								>
									{p.turn}
								</span>
							</span>
							<span className="grid gap-0.5">
								<span className="font-semibold">
									{p.name}
									{p.age ? `, ${p.age}` : ""}
								</span>
								<span className="font-hand text-muted-foreground text-xl leading-tight">
									{p.age ? `“${p.says}”` : p.says}
								</span>
								<span className="mt-1 text-pen text-sm underline decoration-1 underline-offset-4 group-hover:decoration-2">
									Hacer pasar
								</span>
							</span>
						</Link>
					</li>
				))}
			</ol>

			<ul className="grid gap-1 font-hand text-muted-foreground text-xl">
				<li>— hasta 8 minutos por consulta</li>
				<li>— entrás con un alias, sin mail ni contraseña</li>
				<li>— todos los pacientes son inventados</li>
			</ul>
		</section>
	);
}
