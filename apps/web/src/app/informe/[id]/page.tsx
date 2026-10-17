"use client";

// Informe contra el tipo Report. Versión funcional; la Persona 3 la diseña.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import LoadError from "@/components/load-error";
import Loader from "@/components/loader";
import { ApiError, api } from "@/lib/api-client";
import type { Report } from "@/lib/contracts/report";

const LABELS = {
	anamnesis: "Anamnesis",
	examen: "Examen físico",
	razonamiento: "Razonamiento",
	comunicacion: "Comunicación",
} as const;
const STATUS = { si: "Sí", parcial: "Parcial", no: "No" } as const;

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

			{report.strengths.length > 0 && (
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
					</ul>
				</section>
			)}

			<section>
				<h2 className="font-medium">Errores y omisiones</h2>
				<ul className="grid gap-2 text-sm">
					{report.mistakes.map((m) => (
						<li
							key={`${m.tag}-${m.what}`}
							className={
								m.critical ? "border border-destructive p-2" : "border p-2"
							}
						>
							<p className="font-medium">{m.what}</p>
							<p className="text-muted-foreground">Por qué importa: {m.why}</p>
							<p className="text-muted-foreground">{m.nextTime}</p>
						</li>
					))}
				</ul>
			</section>

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
