"use client";

// Consulta por texto (respaldo de la voz). Versión mínima de la Persona 1;
// la Persona 3 la diseña y la Persona 1 le suma la voz.
import { Button } from "@pac0/ui/components/button";
import { Input } from "@pac0/ui/components/input";
import { Textarea } from "@pac0/ui/components/textarea";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { OrofaringeView } from "@/components/exam/orofaringe-view";
import { OtoscopioView } from "@/components/exam/otoscopio-view";
import { TensiometroView } from "@/components/exam/tensiometro-view";
import Loader from "@/components/loader";
import { ApiError, api } from "@/lib/api-client";
import type { ExamResult } from "@/lib/contracts/exam";
import type { SessionView } from "@/server/consultation";

export default function ConsultationPage() {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();
	const [view, setView] = useState<SessionView | null>(null);
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const [exam, setExam] = useState<ExamResult | null>(null);
	const [measuringBp, setMeasuringBp] = useState(false);
	const closeBp = useCallback(() => setMeasuringBp(false), []);
	const [otoscopy, setOtoscopy] = useState(false);
	const tool = exam !== null || measuringBp || otoscopy;
	const [closing, setClosing] = useState(false);
	const [hypothesis, setHypothesis] = useState("");
	const [differentials, setDifferentials] = useState("");
	const bottom = useRef<HTMLDivElement>(null);

	useEffect(() => {
		api
			.session(id)
			.then((v) => {
				if (v.hasReport) router.replace(`/informe/${id}`);
				setView(v);
			})
			.catch((e) =>
				toast.error(
					e instanceof ApiError ? e.message : "No pudimos abrir la consulta.",
				),
			);
	}, [id, router]);

	useEffect(() => {
		if (view?.turns.length)
			bottom.current?.scrollIntoView({ behavior: "smooth" });
	}, [view?.turns.length]);

	async function send(event: React.FormEvent) {
		event.preventDefault();
		const message = text.trim();
		if (!message || !view) return;
		setSending(true);
		setText("");
		try {
			const r = await api.sendTurn(id, message);
			setView({
				...view,
				turns: [...view.turns, r.studentTurn, r.patientTurn],
			});
			if (r.exam) setExam(r.exam);
		} catch (e) {
			setText(message);
			toast.error(e instanceof ApiError ? e.message : "No se pudo enviar.");
		} finally {
			setSending(false);
		}
	}

	async function closeExam(times: Record<string, number>) {
		if (exam && exam.action.variant !== "negado") {
			await api
				.saveExamTimes(id, exam.action.id, times)
				.catch(() => toast.error("No se guardó el tiempo del examen."));
		}
		setExam(null);
	}

	async function finish(event: React.FormEvent) {
		event.preventDefault();
		setSending(true);
		try {
			const list = differentials
				.split(",")
				.map((d) => d.trim())
				.filter(Boolean);
			await api.finish(id, hypothesis, list);
			router.push(`/informe/${id}`);
		} catch (e) {
			toast.error(
				e instanceof ApiError ? e.message : "No se pudo cerrar la consulta.",
			);
			setSending(false);
		}
	}

	if (!view) return <Loader />;

	return (
		<div className="container mx-auto grid max-w-2xl content-start gap-4 px-4 py-4">
			<div>
				<h1 className="font-semibold text-xl">
					{view.case.patient.name}, {view.case.patient.age} años
				</h1>
				<p className="text-muted-foreground text-sm">
					{view.case.title} · quedan {Math.ceil(view.remainingMs / 60000)} min ·
					herramienta educativa, caso ficticio
				</p>
			</div>

			{exam ? (
				<OrofaringeView exam={exam} onClose={closeExam} />
			) : measuringBp ? (
				<TensiometroView sessionId={id} onClose={closeBp} />
			) : otoscopy ? (
				<OtoscopioView sessionId={id} onClose={() => setOtoscopy(false)} />
			) : (
				<>
					<ol className="grid max-h-[55svh] gap-2 overflow-y-auto border p-3">
						{view.turns.length === 0 && (
							<li className="text-muted-foreground text-sm">
								Presentate y empezá la entrevista. Para examinar, pedile que
								abra la boca (por ejemplo: “¿puedo revisarte? abrí la boca y
								decí aaa”).
							</li>
						)}
						{view.turns.map((t) => (
							<li
								key={t.id}
								className={
									t.speaker === "estudiante"
										? "justify-self-end bg-primary/10 px-3 py-2"
										: "justify-self-start bg-muted px-3 py-2"
								}
							>
								<span className="block text-muted-foreground text-xs">
									{t.speaker === "estudiante" ? "Vos" : view.case.patient.name}
								</span>
								{t.text}
							</li>
						))}
						<div ref={bottom} />
					</ol>
					<form onSubmit={send} className="flex gap-2">
						<Input
							value={text}
							onChange={(e) => setText(e.target.value)}
							placeholder="Escribí tu pregunta…"
							aria-label="Tu mensaje"
							disabled={sending}
						/>
						<Button type="submit" disabled={sending || !text.trim()}>
							Enviar
						</Button>
					</form>
				</>
			)}

			{!tool && !closing && (
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" onClick={() => setMeasuringBp(true)}>
						Tomar la presión
					</Button>
					<Button variant="outline" onClick={() => setOtoscopy(true)}>
						Examinar el oído
					</Button>
				</div>
			)}

			{!tool &&
				(closing ? (
					<form onSubmit={finish} className="grid gap-2 border p-3">
						<label htmlFor="hipotesis" className="font-medium">
							Tu hipótesis (y por qué)
						</label>
						<Textarea
							id="hipotesis"
							value={hypothesis}
							onChange={(e) => setHypothesis(e.target.value)}
							required
						/>
						<label htmlFor="diferenciales" className="font-medium">
							Diferenciales, separados por coma
						</label>
						<Input
							id="diferenciales"
							value={differentials}
							onChange={(e) => setDifferentials(e.target.value)}
						/>
						<Button type="submit" disabled={sending || !hypothesis.trim()}>
							Ver mi informe
						</Button>
					</form>
				) : (
					<Button variant="outline" onClick={() => setClosing(true)}>
						Terminar la consulta
					</Button>
				))}
		</div>
	);
}
