"use client";

import {
	AlertTriangle,
	BookOpen,
	Brain,
	CheckCircle2,
	ChevronDown,
	HeartHandshake,
	Info,
	Lightbulb,
	MessagesSquare,
	RotateCcw,
	Stethoscope,
	Target,
	Trophy,
} from "lucide-react";
// Informe contra el tipo Report, con la identidad de Pac0 (frontend/).
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import LoadError from "@/components/load-error";
import Loader from "@/components/loader";
import { linkButtonClass, Page, Pill, ScoreRing, Surface } from "@/frontend/ui";
import { ApiError, api } from "@/lib/api-client";
import type { Report } from "@/lib/contracts/report";

const DIMENSIONS = {
	anamnesis: {
		label: "Anamnesis",
		icon: MessagesSquare,
		color: "var(--primary)",
	},
	examen: { label: "Examen físico", icon: Stethoscope, color: "var(--coral)" },
	razonamiento: { label: "Razonamiento", icon: Brain, color: "var(--sun)" },
	comunicacion: {
		label: "Comunicación",
		icon: HeartHandshake,
		color: "var(--success)",
	},
} as const;

const STATUS = {
	si: { label: "Sí", tone: "mint" },
	parcial: { label: "A medias", tone: "sun" },
	no: { label: "No", tone: "coral" },
} as const;

const VERDICT_TONE = {
	lo_hiciste_bien: "success",
	error_critico: "coral",
	casi: "sun",
	a_repasar: "coral",
} as const;

const VERDICT_CHEER = {
	lo_hiciste_bien: "¡Excelente consulta! Mirá qué salió bien y seguí así.",
	error_critico:
		"Muy buen trabajo, pero hay un error que no se puede pasar por alto.",
	casi: "Estás muy cerca. Con estos ajustes la próxima sale redonda.",
	a_repasar:
		"Todos empezamos por acá. Arrancá por estos puntos y volvé a intentar.",
} as const;

export default function ReportPage() {
	const { id } = useParams<{ id: string }>();
	const [report, setReport] = useState<Report | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		api
			.report(id)
			.then((r) => setReport(r.report))
			.catch((e) =>
				setLoadError(
					e instanceof ApiError ? e.message : "No pudimos abrir el informe.",
				),
			);
	}, [id]);

	if (loadError) return <LoadError message={loadError} />;
	if (!report) return <Loader />;

	const tone = VERDICT_TONE[report.verdict];
	return (
		<Page size="lg" className="gap-8">
			<Surface className="grid animate-rise items-center gap-6 overflow-hidden p-6 sm:grid-cols-[auto_1fr] sm:p-8">
				<ScoreRing value={report.total} tone={tone} label="Puntaje total" />
				<div className="grid gap-3">
					<Pill tone={tone === "success" ? "mint" : tone} className="w-fit">
						{tone === "success" ? (
							<Trophy className="size-3.5" aria-hidden="true" />
						) : (
							<Target className="size-3.5" aria-hidden="true" />
						)}
						Tu informe
					</Pill>
					<h1 className="text-balance font-bold text-3xl leading-tight sm:text-4xl">
						{report.verdictMessage}
					</h1>
					<p className="text-muted-foreground">
						{VERDICT_CHEER[report.verdict]}
					</p>
					<p className="text-muted-foreground text-xs">
						Evaluado {report.judge === "ia" ? "con IA" : "por reglas"}; el
						puntaje lo calcula siempre el código.
					</p>
				</div>
			</Surface>

			<section
				className="grid gap-3 sm:grid-cols-2"
				aria-label="Puntaje por dimensión"
			>
				{(Object.keys(DIMENSIONS) as (keyof typeof DIMENSIONS)[]).map((d) => {
					const { label, icon: Icon, color } = DIMENSIONS[d];
					return (
						<Surface key={d} className="grid gap-3 p-4">
							<div className="flex items-center justify-between gap-2">
								<span className="flex items-center gap-2 font-semibold">
									<Icon
										className="size-4"
										style={{ color }}
										aria-hidden="true"
									/>
									{label}
								</span>
								<span className="font-bold font-display text-xl">
									{report.scores[d]}
								</span>
							</div>
							<div className="h-2.5 overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full transition-[width] duration-1000 ease-out"
									style={{ width: `${report.scores[d]}%`, background: color }}
								/>
							</div>
						</Surface>
					);
				})}
			</section>

			{report.strengths.length > 0 && (
				<section className="grid gap-3">
					<h2 className="font-bold text-2xl">Lo que hiciste bien</h2>
					<ul className="grid gap-3 md:grid-cols-3">
						{report.strengths.map((s) => (
							<Surface
								as="li"
								key={s.text}
								className="grid content-start gap-2 p-4"
							>
								<CheckCircle2
									className="size-5 text-success"
									aria-hidden="true"
								/>
								<p className="font-medium">{s.text}</p>
								{s.evidence.quote && (
									<q className="text-muted-foreground text-sm italic">
										{s.evidence.quote}
									</q>
								)}
							</Surface>
						))}
					</ul>
				</section>
			)}

			{(report.notices?.length ?? 0) > 0 && (
				<ul className="grid gap-2">
					{report.notices?.map((n) => (
						<li
							key={n}
							className="flex gap-2.5 rounded-2xl bg-sun-soft p-3.5 text-sm"
						>
							<Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							{n}
						</li>
					))}
				</ul>
			)}

			{report.mistakes.length > 0 && (
				<section className="grid gap-3">
					<h2 className="font-bold text-2xl">Para la próxima</h2>
					<ul className="grid gap-3">
						{report.mistakes.map((m) => (
							<Surface
								as="li"
								key={`${m.tag}-${m.what}`}
								className={
									m.critical
										? "grid gap-3 border-destructive/50 bg-destructive/5 p-4"
										: "grid gap-3 p-4"
								}
							>
								<div className="flex items-start gap-3">
									{m.critical ? (
										<AlertTriangle
											className="mt-0.5 size-5 shrink-0 text-destructive"
											aria-hidden="true"
										/>
									) : (
										<Lightbulb
											className="mt-0.5 size-5 shrink-0 text-warning"
											aria-hidden="true"
										/>
									)}
									<div className="grid gap-1">
										{m.critical && (
											<Pill tone="coral" className="w-fit">
												Error crítico
											</Pill>
										)}
										<p className="font-semibold">{m.what}</p>
										{m.evidence.find((e) => e.quote)?.quote && (
											<q className="text-muted-foreground text-sm italic">
												{m.evidence.find((e) => e.quote)?.quote}
											</q>
										)}
									</div>
								</div>
								<div className="grid gap-2 text-sm sm:grid-cols-2">
									<p className="rounded-2xl bg-muted p-3">
										<span className="block font-semibold text-xs uppercase tracking-wide">
											Por qué importa
										</span>
										{m.why}
									</p>
									<p className="rounded-2xl bg-secondary p-3 text-secondary-foreground">
										<span className="block font-semibold text-xs uppercase tracking-wide">
											La próxima vez
										</span>
										{m.nextTime}
									</p>
								</div>
								{m.source && (
									<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
										<BookOpen className="size-3.5" aria-hidden="true" />
										{m.source}
									</p>
								)}
							</Surface>
						))}
					</ul>
				</section>
			)}

			<details className="group rounded-3xl border bg-card p-5">
				<summary className="flex cursor-pointer list-none items-center justify-between font-bold font-display text-lg">
					Lista de cotejo completa
					<ChevronDown
						className="size-5 transition-transform group-open:rotate-180"
						aria-hidden="true"
					/>
				</summary>
				<ul className="mt-4 grid gap-1 text-sm">
					{report.items.map((i) => (
						<li
							key={i.itemId}
							className="flex items-center justify-between gap-3 border-b py-2 last:border-0"
						>
							<span>{i.item}</span>
							<Pill tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Pill>
						</li>
					))}
				</ul>
			</details>

			<Surface className="grid gap-2 bg-gradient-to-br from-secondary to-mint-soft">
				<p className="font-semibold text-primary text-xs uppercase tracking-[0.16em]">
					El caso era
				</p>
				<p className="font-bold font-display text-2xl first-letter:uppercase">
					{report.truth.diagnosis}
				</p>
				<p className="text-muted-foreground text-sm">
					Diferenciales: {report.truth.differentials.join(", ")}.
				</p>
				<p className="text-muted-foreground text-xs">
					No se pudo medir por voz: {report.notMeasurable.join(", ")}.
				</p>
			</Surface>

			<div className="flex flex-wrap justify-center gap-3">
				<Link href="/casos" className={linkButtonClass("primary")}>
					<RotateCcw className="size-4" aria-hidden="true" />
					Practicar otra vez
				</Link>
			</div>
		</Page>
	);
}
