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
import { CuelloView } from "@/components/exam/cuello-view";
import { DolorView } from "@/components/exam/dolor-view";
import { OidoFotoView } from "@/components/exam/oido-foto-view";
import { OrofaringeView } from "@/components/exam/orofaringe-view";
import { TensiometroView } from "@/components/exam/tensiometro-view";
import { TermometroView } from "@/components/exam/termometro-view";
import LoadError from "@/components/load-error";
import Loader from "@/components/loader";
import { ApiError, api } from "@/lib/api-client";
import type { Mood } from "@/lib/avatar/commands";
import type { ExamPose } from "@/lib/avatar/exam-poses";
import { moodFor } from "@/lib/avatar/mood";
import {
	differentialsNotice,
	MAX_DIFFERENTIALS,
	MAX_HYPOTHESIS_LENGTH,
	prepareDifferentials,
} from "@/lib/consulta/differentials";
import { createHearing } from "@/lib/consulta/hearing";
import { createPendingCloses } from "@/lib/consulta/pending-closes";
import type { Ear, ExamResult } from "@/lib/contracts/exam";
import type { PatientState, Turn } from "@/lib/contracts/session";
import {
	asksForBloodPressure,
	asksForEarExam,
	asksForNeckExam,
	asksForTemperature,
	asksToEndExam,
	asksWherePain,
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
	const closeBp = useCallback(() => {
		setBp(null);
		avatar.current?.exam(null);
	}, []);
	// Termómetro en la axila (se pide con palabras, por voz o por texto).
	const [thermo, setThermo] = useState(false);
	const [finishStep, setFinishStep] = useState<"guardando" | "informe" | null>(
		null,
	);
	// El avatar acompaña la presión y la temperatura (lib/avatar/exam-poses).
	const avatarExam = useCallback(
		(pose: ExamPose | null) => avatar.current?.exam(pose),
		[],
	);
	const avatarPressure = useCallback(
		(mmHg: number) => avatar.current?.exam({ kind: "presion", mmHg }),
		[],
	);
	// Oído que se está mirando (foto del otoscopio).
	const [ear, setEar] = useState<Ear | null>(null);
	// "¿Dónde te duele?": el estudiante toca la rodilla del avatar.
	const [pain, setPain] = useState(false);
	const closePain = useCallback(() => {
		setPain(false);
		avatar.current?.run({ kind: "view", view: "head" });
	}, []);
	// Ganglios del cuello (se piden con palabras o con la herramienta examinar).
	const [neck, setNeck] = useState(false);
	const tool =
		exam !== null || bp !== null || ear !== null || thermo || pain || neck;
	// onTool es un callback viejo: el ref siempre tiene el valor del último render.
	const toolOpen = useRef(false);
	toolOpen.current = tool;
	const measuring = useRef(false);
	measuring.current = bp !== null || thermo || pain || neck;
	// El examen se muestra recién cuando la cámara llegó a la boca o al oído.
	const [revealed, setRevealed] = useState(false);
	const [closing, setClosing] = useState(false);
	const closingNow = useRef(closing);
	closingNow.current = closing;
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
	const openExam = useRef(exam);
	openExam.current = exam;
	// Lo último que dijo el estudiante: de ahí sale qué oído pidió.
	const lastStudent = useRef("");
	// Por voz, el modelo abre los exámenes con herramientas; por texto (plan
	// B), se piden con las mismas palabras.
	// Por voz se juzga solo lo dicho desde que se abrió el examen, después de
	// una pausa y una sola vez (lib/consulta/hearing.ts).
	const examOpenNow = useRef(examOpen);
	examOpenNow.current = examOpen;
	const [hearing] = useState(() =>
		createHearing((said) => {
			if (examOpenNow.current && asksToEndExam(said))
				setEndRequest((n) => n + 1);
		}),
	);
	useEffect(() => {
		if (examOpen) hearing.examOpened();
	}, [examOpen, hearing]);
	useEffect(() => () => hearing.stop(), [hearing]);
	function checkStudent(turn: Turn, byText: boolean) {
		if (turn.speaker !== "estudiante") return;
		lastStudent.current = turn.text;
		// Una respuesta que llega con la consulta ya cerrándose no abre nada.
		if (closingNow.current) return;
		// Los refs y no el estado del render: en el modo texto esto corre
		// después de esperar la respuesta del paciente, y en esos segundos el
		// examen pudo cerrarse solo (un pedido de cierre viejo cerraría el
		// próximo examen apenas se abre).
		const tool = toolOpen.current;
		if (examOpenNow.current) {
			// Por voz ya lo juzgó lo que se iba escuchando (el turno guardado
			// trae también lo dicho antes de abrir el examen).
			if (byText && asksToEndExam(turn.text)) setEndRequest((n) => n + 1);
		} else if (!tool && asksForTemperature(turn.text)) {
			// No hay herramienta de voz para la temperatura: también por voz se
			// abre con las palabras.
			setThermo(true);
		} else if (!tool && asksForNeckExam(turn.text)) {
			setNeck(true);
		} else if (!tool && view?.case.hasPainZone && asksWherePain(turn.text)) {
			setPain(true);
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
		// "Cerrá la boca" cierra apenas se escucha, sin esperar a que se guarde
		// el turno (eso pasa recién cuando el paciente contesta).
		onHearing: (text) => hearing.heard(text),
		onHeardTurnEnd: () => hearing.turnEnded(),
		onTool: (ui: ToolUi) => {
			if (ui.kind === "state") showState(ui.state);
			// Midiendo presión, temperatura o buscando el dolor, otro examen no
			// pisa el abierto (garganta y oído sí pueden convivir).
			if (
				measuring.current &&
				(ui.kind === "exam" ||
					ui.kind === "otoscope" ||
					ui.kind === "vitals" ||
					ui.kind === "neck")
			) {
				voice.sendNote(
					"El estudiante está en medio de otro examen: esperá a que termine, no abras la boca ni muestres nada.",
				);
				return;
			}
			// Con la garganta bien abierta en pantalla, un pedido nuevo no la
			// reemplaza: se perdería lo que ya miró.
			if (ui.kind === "exam" && exam?.action.variant !== "completa")
				setExam(ui.exam);
			// Con un oído abierto, solo se cambia si el modelo nombró el otro lado
			// (sin lado, earIn daría "derecho" y daría vuelta el izquierdo).
			// El otro oído no se cierra por lo que se dijo antes ("listo, ahora el
			// otro oído"). Abrir el oído con la garganta abierta no descarta lo
			// dicho: "cerrá la boca, ahora te miro el oído" cierra la garganta.
			if (ui.kind === "otoscope" && ear && ui.side && ui.side !== ear)
				hearing.examOpened();
			if (ui.kind === "otoscope") {
				// El otro oído arranca sin el pedido de cierre del anterior.
				if (ear && ui.side && ui.side !== ear) setEndRequest(0);
				setEar((open) =>
					open ? (ui.side ?? open) : (ui.side ?? earIn(lastStudent.current)),
				);
			}
			// Con otro examen abierto, el cuello no se abre escondido detrás: el
			// paciente sabe que se lo revisan después.
			if (ui.kind === "neck" && !closingNow.current) {
				if (toolOpen.current)
					voice.sendNote(
						"El estudiante todavía está con otro examen: el cuello te lo revisa después. Esperá.",
					);
				else setNeck(true);
			}
			// Con el tensiómetro abierto se sigue con el que está (el servidor
			// actualiza esa medición si todavía no tiene manguito).
			if (ui.kind === "vitals" && !closingNow.current)
				setBp(
					(open) =>
						open ?? {
							start: { measurementId: ui.measurementId, armCm: ui.armCm },
						},
				);
			// Pidió ver la rodilla en un caso con zona de dolor: a localizarlo.
			if (
				ui.kind === "region" &&
				ui.available &&
				!toolOpen.current &&
				!closingNow.current &&
				/rodill|pierna/i.test(ui.region)
			)
				setPain(true);
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

	// Cierra solo el oído que pidió cerrarse: si ya se pasó al otro, no.
	function closeEar(which: "derecho" | "izquierdo") {
		setEar((open) => (open === which ? null : open));
		if (ear === which) closes.closed();
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

	// Al terminar por el reloj o por el modelo, los paneles de medir (sin nada
	// por guardar) se cierran como con la cruz: no quedan debajo del
	// formulario mandando pedidos a una consulta cerrada.
	useEffect(() => {
		if (!closing) return;
		setBp(null);
		setThermo(false);
		setNeck(false);
		closePain();
	}, [closing, closePain]);

	// La cruz: corta la voz y pasa a la hipótesis (el examen abierto se cierra
	// guardando).
	function endConsultation() {
		voice.stop();
		setBp(null);
		setThermo(false);
		setPain(false);
		setNeck(false);
		avatar.current?.exam(null);
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
			// Con el examen de este momento, no el de cuando se mandó el texto.
			// Midiendo presión, temperatura o cuello, otro examen no pisa el
			// abierto (la misma regla que por voz).
			if (
				r.exam &&
				!measuring.current &&
				openExam.current?.action.variant !== "completa"
			)
				setExam(r.exam);
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
			// Hasta 10, de hasta 100 caracteres: el servidor no acepta más. La
			// pantalla ya avisó lo que se recorta.
			const { list } = prepareDifferentials(differentials);
			// Primero se terminan de guardar los últimos turnos de la voz y el
			// examen abierto: si no, el informe sale sin ellos y el servidor los
			// rechaza por consulta cerrada. No hace falta otro tope: cada guardado
			// ya tiene el suyo (15 s por pedido, 10 s por examen), y uno más corto
			// los cortaría. El botón dice qué está pasando.
			setFinishStep("guardando");
			await voice.drain();
			await closes.settled();
			setFinishStep("informe");
			await api.finish(id, hypothesis, list);
			router.push(`/informe/${id}`);
		} catch (e) {
			// Un 409 es "se está cerrando" (sin informe todavía): si ya hubiera
			// informe, el servidor lo devuelve con 200. Se queda en el formulario,
			// con lo escrito, para probar de nuevo.
			toast.error(
				e instanceof ApiError ? e.message : "No se pudo cerrar la consulta.",
			);
			setSending(false);
			setFinishStep(null);
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
												if (exam || ear) requestClose();
												setBp(null);
												setThermo(false);
												setNeck(false);
												closePain();
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
					className={`absolute inset-0 grid place-items-center overflow-y-auto p-4 pt-16 ${pain ? "" : "bg-black/30"} ${textMode ? "pb-20" : ""}`}
				>
					{pain && view.case.hasPainZone ? (
						<div className="fade-in zoom-in-50 w-full max-w-md animate-in rounded-lg bg-background p-3 shadow-2xl duration-500 md:justify-self-start">
							<DolorView
								avatar={avatar}
								sessionId={id}
								onClose={closePain}
								speaks={voice.status === "live"}
								onAnswer={(found) => {
									// Sí o no con la cabeza, y en voz alta si hay voz.
									avatar.current?.run({
										kind: "face",
										face: found ? "si" : "no",
									});
									if (voice.status === "live")
										voice.say(
											found
												? "(El estudiante te toca la rodilla y te pregunta si te duele ahí. Sí, te duele justo ahí: decí solo algo muy corto, como «¡Sííí, ahí!», con dolor. Nada más.)"
												: "(El estudiante te toca la rodilla y te pregunta si te duele ahí. No te duele ahí: decí solo algo muy corto, como «Nooo, ahí no». Nada más.)",
										);
								}}
							/>
						</div>
					) : exam ? (
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
								// Otro oído es otra otoscopia: se guarda la anterior y empieza una nueva.
								key={ear}
								sessionId={id}
								ear={ear}
								onClose={() => closeEar(ear)}
								endRequest={endRequest}
							/>
						</div>
					) : bp ? (
						// El tensiómetro tiene sus pasos (manguito, inflar, marcar).
						// A la izquierda en pantallas anchas: el paciente extiende el brazo
						// hacia la derecha de la pantalla.
						<div className="fade-in zoom-in-50 w-full max-w-2xl animate-in rounded-lg bg-background p-3 shadow-2xl duration-500 md:max-w-md md:justify-self-start">
							<TensiometroView
								sessionId={id}
								start={bp.start}
								onPressure={avatarPressure}
								onClose={closeBp}
							/>
						</div>
					) : neck ? (
						<div className="fade-in zoom-in-50 w-full max-w-md animate-in rounded-lg bg-background p-3 shadow-2xl duration-500 md:justify-self-start">
							<CuelloView sessionId={id} onClose={() => setNeck(false)} />
						</div>
					) : thermo ? (
						<div className="fade-in zoom-in-50 w-full max-w-md animate-in rounded-lg bg-background p-3 shadow-2xl duration-500 md:justify-self-start">
							<TermometroView
								sessionId={id}
								onAvatar={avatarExam}
								onClose={() => setThermo(false)}
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
						className="fade-in zoom-in-95 grid max-h-[calc(100svh-2rem)] w-full max-w-md animate-in gap-2 overflow-y-auto rounded-lg bg-background p-4 shadow-2xl"
					>
						<h2 className="font-semibold text-lg">Terminaste la consulta</h2>
						<label htmlFor="hipotesis" className="font-medium">
							Tu hipótesis (y por qué)
						</label>
						<p id="hipotesis-ayuda" className="text-muted-foreground text-xs">
							Lo que creés que tiene y en qué te basás: lo que te contó y lo que
							viste. Hasta {MAX_HYPOTHESIS_LENGTH} caracteres.
						</p>
						<Textarea
							id="hipotesis"
							aria-describedby="hipotesis-ayuda hipotesis-cuenta"
							value={hypothesis}
							onChange={(e) => setHypothesis(e.target.value)}
							maxLength={MAX_HYPOTHESIS_LENGTH}
							required
						/>
						<p
							id="hipotesis-cuenta"
							aria-live="polite"
							className={`justify-self-end text-xs ${hypothesis.length >= MAX_HYPOTHESIS_LENGTH ? "text-destructive" : "text-muted-foreground"}`}
						>
							{hypothesis.length >= MAX_HYPOTHESIS_LENGTH
								? `Llegaste al máximo de ${MAX_HYPOTHESIS_LENGTH} caracteres.`
								: `${hypothesis.length} / ${MAX_HYPOTHESIS_LENGTH}`}
						</p>
						<label htmlFor="diferenciales" className="font-medium">
							Diagnósticos diferenciales
						</label>
						{/* El ejemplo es de un tema que no está en ningún caso ni plantilla
						(abdomen): no da pistas. Si se suma un caso de panza, cambiarlo. */}
						<p
							id="diferenciales-ayuda"
							className="text-muted-foreground text-xs"
						>
							Otros diagnósticos que también podrían explicar lo que tiene y que
							pensaste antes de quedarte con tu hipótesis. Escribilos separados
							por coma, hasta {MAX_DIFFERENTIALS}. Por ejemplo, para un dolor de
							panza: apendicitis, gastroenteritis, cólico renal.
						</p>
						<Input
							id="diferenciales"
							aria-describedby="diferenciales-ayuda diferenciales-aviso"
							placeholder="Separados por coma"
							value={differentials}
							onChange={(e) => setDifferentials(e.target.value)}
						/>
						<p
							id="diferenciales-aviso"
							aria-live="polite"
							className="text-destructive text-xs empty:hidden"
						>
							{differentialsNotice(differentials)}
						</p>
						<Button type="submit" disabled={sending || !hypothesis.trim()}>
							{finishStep === "guardando"
								? "Guardando lo último…"
								: finishStep === "informe"
									? "Armando tu informe…"
									: "Ver mi informe"}
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
