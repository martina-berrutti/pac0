import Link from "next/link";

import { Paper } from "@/frontend/ui";
import { photoFor } from "@/lib/exam/oropharynx";

// Quién espera. Son los casos del banco (cases/*.json); elegir uno lleva a
// entrar y de ahí a la lista de casos.
const WAITING = [
	{ name: "Lucía", age: 24, says: "Me duele la garganta y estoy con mocos" },
	{ name: "Diego", age: 29, says: "Me duele un montón el oído derecho" },
];

const PHOTO = photoFor("throat-exudate-01");

export default function Home() {
	return (
		<main className="mx-auto grid w-full max-w-5xl gap-16 overflow-x-clip px-5 pt-12 pb-14 sm:pt-20 md:grid-cols-[1fr_1.05fr] md:items-center">
			<div className="grid min-w-0 content-start gap-8">
				<div className="grid gap-3">
					<h1 className="font-display text-5xl sm:text-6xl">¿Quién sigue?</h1>
					<p className="max-w-sm text-lg text-muted-foreground">
						Pacientes simulados para practicar la entrevista clínica por voz.
					</p>
				</div>

				<ul className="grid border-border border-t">
					{WAITING.map((p) => (
						<li key={p.name} className="border-border border-b">
							<Link
								href="/entrar"
								className="group flex items-center justify-between gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								<span className="grid">
									<span className="font-display text-xl">
										{p.name}, {p.age}
									</span>
									<span className="text-muted-foreground">«{p.says}»</span>
								</span>
								<span
									aria-hidden="true"
									className="text-2xl text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground"
								>
									→
								</span>
							</Link>
						</li>
					))}
					<li className="border-border border-b">
						<Link
							href="/entrar"
							className="group flex items-center justify-between gap-4 py-4 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						>
							<span>O pedí uno a tu medida</span>
							<span
								aria-hidden="true"
								className="text-2xl transition-transform group-hover:translate-x-1"
							>
								→
							</span>
						</Link>
					</li>
				</ul>

				<p className="text-muted-foreground text-sm">
					Hasta 8 minutos por consulta. Entrás con un alias.
				</p>
			</div>

			<Preview />

			<p className="text-muted-foreground text-xs md:col-span-2">
				Herramienta educativa: no reemplaza a pacientes reales ni a docentes.
				Los casos son ficticios.
			</p>
		</main>
	);
}

// Lo que pasa en la consulta, sin explicarlo: la garganta con la linterna y
// la ficha corregida al final.
function Preview() {
	return (
		<div className="relative mx-auto w-full max-w-md pb-24 sm:pb-20">
			{PHOTO && (
				<figure>
					<div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
						{/* biome-ignore lint/performance/noImgElement: foto local fija, sin optimizar */}
						<img
							src={PHOTO.src}
							alt={PHOTO.alt}
							className="size-full object-cover"
						/>
						<div
							aria-hidden="true"
							className="absolute inset-0 bg-[radial-gradient(circle_at_42%_46%,transparent_17%,rgba(0,0,0,0.9)_33%)]"
						/>
						<figcaption className="absolute top-2 left-3 text-[0.68rem] text-white/70">
							Foto: {PHOTO.credit}
						</figcaption>
					</div>
				</figure>
			)}

			<Paper
				tilt={-3}
				className="absolute right-0 -bottom-2 w-[78%] max-w-xs px-5 pt-5 pb-4 sm:-right-6"
			>
				<div
					aria-hidden="true"
					className="grid gap-1 font-hand text-[1.3rem] leading-snug"
				>
					<p>✓ ¿desde cuándo te duele?</p>
					<p>✓ ¿tuviste fiebre?</p>
					<p>✓ pidió permiso para revisar</p>
					<p className="text-muted-foreground line-through decoration-pen">
						¿alergias?
					</p>
				</div>
				<span
					aria-hidden="true"
					className="absolute -top-6 -right-4 grid size-16 rotate-[-10deg] place-items-center rounded-[48%_52%_45%_55%/55%_45%_55%_45%] border-[2.5px] border-pen bg-card font-hand text-3xl text-pen"
				>
					87
				</span>
			</Paper>
		</div>
	);
}
