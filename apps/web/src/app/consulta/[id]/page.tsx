"use client";

// Consulta solo por voz; la transcripción se muestra para leer. Versión
// mínima de la Persona 1; la Persona 3 la diseña.
import { Button } from "@pac0/ui/components/button";
import { Input } from "@pac0/ui/components/input";
import { Textarea } from "@pac0/ui/components/textarea";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { OrofaringeView } from "@/components/exam/orofaringe-view";
import { OtoscopioView } from "@/components/exam/otoscopio-view";
import { TensiometroView } from "@/components/exam/tensiometro-view";
import LoadError from "@/components/load-error";
import Loader from "@/components/loader";
import { ApiError, api } from "@/lib/api-client";
import type { ExamResult } from "@/lib/contracts/exam";
import type { Turn } from "@/lib/contracts/session";
import { useVoice } from "@/lib/voice/use-voice";
import type { SessionView } from "@/server/consultation";
import type { BpStart } from "@/server/vitals";
import type { ToolUi } from "@/server/voice";

export default function ConsultationPage() {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();
	const [view, setView] = useState<SessionView | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [exam, setExam] = useState<ExamResult | null>(null);
	// Tensiómetro abierto: con la medición de medir_presion (voz) o sin ella
	// (botón).
	const [bp, setBp] = useState<{ start: BpStart | null } | null>(null);
	const closeBp = useCallback(() => setBp(null), []);
	const [otoscopy, setOtoscopy] = useState(false);
	const tool = exam !== null || bp !== null || otoscopy;
	const [closing, setClosing] = useState(false);
	const [hypothesis, setHypothesis] = useState("");
	const [differentials, setDifferentials] = useState("");
	const bottom = useRef<HTMLDivElement>(null);

	const voice = useVoice({
		sessionId: id,
		onTurn: (turn: Turn) =>
			setView((v) => (v ? { ...v, turns: [...v.turns, turn] } : v)),
		onTool: (ui: ToolUi) => {
			if (ui.kind === "exam") setExam(ui.exam);
			if (ui.kind === "vitals")
				setBp({
					start: { measurementId: ui.measurementId, armCm: ui.armCm },
				});
			if (ui.kind === "region" && !ui.available)
				toast.info(`"${ui.region}" todavía no está disponible.`);
			if (ui.kind === "end") {
				voice.stop();
				setClosing(true);
			}
		},
		onEnd: () => {
			toast.info("Se terminaron los 8 minutos de la consulta.");
			setClosing(true);
		},
		onError: (message) => toast.error(message),
	});
	const voiceLive = voice.status === "live" || voice.status === "connecting";

	useEffect(() => {
		api
			.session(id)
			.then((v) => {
				if (v.hasReport) router.replace(`/informe/${id}`);
				setView(v);
			})
			.catch((e) =>
				setLoadError(
					e instanceof ApiError ? e.message : "No pudimos abrir la consulta.",
				),
			);
	}, [id, router]);

	useEffect(() => {
		if (view?.turns.length)
			bottom.current?.scrollIntoView({ behavior: "smooth" });
	}, [view?.turns.length]);

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

	if (loadError) return <LoadError message={loadError} />;
	if (!view) return <Loader />;

	return (
		<div className="container mx-auto grid max-w-2xl content-start gap-4 px-4 py-4">
			<div>
				<h1 className="font-semibold text-xl">
					{view.case.patient.name}, {view.case.patient.age} años
				</h1>
				<p className="text-muted-foreground text-sm">
					{view.case.title} · quedan{" "}
					{Math.ceil((voice.remainingMs ?? view.remainingMs) / 60000)} min ·
					herramienta educativa, caso ficticio
				</p>
			</div>

			{!closing && (
				<section className="grid gap-2 border p-3">
					{voiceLive ? (
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="text-sm" aria-live="polite">
								{voice.status === "connecting"
									? "Conectando con el paciente…"
									: voice.patientSpeaking
										? `${view.case.patient.name} está hablando…`
										: voice.studentSpeaking
											? "Te escucha…"
											: "En línea. Hablá cuando quieras."}
							</p>
							<Button variant="outline" onClick={() => voice.stop()}>
								Cortar la voz
							</Button>
						</div>
					) : (
						<>
							<p className="text-muted-foreground text-xs">
								Se guarda la transcripción, no el audio. No digas datos
								personales reales.
							</p>
							<Button onClick={() => voice.start()}>
								Acepto: hablar por voz
							</Button>
						</>
					)}
				</section>
			)}

			{exam ? (
				<OrofaringeView exam={exam} onClose={closeExam} />
			) : bp ? (
				<TensiometroView sessionId={id} start={bp.start} onClose={closeBp} />
			) : otoscopy ? (
				<OtoscopioView sessionId={id} onClose={() => setOtoscopy(false)} />
			) : (
				<>
					<ol className="grid max-h-[55svh] gap-2 overflow-y-auto border p-3">
						{view.turns.length === 0 && (
							<li className="text-muted-foreground text-sm">
								Tocá “Acepto: hablar por voz”, presentate y empezá la
								entrevista. Para examinar, pedile que abra la boca (por ejemplo:
								“¿puedo revisarte? abrí la boca y decí aaa”). Acá vas a ver lo
								que se dice.
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
				</>
			)}

			{!tool && !closing && (
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" onClick={() => setBp({ start: null })}>
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
					<Button
						variant="outline"
						onClick={() => {
							voice.stop();
							setClosing(true);
						}}
					>
						Terminar la consulta
					</Button>
				))}
		</div>
	);
}
