"use client";

// Informe contra el tipo Report. Versión funcional; la Persona 3 la diseña.
// Orden: veredicto, tu diagnóstico, puntajes, lo que hiciste bien, lo que
// hiciste mal, puntos a mejorar, datos clave, lista de cotejo y el caso.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import LoadError from "@/components/load-error";
import Loader from "@/components/loader";
import { ApiError, api } from "@/lib/api-client";
import type { DiagnosisFeedback, Report } from "@/lib/contracts/report";

const LABELS = {
	anamnesis: "Anamnesis",
	examen: "Examen físico",
	razonamiento: "Razonamiento",
	comunicacion: "Comunicación",
} as const;
const STATUS = { si: "Sí", parcial: "Parcial", no: "No" } as const;
const RESULT: Record<DiagnosisFeedback["result"], string> = {
	acertaste: "Acertaste el diagnóstico",
	cerca: "Estuviste cerca",
	otro_diagnostico: "El diagnóstico era otro",
	sin_hipotesis: "Sin diagnóstico",
};

function DiagnosisSection({ d }: { d: DiagnosisFeedback }) {
	return (
		<section
			className={
				d.result === "acertaste"
					? "grid gap-2 border border-primary p-3"
					: "grid gap-2 border p-3"
			}
		>
			<h2 className="font-medium">Tu diagnóstico: {RESULT[d.result]}</h2>
			{d.yours && (
				<p className="text-sm">
					Planteaste: <q>{d.yours}</q>
				</p>
			)}
			<p className="text-sm">{d.message}</p>
			{d.differentialsHit.length > 0 && (
				<p className="text-sm">
					Diferenciales que pensaste: {d.differentialsHit.join(", ")}.
				</p>
			)}
			{d.differentialsMissed.length > 0 && (
				<div className="text-sm">
					<p>Diferenciales que te faltaron:</p>
					<ul className="list-disc pl-5">
						{d.differentialsMissed.map((x) => (
							<li key={x.differential}>
								<span className="font-medium">{x.differential}</span>
								{x.hint && (
									<span className="text-muted-foreground"> — {x.hint}</span>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
			{d.toldPatient && (
				<p className="text-sm">
					{d.toldPatient.correct
						? "Le explicaste bien al paciente qué tiene: "
						: "Lo que le dijiste al paciente no era correcto: "}
					<q className="text-muted-foreground">{d.toldPatient.quote}</q>
				</p>
			)}
		</section>
	);
}

function CluesSection({ d }: { d: DiagnosisFeedback }) {
	if (d.cluesFound.length + d.cluesMissed.length === 0) return null;
	return (
		<section>
			<h2 className="font-medium">Datos clave del caso</h2>
			<p className="text-muted-foreground text-xs">
				Lo que llevaba al diagnóstico y por qué.
			</p>
			<ul className="grid gap-1 text-sm">
				{d.cluesFound.map((k) => (
					<li key={k.clue}>
						<span className="font-medium">✓ {k.clue}</span>
						{!k.usedInClosing && (
							<span className="text-muted-foreground">
								{" "}
								(lo encontraste, pero no lo usaste para justificar)
							</span>
						)}
						<p className="text-muted-foreground">{k.why}</p>
					</li>
				))}
				{d.cluesMissed.map((k) => (
					<li key={k.clue}>
						<span className="font-medium">✗ {k.clue} (no lo buscaste)</span>
						<p className="text-muted-foreground">{k.why}</p>
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
		<div className="container mx-auto grid max-w-2xl content-start gap-6 px-4 py-6">
			<section>
				<h1 className="font-semibold text-2xl">{report.verdictMessage}</h1>
				<p className="text-4xl">{report.total}%</p>
				<p className="text-muted-foreground text-xs">
					Evaluado con el juez {report.judge === "ia" ? "con IA" : "por reglas"}
					.
				</p>
			</section>

			{report.diagnosis && <DiagnosisSection d={report.diagnosis} />}

			<section className="grid gap-2">
				{(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((d) => (
					<div key={d}>
						<div className="flex justify-between text-sm">
							<span>{LABELS[d]}</span>
							<span>{report.scores[d]}%</span>
						</div>
						<div className="h-2 bg-muted">
							<div
								className="h-2 bg-primary"
								style={{ width: `${report.scores[d]}%` }}
							/>
						</div>
					</div>
				))}
			</section>

			{(report.strengths.length > 0 || alsoDone.length > 0) && (
				<section>
					<h2 className="font-medium">Lo que hiciste bien</h2>
					<ul className="list-disc pl-5 text-sm">
						{report.strengths.map((s) => (
							<li key={s.text}>
								{s.text}{" "}
								{s.evidence.quote && (
									<q className="text-muted-foreground">{s.evidence.quote}</q>
								)}
							</li>
						))}
						{alsoDone.map((i) => (
							<li key={i.itemId} className="text-muted-foreground">
								También: {i.item}.
							</li>
						))}
					</ul>
				</section>
			)}

			<section>
				<h2 className="font-medium">Lo que hiciste mal</h2>
				{mistakes.length === 0 ? (
					<p className="text-sm">Nada para marcar.</p>
				) : (
					<ul className="grid gap-2 text-sm">
						{mistakes.map((m) => (
							<li
								key={`${m.tag}-${m.what}`}
								className={
									m.critical ? "border border-destructive p-2" : "border p-2"
								}
							>
								<p className="font-medium">
									{m.critical && "Error crítico: "}
									{m.what}
								</p>
								{m.evidence[0]?.quote && (
									<p>
										Dijiste: <q>{m.evidence[0].quote}</q>
									</p>
								)}
								<p className="text-muted-foreground">
									Por qué importa: {m.why}
								</p>
								<p className="text-muted-foreground">{m.nextTime}</p>
							</li>
						))}
					</ul>
				)}
			</section>

			{report.improvements && report.improvements.length > 0 && (
				<section>
					<h2 className="font-medium">Puntos a mejorar</h2>
					<ol className="list-decimal pl-5 text-sm">
						{report.improvements.map((x) => (
							<li key={x}>{x}</li>
						))}
					</ol>
				</section>
			)}

			{report.diagnosis && <CluesSection d={report.diagnosis} />}

			{report.notices && report.notices.length > 0 && (
				<section className="text-sm">
					<h2 className="font-medium">Avisos</h2>
					<ul className="list-disc pl-5">
						{report.notices.map((n) => (
							<li key={n}>{n}</li>
						))}
					</ul>
				</section>
			)}

			<section>
				<h2 className="font-medium">Lista de cotejo</h2>
				<ul className="text-sm">
					{report.items.map((i) => (
						<li
							key={i.itemId}
							className="flex justify-between gap-2 border-b py-1"
						>
							<span>{i.item}</span>
							<span className="text-muted-foreground">{STATUS[i.status]}</span>
						</li>
					))}
				</ul>
			</section>

			<section className="text-sm">
				<h2 className="font-medium">El caso era</h2>
				<p>
					{report.truth.diagnosis}. Diferenciales:{" "}
					{report.truth.differentials.join(", ")}.
				</p>
				<p className="text-muted-foreground text-xs">
					No se pudo medir por texto: {report.notMeasurable.join(", ")}.
				</p>
			</section>

			<Link href="/casos" className="underline">
				Volver a los casos
			</Link>
		</div>
	);
}
