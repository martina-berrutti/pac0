"use client";

// Informe contra el tipo Report, con el estilo del cuaderno (frontend/).
// Orden: veredicto, tu diagnóstico, la lista de odinofagia y el
// orden de la consulta si los hay, puntajes, lo que hiciste bien, lo que
// hiciste mal, puntos a mejorar, datos clave, lista de cotejo y el caso.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import LoadError from "@/components/load-error";
import Loader from "@/components/loader";
import {
	Grade,
	Highlight,
	linkButtonClass,
	Note,
	Page,
	Paper,
} from "@/frontend/ui";
import { ApiError, api } from "@/lib/api-client";
import type {
	ConsultationOrder,
	DiagnosisFeedback,
	Odinofagia,
	Rapport,
	RapportEntry,
	Report,
} from "@/lib/contracts/report";

const LABELS = {
	anamnesis: "Anamnesis",
	examen: "Examen físico",
	razonamiento: "Razonamiento",
	comunicacion: "Comunicación",
} as const;
const STATUS = {
	si: { label: "sí", className: "text-success" },
	parcial: { label: "a medias", className: "text-accent-foreground" },
	no: { label: "no", className: "text-pen" },
} as const;
const RESULT: Record<DiagnosisFeedback["result"], string> = {
	acertaste: "Acertaste el diagnóstico",
	cerca: "Estuviste cerca",
	otro_diagnostico: "El diagnóstico era otro",
	sin_hipotesis: "Sin diagnóstico",
};
// Una línea de aliento debajo del veredicto.
const CHEER: Record<Report["verdict"], string> = {
	lo_hiciste_bien: "Muy buena consulta. Mirá qué salió bien y seguí así.",
	error_critico: "Buen trabajo, pero hay algo que no se puede pasar por alto.",
	casi: "Estás cerca: con estos ajustes la próxima sale redonda.",
	a_repasar: "Todos empezamos por acá. Arrancá por estos puntos.",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h2 className="font-display text-2xl">{children}</h2>;
}

function DiagnosisSection({ d }: { d: DiagnosisFeedback }) {
	const right = d.result === "acertaste";
	return (
		<Paper tape={right ? "sage" : "clay"} className="grid gap-3 px-6 pt-8 pb-6">
			<Note className={right ? "text-success" : "text-pen"}>
				tu diagnóstico
			</Note>
			<h2 className="font-display text-2xl">{RESULT[d.result]}</h2>
			{d.yours && (
				<p>
					Planteaste: <span className="font-hand text-xl">“{d.yours}”</span>
				</p>
			)}
			<p className="text-muted-foreground">{d.message}</p>
			{d.differentialsHit.length > 0 && (
				<p className="text-sm">
					Diferenciales que pensaste: {d.differentialsHit.join(", ")}.
				</p>
			)}
			{d.differentialsMissed.length > 0 && (
				<div className="grid gap-1 text-sm">
					<p>Diferenciales que te faltaron:</p>
					<ul className="grid gap-1 pl-4">
						{d.differentialsMissed.map((x) => (
							<li key={x.differential} className="list-['–_']">
								<span className="font-medium">{x.differential}</span>
								{x.hint && (
									<span className="text-muted-foreground"> — {x.hint}</span>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
			{d.mismatch && (
				<div className="grid gap-1 border-pen border-l-[3px] py-1 pl-4">
					<Note className="text-pen">lo que dijiste y lo que escribiste</Note>
					<p className="text-sm">{d.mismatch.message}</p>
				</div>
			)}
			{d.spoken && d.spoken.length > 0 ? (
				<div className="grid gap-1 text-sm">
					<p>Lo que le dijiste al paciente en la consulta:</p>
					<ul className="grid gap-1">
						{d.spoken.map((s) => (
							<li
								key={`${s.turnId}-${s.quote}`}
								className="grid grid-cols-[1.5rem_1fr] gap-x-2"
							>
								<span
									className={`font-hand text-xl leading-5 ${
										s.verdict === "correcto"
											? "text-success"
											: s.verdict === "diferencial"
												? "text-muted-foreground"
												: "text-pen"
									}`}
								>
									{s.verdict === "correcto"
										? "✓"
										: s.verdict === "diferencial"
											? "~"
											: "✗"}
								</span>
								<span>
									<q className="text-muted-foreground">{s.quote}</q>
									{s.verdict === "diferencial" && s.differential && (
										<span className="text-muted-foreground">
											{" "}
											(un diferencial para pensar: {s.differential})
										</span>
									)}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : d.toldPatient ? (
				<p className="text-sm">
					{d.toldPatient.correct
						? "Le explicaste bien al paciente qué tiene: "
						: "Lo que le dijiste al paciente no era correcto: "}
					<q className="text-muted-foreground">{d.toldPatient.quote}</q>
				</p>
			) : null}
		</Paper>
	);
}

const RAPPORT_LEVEL: Record<Rapport["level"], string> = {
	muy_bueno: "Muy buen trato",
	bueno: "Buen trato",
	mejorable: "Trato mejorable",
	a_trabajar: "Trato a trabajar",
};

function RapportEntries({
	entries,
	sign,
}: {
	entries: RapportEntry[];
	sign: "+" | "−";
}) {
	return (
		<ul className="grid gap-3">
			{entries.map((e) => (
				<li
					key={`${e.text}-${e.evidence[0]?.turnId ?? e.evidence[0]?.examActionId ?? ""}`}
					className="grid grid-cols-[2.5rem_1fr] gap-x-2"
				>
					<span
						className={`font-hand text-xl leading-6 ${sign === "+" ? "text-success" : "text-pen"}`}
					>
						{e.critical
							? "!"
							: e.points
								? `${sign}${e.points}`
								: sign === "+"
									? "✓"
									: "·"}
					</span>
					<span>
						{e.critical && <Note className="text-pen">error crítico </Note>}
						{e.text}
						{e.evidence[0]?.quote && (
							<span className="block font-hand text-lg text-muted-foreground">
								“{e.evidence[0].quote}”
							</span>
						)}
					</span>
				</li>
			))}
		</ul>
	);
}

// Cómo trató al paciente: lo que sumó y lo que restó en comunicación.
function RapportSection({ r }: { r: Rapport }) {
	const good = r.level === "muy_bueno" || r.level === "bueno";
	const pct = (x: number) => Math.round(x * 100);
	return (
		<Paper tape={good ? "sage" : "clay"} className="grid gap-4 px-6 pt-8 pb-6">
			<Note className={good ? "text-success" : "text-pen"}>
				cómo trataste al paciente
			</Note>
			<h2 className="font-display text-2xl">{RAPPORT_LEVEL[r.level]}</h2>
			<p className="text-muted-foreground">{r.summary}</p>

			<div className="grid gap-1.5">
				<div className="flex items-baseline justify-between text-sm">
					<span className="font-medium">Confianza del paciente en vos</span>
					<span className="font-hand text-xl leading-none">
						{pct(r.trust.start)}% → {pct(r.trust.end)}%
					</span>
				</div>
				<div className="relative h-2 rounded-full bg-muted">
					<div
						className={`h-2 rounded-full ${r.trust.end >= r.trust.start ? "bg-success" : "bg-pen"}`}
						style={{ width: `${pct(r.trust.end)}%` }}
					/>
					<div
						className="absolute top-[-3px] h-[14px] w-0.5 bg-foreground/60"
						style={{ left: `${pct(r.trust.start)}%` }}
						title="Al empezar"
					/>
				</div>
			</div>

			{r.plus.length > 0 && (
				<div className="grid gap-2">
					<p className="font-medium">
						Sumó{r.bonus > 0 ? ` (+${r.bonus} en comunicación)` : ""}
					</p>
					<RapportEntries entries={r.plus} sign="+" />
				</div>
			)}
			{r.minus.length > 0 && (
				<div className="grid gap-2">
					<p className="font-medium">
						Restó{r.penalty > 0 ? ` (−${r.penalty} en comunicación)` : ""}
					</p>
					<RapportEntries entries={r.minus} sign="−" />
				</div>
			)}
			<p className="text-sm">
				<span className="font-medium">La próxima vez:</span> {r.tip}
			</p>
		</Paper>
	);
}

const MARK = {
	si: { sign: "✓", className: "text-success" },
	parcial: { sign: "½", className: "text-accent-foreground" },
	no: { sign: "✗", className: "text-pen" },
} as const;

// Odinofagia: los bloques de la lista.
function OdinofagiaSection({ o }: { o: Odinofagia }) {
	return (
		<section className="grid gap-4">
			<SectionTitle>Lista de odinofagia</SectionTitle>
			<ul className="grid gap-4">
				{o.blocks.map((b) => (
					<li key={b.key} className="grid gap-1.5">
						<p className="flex items-baseline gap-2 font-medium">
							<span
								className={`font-hand text-2xl leading-6 ${MARK[b.status].className}`}
							>
								{MARK[b.status].sign}
							</span>
							{b.title}
						</p>
						<ul className="grid gap-1 pl-8 text-sm">
							{b.checks.map((c) => (
								<li key={c.label} className="grid grid-cols-[1.25rem_1fr]">
									<span className={MARK[c.status].className}>
										{MARK[c.status].sign}
									</span>
									<span>
										{c.label}
										{c.detail && (
											<span className="text-muted-foreground">
												{" "}
												· {c.detail}
											</span>
										)}
									</span>
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</section>
	);
}

const mmss = (ms: number) => {
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// En qué orden hizo la consulta: se destaca, no resta puntos.
function OrderSection({ o }: { o: ConsultationOrder }) {
	return (
		<section className="grid gap-3">
			<SectionTitle>Orden de la consulta</SectionTitle>
			<ol className="flex flex-wrap items-center gap-2 text-sm">
				{o.steps.map((s, i) => (
					<li key={s.key} className="flex items-center gap-2">
						{i > 0 && <span className="text-muted-foreground">→</span>}
						<span
							className={`rounded-full border px-3 py-1 ${s.atMs === null ? "border-dashed text-muted-foreground" : "bg-secondary"}`}
						>
							{s.title}{" "}
							<span className="text-muted-foreground">
								{s.atMs === null ? "(no lo hiciste)" : mmss(s.atMs)}
							</span>
						</span>
					</li>
				))}
			</ol>
			{o.ok ? (
				<p className="font-hand text-success text-xl">
					✓ Buen orden: primero preguntaste y después examinaste.
				</p>
			) : (
				<ul className="grid gap-1">
					{o.notes.map((n) => (
						<li key={n} className="grid grid-cols-[1.5rem_1fr] gap-x-2">
							<span className="font-hand text-pen text-xl leading-6">!</span>
							<span>{n}</span>
						</li>
					))}
				</ul>
			)}
			<p className="text-muted-foreground text-xs">
				La consulta se puede hacer en cualquier orden; esto no resta puntos.
			</p>
		</section>
	);
}

function CluesSection({ d }: { d: DiagnosisFeedback }) {
	if (d.cluesFound.length + d.cluesMissed.length === 0) return null;
	return (
		<section className="grid gap-3">
			<SectionTitle>Datos clave del caso</SectionTitle>
			<p className="text-muted-foreground text-sm">
				Lo que llevaba al diagnóstico y por qué.
			</p>
			<ul className="grid gap-3">
				{d.cluesFound.map((k) => (
					<li key={k.clue} className="grid grid-cols-[1.5rem_1fr] gap-x-2">
						<span className="font-hand text-2xl text-success leading-6">✓</span>
						<span className="font-medium">
							{k.clue}
							{!k.usedInClosing && (
								<span className="font-normal text-muted-foreground">
									{" "}
									(lo encontraste, pero no lo usaste para justificar)
								</span>
							)}
						</span>
						<span />
						<span className="text-muted-foreground text-sm">{k.why}</span>
					</li>
				))}
				{d.cluesMissed.map((k) => (
					<li key={k.clue} className="grid grid-cols-[1.5rem_1fr] gap-x-2">
						<span className="font-hand text-2xl text-pen leading-6">✗</span>
						<span className="font-medium">{k.clue} (no lo buscaste)</span>
						<span />
						<span className="text-muted-foreground text-sm">{k.why}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

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

	// Lo que hizo bien además de lo destacado: el resto de los ítems cumplidos.
	const highlighted = new Set(report.strengths.map((s) => s.text));
	const alsoDone = report.items.filter(
		(i) => i.status === "si" && !highlighted.has(`Bien: ${i.item}.`),
	);
	const mistakes = [...report.mistakes].sort(
		(a, b) => Number(b.critical) - Number(a.critical),
	);

	return (
		<Page size="md" className="gap-12">
			<section className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
				<Grade value={report.total} />
				<div className="grid gap-2">
					<h1 className="text-balance font-display text-3xl leading-tight sm:text-4xl">
						{report.verdictMessage}
					</h1>
					<p className="text-muted-foreground">{CHEER[report.verdict]}</p>
					<p className="text-muted-foreground text-xs">
						Evaluado {report.judge === "ia" ? "con IA" : "por reglas"}; el
						puntaje lo calcula siempre el código.
					</p>
				</div>
			</section>

			{report.diagnosis && <DiagnosisSection d={report.diagnosis} />}

			{report.odinofagia && <OdinofagiaSection o={report.odinofagia} />}

			{report.order && <OrderSection o={report.order} />}

			<section className="grid gap-4" aria-label="Puntaje por dimensión">
				{(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((d) => (
					<div key={d} className="grid gap-1.5">
						<div className="flex items-baseline justify-between">
							<span className="font-medium">{LABELS[d]}</span>
							<span className="font-hand text-2xl leading-none">
								{report.scores[d]}
							</span>
						</div>
						<div className="h-2 rounded-full bg-muted">
							<div
								className="h-2 rounded-full bg-primary"
								style={{ width: `${report.scores[d]}%` }}
							/>
						</div>
					</div>
				))}
			</section>

			{report.rapport && <RapportSection r={report.rapport} />}

			{(report.strengths.length > 0 || alsoDone.length > 0) && (
				<section className="grid gap-3">
					<SectionTitle>Lo que hiciste bien</SectionTitle>
					<ul className="grid gap-2">
						{report.strengths.map((s) => (
							<li key={s.text} className="grid grid-cols-[1.5rem_1fr] gap-x-2">
								<span className="font-hand text-2xl text-success leading-6">
									✓
								</span>
								<span>
									<Highlight>{s.text}</Highlight>
									{s.evidence.quote && (
										<span className="block font-hand text-lg text-muted-foreground">
											“{s.evidence.quote}”
										</span>
									)}
								</span>
							</li>
						))}
						{alsoDone.map((i) => (
							<li
								key={i.itemId}
								className="grid grid-cols-[1.5rem_1fr] gap-x-2 text-muted-foreground"
							>
								<span className="font-hand text-2xl text-success leading-6">
									✓
								</span>
								<span>También: {i.item}.</span>
							</li>
						))}
					</ul>
				</section>
			)}

			<section className="grid gap-3">
				<SectionTitle>Lo que hiciste mal</SectionTitle>
				{mistakes.length === 0 ? (
					<p className="font-hand text-2xl text-success">Nada para marcar.</p>
				) : (
					<ul className="grid gap-4">
						{mistakes.map((m) => (
							<li
								// Un error por turno ("Pregunta sugestiva." puede repetirse):
								// el turno o el examen lo distinguen.
								key={`${m.tag}-${m.evidence[0]?.turnId ?? m.evidence[0]?.examActionId ?? ""}-${m.what}`}
								className={`grid gap-2 border-l-[3px] py-1 pl-4 ${m.critical ? "border-pen" : "border-border"}`}
							>
								{m.critical && <Note className="text-pen">error crítico</Note>}
								<p className="font-medium">{m.what}</p>
								{m.evidence[0]?.quote && (
									<p className="font-hand text-lg text-muted-foreground">
										Dijiste: “{m.evidence[0].quote}”
									</p>
								)}
								<p className="text-muted-foreground text-sm">
									<span className="font-medium text-foreground">
										Por qué importa:
									</span>{" "}
									{m.why}
								</p>
								<p className="text-sm">
									<span className="font-medium">La próxima vez:</span>{" "}
									{m.nextTime}
								</p>
								{m.source && (
									<p className="text-muted-foreground text-xs">
										Fuente: {m.source}
									</p>
								)}
							</li>
						))}
					</ul>
				)}
			</section>

			{report.improvements && report.improvements.length > 0 && (
				<Paper tape="tape" tilt={-0.5} className="grid gap-3 px-6 pt-8 pb-6">
					<SectionTitle>Puntos a mejorar</SectionTitle>
					<ol className="grid gap-2">
						{report.improvements.map((x, i) => (
							<li key={x} className="grid grid-cols-[1.75rem_1fr] gap-x-1">
								<span className="font-hand text-2xl text-pen leading-6">
									{i + 1}.
								</span>
								<span>{x}</span>
							</li>
						))}
					</ol>
				</Paper>
			)}

			{report.diagnosis && <CluesSection d={report.diagnosis} />}

			{report.notices && report.notices.length > 0 && (
				<section className="grid gap-2">
					<SectionTitle>Avisos</SectionTitle>
					<ul className="grid gap-1 text-muted-foreground text-sm">
						{report.notices.map((n) => (
							<li key={n}>{n}</li>
						))}
					</ul>
				</section>
			)}

			<details className="group border-border border-y border-dashed py-4">
				<summary className="flex cursor-pointer list-none items-center justify-between font-display text-xl">
					Lista de cotejo
					<span className="font-hand text-lg text-muted-foreground group-open:hidden">
						ver todo
					</span>
				</summary>
				<ul className="mt-4 grid text-sm">
					{report.items.map((i) => (
						<li
							key={i.itemId}
							className="flex items-baseline justify-between gap-3 border-border border-b border-dotted py-2 last:border-0"
						>
							<span>{i.item}</span>
							<span
								className={`font-hand text-xl ${STATUS[i.status].className}`}
							>
								{STATUS[i.status].label}
							</span>
						</li>
					))}
				</ul>
			</details>

			<section className="grid gap-2">
				<Note className="text-pen">el caso era…</Note>
				<p className="font-display text-3xl first-letter:uppercase">
					{report.truth.diagnosis}
				</p>
				<p className="text-muted-foreground">
					Diferenciales: {report.truth.differentials.join(", ")}.
				</p>
				<p className="text-muted-foreground text-xs">
					No se pudo medir por voz: {report.notMeasurable.join(", ")}.
				</p>
			</section>

			<Link href="/casos" className={`${linkButtonClass("primary")} w-fit`}>
				Practicar con otro paciente
			</Link>
		</Page>
	);
}
