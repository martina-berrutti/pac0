"use client";

// Consulta a pantalla completa (Persona 3): solo el paciente, como en un
// consultorio. Se habla por voz; la transcripción se guarda pero no se
// muestra. Al examinar, la cámara se acerca a la boca o al oído y el examen
// aparece encima del avatar. La cruz de arriba a la derecha termina la
// consulta. La lógica de la voz y del cierre es de la Persona 1.
import { Button } from "@pac0/ui/components/button";
import { Input } from "@pac0/ui/components/input";
import { Textarea } from "@pac0/ui/components/textarea";
import { X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
	type FocusPart,
	PatientAvatar,
	type PatientAvatarHandle,
} from "@/components/avatar/patient-avatar";
import { OidoFotoView } from "@/components/exam/oido-foto-view";
import { OrofaringeView } from "@/components/exam/orofaringe-view";
import { TensiometroView } from "@/components/exam/tensiometro-view";
import LoadError from "@/components/load-error";
import Loader from "@/components/loader";
import { ApiError, api } from "@/lib/api-client";
import type { Mood } from "@/lib/avatar/commands";
import { moodFor } from "@/lib/avatar/mood";
import { createPendingCloses } from "@/lib/consulta/pending-closes";
import type { Ear, ExamResult } from "@/lib/contracts/exam";
import type { PatientState, Turn } from "@/lib/contracts/session";
import {
	asksForBloodPressure,
	asksForEarExam,
	asksToEndExam,
	earIn,
} from "@/lib/exam/end-intent";
import { getArchetype } from "@/lib/patient/personalities";
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
	// Tensiómetro abierto, con la medición de medir_presion (voz).
	const [bp, setBp] = useState<{ start: BpStart | null } | null>(null);
	const closeBp = useCallback(() => setBp(null), []);
	// Oído que se está mirando (foto del otoscopio).
	const [ear, setEar] = useState<Ear | null>(null);
	const tool = exam !== null || bp !== null || ear !== null;
	// El examen se muestra recién cuando la cámara llegó a la boca o al oído.
	const [revealed, setRevealed] = useState(false);
	const [closing, setClosing] = useState(false);
	const [hypothesis, setHypothesis] = useState("");
	const [differentials, setDifferentials] = useState("");
	// Plan B si falla la voz o el wifi (plan.md, sección 14): la consulta sigue
	// por texto con el mismo paciente.
	const [textMode, setTextMode] = useState(false);
	const [draft, setDraft] = useState("");
	const [typing, setTyping] = useState(false);
	// Reloj local sin voz (plan B por texto): parte de lo que quedaba al cargar.
	const loadedAt = useRef(Date.now());
	const [now, setNow] = useState(() => Date.now());
	const avatar = useRef<PatientAvatarHandle>(null);
	const [mood, setMood] = useState<Mood>("neutral");
	// Expresión de la personalidad elegida (enojado, feliz…); el ánimo de la
	// consulta la puede cambiar.
	const baseMood = useRef<Mood | undefined>(undefined);
	const showState = useCallback(
		(state: PatientState) => setMood(moodFor(state, baseMood.current)),
		[],
	);
	// "Cerrá la boca", "ya está": la garganta o el oído abiertos se cierran
	// solos (el tensiómetro no, tiene sus pasos).
	const [endRequest, setEndRequest] = useState(0);
	const examOpen = exam !== null || ear !== null;
	// Lo último que dijo el estudiante: de ahí sale qué oído pidió.
	const lastStudent = useRef("");
	// Por voz, el modelo abre los exámenes con herramientas; por texto (plan
	// B), se piden con las mismas palabras.
	function checkStudent(turn: Turn, byText: boolean) {
		if (turn.speaker !== "estudiante") return;
		lastStudent.current = turn.text;
		if (examOpen) {
			if (asksToEndExam(turn.text)) setEndRequest((n) => n + 1);
		} else if (byText && !tool) {
			if (asksForEarExam(turn.text)) setEar(earIn(turn.text));
			else if (asksForBloodPressure(turn.text)) setBp({ start: null });
		}
	}

	const voice = useVoice({
		sessionId: id,
		onTurn: (turn: Turn) => {
			setView((v) => (v ? { ...v, turns: [...v.turns, turn] } : v));
			checkStudent(turn, false);
		},
		onState: showState,
		onTool: (ui: ToolUi) => {
			if (ui.kind === "state") showState(ui.state);
			if (ui.kind === "exam") setExam(ui.exam);
			if (ui.kind === "otoscope") setEar(ui.side ?? earIn(lastStudent.current));
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

	// Animación del examen: la cámara va a la boca (abierta) o al oído y
	// después aparece el examen; al cerrarlo, vuelve a la cara.
	const examVariant = exam?.action.variant ?? null;
	useEffect(() => {
		const a = avatar.current;
		if (!tool) {
			setRevealed(false);
			// El próximo examen arranca sin pedido de cierre pendiente.
			setEndRequest(0);
			a?.run({ kind: "mouth", tongue: false, ms: 0 });
			a?.focus(null);
			return;
		}
		let cancelled = false;
		let part: FocusPart | null = null;
		if (examVariant === "negado") {
			// No abre la boca: niega con la cabeza, sin zoom ni foto.
			a?.run({ kind: "face", face: "no" });
			toast.info(
				"No quiso abrir la boca. Explicale qué vas a hacer y pedile permiso.",
			);
			const timer = setTimeout(() => setExam(null), 2500);
			return () => clearTimeout(timer);
		}
		if (examVariant === "parcial") {
			// Abre poco la boca: se ve en el primer plano del avatar (no hay
			// garganta que mostrar) y se avisa cómo pedirlo mejor.
			a?.run({ kind: "mouth", tongue: false, ms: 4000 });
			a?.focus("mouth");
			toast.info(
				"Abrió solo un poco la boca. Pedile que la abra bien, saque la lengua y diga aaa.",
			);
			const timer = setTimeout(() => setExam(null), 4000);
			return () => clearTimeout(timer);
		}
		if (examVariant) {
			part = "mouth";
			// Abierta mientras dure el examen (se cierra al volver).
			a?.run({
				kind: "mouth",
				tongue: examVariant === "completa",
				ms: 10 * 60_000,
			});
		} else if (ear) {
			part = ear === "izquierdo" ? "leftEar" : "rightEar";
		}
		(part ? (a?.focus(part) ?? Promise.resolve()) : Promise.resolve()).then(
			() => {
				if (!cancelled) setRevealed(true);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [tool, examVariant, ear]);

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
				baseMood.current = getArchetype(v.session.personalityKey)?.mood;
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
		// Si queda el oído abierto, no hereda el pedido de cierre de la garganta.
		setEndRequest(0);
		closes.closed();
	}

	function closeEar() {
		setEar(null);
		closes.closed();
	}

	// Cierra la garganta o el oído por su propio camino, que guarda lo que se
	// miró (tiempos, otoscopia). El informe espera a que termine: si no, sale
	// sin ese examen y el servidor lo rechaza por consulta cerrada.
	const [closes] = useState(createPendingCloses);
	function requestClose() {
		// Todavía no se ve (o no abrió la boca): no hay nada que guardar.
		if (!revealed) {
			setExam(null);
			setEar(null);
			return;
		}
		if (closes.request()) setEndRequest((n) => n + 1);
	}

	// Al terminar la consulta (la cruz, el reloj o el modelo) con un examen
	// abierto, se cierra guardando. También si uno se abre tarde.
	// Corre de nuevo si cambia el examen abierto (la garganta se cerró y queda
	// el oído) o si recién se muestra.
	// biome-ignore lint/correctness/useExhaustiveDependencies: requestClose lee el estado del render.
	useEffect(() => {
		if (closing && (exam || ear)) requestClose();
	}, [closing, exam, ear, revealed]);

	// La cruz: corta la voz y pasa a la hipótesis (el examen abierto se cierra
	// guardando).
	function endConsultation() {
		voice.stop();
		setBp(null);
		setClosing(true);
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
			checkStudent(r.studentTurn, true);
			// Si nombró el oído, el servidor no devuelve examen: se abre el oído.
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
			await closes.settled();
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
	// El docente no consulta: lee la transcripción.
	if (view.readOnly) return <ReadOnlyConsultation view={view} />;

	const name = view.case.patient.name;
	// El reloj de la voz queda congelado al cortarse: solo vale en vivo.
	const minutes = Math.ceil(
		((voiceLive ? voice.remainingMs : null) ?? localRemainingMs) / 60000,
	);
	const lastPatient = [...view.turns]
		.reverse()
		.find((t) => t.speaker === "paciente");

	return (
		<div className="fixed inset-0 z-50 overflow-hidden bg-neutral-200 dark:bg-neutral-800">
			<PatientAvatar ref={avatar} mood={mood} className="absolute inset-0" />

			{/* Arriba: quién es y cuánto queda (izquierda), terminar (derecha). */}
			<p className="absolute top-3 left-3 z-20 rounded-full bg-background/70 px-3 py-1 text-sm backdrop-blur">
				{name}, {view.case.patient.age} años · {minutes} min
			</p>
			{!closing && (
				<Button
					size="icon-lg"
					variant="secondary"
					aria-label="Terminar la consulta"
					title="Terminar la consulta"
					onClick={endConsultation}
					// Encima del examen abierto: siempre se puede terminar.
					className="absolute top-3 right-3 z-20 rounded-full shadow"
				>
					<X />
				</Button>
			)}

			{/* Abajo: empezar la voz, cómo va, o el plan B por texto (que sigue
			    a la vista durante el examen, para poder decir "cerrá la boca").
			    Si la voz se cae con un examen abierto, también: sin voz no hay
			    cómo pedir que se cierre. */}
			{!closing &&
				(!tool || (textMode && !voiceLive) || voice.status === "error") && (
					<div className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
						{voiceLive ? (
							<p
								className="rounded-full bg-background/80 px-4 py-2 text-sm shadow backdrop-blur"
								aria-live="polite"
							>
								{voice.status === "connecting"
									? "Conectando con el paciente…"
									: voice.status === "reconnecting"
										? "Se cortó la voz. Reconectando…"
										: voice.patientSpeaking
											? `${name} está hablando…`
											: voice.studentSpeaking
												? "Te escucha…"
												: "Hablá cuando quieras."}
							</p>
						) : textMode ? (
							<div className="grid w-full max-w-xl gap-2">
								{lastPatient && !tool && (
									<p className="rounded-lg bg-background/85 px-4 py-2 text-sm shadow backdrop-blur">
										<span className="font-medium">{name}:</span>{" "}
										{lastPatient.text}
									</p>
								)}
								<form onSubmit={sendText} className="flex gap-2">
									<Input
										aria-label={`Escribile a ${name}`}
										placeholder="Escribí lo que le dirías…"
										value={draft}
										onChange={(e) => setDraft(e.target.value)}
										maxLength={1000}
										disabled={typing}
										autoFocus
										className="bg-background"
									/>
									<Button type="submit" disabled={typing || !draft.trim()}>
										{typing ? "…" : "Enviar"}
									</Button>
								</form>
							</div>
						) : (
							<div className="grid max-w-sm justify-items-center gap-2 rounded-lg bg-background/85 p-3 text-center shadow backdrop-blur">
								<p className="text-muted-foreground text-xs">
									Se guarda la transcripción, no el audio. No digas datos
									personales reales. Herramienta educativa, caso ficticio.
								</p>
								<div className="flex flex-wrap justify-center gap-2">
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
									{voice.status === "error" && (
										<Button variant="outline" onClick={() => setTextMode(true)}>
											Seguir por texto
										</Button>
									)}
									{voice.status === "error" && tool && (
										<Button
											variant="outline"
											onClick={() => {
												requestClose();
												setBp(null);
											}}
										>
											Cerrar el examen
										</Button>
									)}
								</div>
							</div>
						)}
					</div>
				)}

			{/* El examen aparece encima del avatar, desde el primer plano. */}
			{tool && revealed && (
				<div
					className={`absolute inset-0 grid place-items-center overflow-y-auto bg-black/30 p-4 pt-16 ${textMode ? "pb-20" : ""}`}
				>
					{exam ? (
						// Solo la foto, grande (es 4:3: el ancho se limita por el alto).
						<div className="fade-in zoom-in-50 w-[min(92vw,calc((100svh-7rem)*4/3))] animate-in duration-500">
							<OrofaringeView
								exam={exam}
								onClose={closeExam}
								endRequest={endRequest}
								bare
							/>
						</div>
					) : ear ? (
						<div className="fade-in zoom-in-50 animate-in duration-500">
							<OidoFotoView
								sessionId={id}
								ear={ear}
								onClose={closeEar}
								endRequest={endRequest}
							/>
						</div>
					) : bp ? (
						// El tensiómetro tiene sus pasos (manguito, inflar, marcar).
						<div className="fade-in zoom-in-50 w-full max-w-2xl animate-in rounded-lg bg-background p-3 shadow-2xl duration-500">
							<TensiometroView
								sessionId={id}
								start={bp.start}
								onClose={closeBp}
							/>
						</div>
					) : null}
				</div>
			)}

			{/* La cruz o el fin del tiempo: hipótesis y diferenciales. */}
			{closing && (
				<div className="absolute inset-0 grid place-items-center bg-black/40 p-4">
					<form
						onSubmit={finish}
						className="fade-in zoom-in-95 grid w-full max-w-md animate-in gap-2 rounded-lg bg-background p-4 shadow-2xl"
					>
						<h2 className="font-semibold text-lg">Terminaste la consulta</h2>
						<label htmlFor="hipotesis" className="font-medium">
							Tu hipótesis (y por qué)
						</label>
						<Textarea
							id="hipotesis"
							value={hypothesis}
							onChange={(e) => setHypothesis(e.target.value)}
							maxLength={500}
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
				</div>
			)}
		</div>
	);
}

// Vista del docente: solo la transcripción, sin voz ni cierre.
function ReadOnlyConsultation({ view }: { view: SessionView }) {
	return (
		<div className="container mx-auto grid max-w-2xl content-start gap-4 px-4 py-4">
			<div>
				<h1 className="font-semibold text-xl">
					{view.case.patient.name}, {view.case.patient.age} años
				</h1>
				<p className="text-muted-foreground text-sm">{view.case.title}</p>
				<p className="mt-2 border p-2 text-muted-foreground text-sm">
					Vista de docente: solo lectura.
				</p>
			</div>
			<ol className="grid gap-2 border p-3">
				{view.turns.length === 0 && (
					<li className="text-muted-foreground text-sm">
						Todavía no se habló.
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
							{t.speaker === "estudiante"
								? "Estudiante"
								: view.case.patient.name}
						</span>
						{t.text}
					</li>
				))}
			</ol>
		</div>
	);
}
