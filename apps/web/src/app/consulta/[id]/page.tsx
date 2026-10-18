"use client";

// Consulta solo por voz; la transcripción se muestra para leer. Versión
// mínima de la Persona 1; la Persona 3 la diseña.
import { Button } from "@pac0/ui/components/button";
import { Input } from "@pac0/ui/components/input";
import { Textarea } from "@pac0/ui/components/textarea";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
	PatientAvatar,
	type PatientAvatarHandle,
} from "@/components/avatar/patient-avatar";
import { OrofaringeView } from "@/components/exam/orofaringe-view";
import { OtoscopioView } from "@/components/exam/otoscopio-view";
import { TensiometroView } from "@/components/exam/tensiometro-view";
import { TermometroView } from "@/components/exam/termometro-view";
import LoadError from "@/components/load-error";
import Loader from "@/components/loader";
import { ApiError, api } from "@/lib/api-client";
import type { Mood } from "@/lib/avatar/commands";
import type { ExamPose } from "@/lib/avatar/exam-poses";
import { moodFor } from "@/lib/avatar/mood";
import type { ExamResult } from "@/lib/contracts/exam";
import type { PatientState, Turn } from "@/lib/contracts/session";
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
	const closeBp = useCallback(() => {
		setBp(null);
		avatar.current?.exam(null);
	}, []);
	const [otoscopy, setOtoscopy] = useState(false);
	const [thermo, setThermo] = useState(false);
	const tool = exam !== null || bp !== null || otoscopy || thermo;
	// El avatar acompaña el examen: brazo con el manguito o el termómetro.
	const avatarExam = useCallback(
		(pose: ExamPose | null) => avatar.current?.exam(pose),
		[],
	);
	const avatarPressure = useCallback(
		(mmHg: number) => avatar.current?.exam({ kind: "presion", mmHg }),
		[],
	);
	const [closing, setClosing] = useState(false);
	const [hypothesis, setHypothesis] = useState("");
	const [differentials, setDifferentials] = useState("");
	// Plan B si falla la voz o el wifi (plan.md, sección 14): la consulta sigue
	// por texto con el mismo paciente.
	const [textMode, setTextMode] = useState(false);
	const [draft, setDraft] = useState("");
	const [typing, setTyping] = useState(false);
	const bottom = useRef<HTMLLIElement>(null);
	// Reloj local sin voz (plan B por texto): parte de lo que quedaba al cargar.
	const loadedAt = useRef(Date.now());
	const [now, setNow] = useState(() => Date.now());
	const avatar = useRef<PatientAvatarHandle>(null);
	const [mood, setMood] = useState<Mood>("neutral");
	const showState = useCallback(
		(state: PatientState) => setMood(moodFor(state)),
		[],
	);

	const voice = useVoice({
		sessionId: id,
		onTurn: (turn: Turn) =>
			setView((v) => (v ? { ...v, turns: [...v.turns, turn] } : v)),
		onState: showState,
		onTool: (ui: ToolUi) => {
			if (ui.kind === "state") showState(ui.state);
			if (ui.kind === "exam") setExam(ui.exam);
			if (ui.kind === "otoscope") setOtoscopy(true);
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
	const voiceLive =
		voice.status === "live" ||
		voice.status === "connecting" ||
		voice.status === "reconnecting";

	// Al cerrar un examen (boca, tensiómetro u otoscopio), se le avisa al
	// paciente para que la charla siga con naturalidad.
	const toolWasOpen = useRef(false);
	const { sendNote, setExamining } = voice;
	// Examinando, el silencio es normal: no se cuenta ni hace hablar al paciente.
	useEffect(() => {
		setExamining(tool);
	}, [tool, setExamining]);
	useEffect(() => {
		if (toolWasOpen.current && !tool && voice.status === "live") {
			sendNote(
				"El estudiante terminó de examinarte. Seguí la consulta normalmente y respondé lo que te pregunte.",
			);
		}
		toolWasOpen.current = tool;
	}, [tool, voice.status, sendNote]);

	useEffect(() => {
		api
			.session(id)
			.then((v) => {
				if (v.hasReport) router.replace(`/informe/${id}`);
				// Al volver a una consulta vencida o cerrada no se ofrece la voz
				// (el servidor la rechazaría): se pasa directo a la hipótesis.
				if (v.remainingMs === 0 || v.session.status !== "activa")
					setClosing(true);
				loadedAt.current = Date.now();
				setView(v);
				showState(v.session.state);
			})
			.catch((e) =>
				setLoadError(
					e instanceof ApiError ? e.message : "No pudimos abrir la consulta.",
				),
			);
	}, [id, router, showState]);

	// Los labios del avatar siguen la voz del paciente mientras hay voz.
	const voiceStatus = voice.status;
	const patientStream = voice.patientStream;
	useEffect(() => {
		const stream = voiceStatus === "live" ? patientStream() : null;
		if (stream) avatar.current?.connectSpeech(stream);
		else if (voiceStatus !== "reconnecting") avatar.current?.disconnectSpeech();
	}, [voiceStatus, patientStream]);

	useEffect(() => {
		if (view?.turns.length)
			bottom.current?.scrollIntoView({ behavior: "smooth" });
	}, [view?.turns.length]);

	// Sin voz, el reloj de la pantalla lo lleva esta página (la voz tiene el
	// suyo). Al llegar a cero en modo texto se pasa a la hipótesis.
	const localRemainingMs = view
		? Math.max(0, view.remainingMs - (now - loadedAt.current))
		: 0;
	useEffect(() => {
		// También para el docente: solo mueve el reloj, no muestra controles.
		if (!view || closing) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [view, closing]);
	// Sin voz conectada (por texto, o con la voz cortada o sin empezar) el
	// tope lo marca este reloj; con voz, la voz tiene su propio cierre. Para el
	// docente no: solo lee.
	useEffect(() => {
		if (
			view &&
			!view.readOnly &&
			!voiceLive &&
			!closing &&
			localRemainingMs === 0
		) {
			toast.info("Se terminaron los 8 minutos de la consulta.");
			setClosing(true);
		}
	}, [view, voiceLive, closing, localRemainingMs]);

	async function closeExam(times: Record<string, number>) {
		if (exam && exam.action.variant !== "negado") {
			await api
				.saveExamTimes(id, exam.action.id, times)
				.catch(() => toast.error("No se guardó el tiempo del examen."));
		}
		setExam(null);
	}

	async function sendText(event: React.FormEvent) {
		event.preventDefault();
		const text = draft.trim();
		if (!text) return;
		setTyping(true);
		try {
			const r = await api.sendTurn(id, text);
			setDraft("");
			setView((v) =>
				v ? { ...v, turns: [...v.turns, r.studentTurn, r.patientTurn] } : v,
			);
			if (r.exam) setExam(r.exam);
		} catch (e) {
			toast.error(
				e instanceof ApiError
					? e.message
					: "No se pudo enviar. Probá de nuevo.",
			);
			// La consulta venció o se cerró: no tiene sentido seguir escribiendo.
			if (e instanceof ApiError && e.status === 409) setClosing(true);
		} finally {
			setTyping(false);
		}
	}

	async function finish(event: React.FormEvent) {
		event.preventDefault();
		setSending(true);
		try {
			const list = differentials
				.split(",")
				.map((d) => d.trim().slice(0, 100))
				.filter(Boolean)
				// El servidor acepta hasta 10; más darían "Datos inválidos".
				.slice(0, 10);
			// Primero se terminan de guardar los últimos turnos de la voz: si no,
			// el informe sale sin ellos y el servidor los rechaza por consulta cerrada.
			await voice.drain();
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
		<div className="container mx-auto grid max-w-6xl content-start gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
			{/* El avatar no se desmonta durante el examen: se esconde, así no
			    vuelve a cargar. En la vista de examen la escena corta a la
			    herramienta (plan.md, sección 9). */}
			<PatientAvatar
				ref={avatar}
				mood={mood}
				className={`h-[42svh] w-full border bg-muted md:sticky md:top-4 md:h-[calc(100svh-6rem)] ${tool ? "max-md:hidden" : ""}`}
			/>

			<div className="grid content-start gap-4">
				<div>
					<h1 className="font-semibold text-xl">
						{view.case.patient.name}, {view.case.patient.age} años
					</h1>
					<p className="text-muted-foreground text-sm">
						{view.case.title} · quedan{" "}
						{/* El reloj de la voz queda congelado al cortarse: solo vale en vivo. */}
						{Math.ceil(
							((voiceLive ? voice.remainingMs : null) ?? localRemainingMs) /
								60000,
						)}{" "}
						min · herramienta educativa, caso ficticio
					</p>
					{view.readOnly && (
						<p className="mt-2 border p-2 text-muted-foreground text-sm">
							Vista de docente: solo lectura.
						</p>
					)}
				</div>

				{!closing && !view.readOnly && (
					<section className="grid gap-2 border p-3">
						{voiceLive ? (
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="text-sm" aria-live="polite">
									{voice.status === "connecting"
										? "Conectando con el paciente…"
										: voice.status === "reconnecting"
											? "Se cortó la voz. Reconectando…"
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
								<Button
									onClick={() => {
										avatar.current?.unlockAudio();
										voice.start();
									}}
								>
									{voice.status === "error"
										? "Probar la voz de nuevo"
										: "Acepto: hablar por voz"}
								</Button>
								{voice.status === "error" && !textMode && (
									<Button variant="outline" onClick={() => setTextMode(true)}>
										Seguir por texto
									</Button>
								)}
							</>
						)}
					</section>
				)}

				{exam ? (
					<OrofaringeView exam={exam} onClose={closeExam} />
				) : bp ? (
					<TensiometroView
						sessionId={id}
						start={bp.start}
						onPressure={avatarPressure}
						onClose={closeBp}
					/>
				) : otoscopy ? (
					<OtoscopioView sessionId={id} onClose={() => setOtoscopy(false)} />
				) : thermo ? (
					<TermometroView
						sessionId={id}
						onAvatar={avatarExam}
						onClose={() => setThermo(false)}
					/>
				) : (
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
						<li ref={bottom} aria-hidden="true" />
					</ol>
				)}

				{/* Con un examen abierto, la charla sigue: últimas frases a la vista. */}
				{tool && view.turns.length > 0 && (
					<ol
						className="grid gap-1 border p-2 text-sm"
						aria-label="Últimas frases"
					>
						{view.turns.slice(-3).map((t) => (
							<li key={t.id} className="text-muted-foreground">
								<span className="font-medium text-foreground">
									{t.speaker === "estudiante" ? "Vos" : view.case.patient.name}:
								</span>{" "}
								{t.text}
							</li>
						))}
					</ol>
				)}

				{textMode && !voiceLive && !tool && !closing && !view.readOnly && (
					<form onSubmit={sendText} className="flex gap-2">
						<Input
							aria-label={`Escribile a ${view.case.patient.name}`}
							placeholder="Escribí lo que le dirías…"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							maxLength={1000}
							disabled={typing}
							autoFocus
						/>
						<Button type="submit" disabled={typing || !draft.trim()}>
							{typing ? "…" : "Enviar"}
						</Button>
					</form>
				)}

				{!tool && !closing && !view.readOnly && (
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" onClick={() => setBp({ start: null })}>
							Tomar la presión
						</Button>
						<Button variant="outline" onClick={() => setOtoscopy(true)}>
							Examinar el oído
						</Button>
						<Button variant="outline" onClick={() => setThermo(true)}>
							Tomar la temperatura
						</Button>
					</div>
				)}

				{!tool &&
					!view.readOnly &&
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
		</div>
	);
}
