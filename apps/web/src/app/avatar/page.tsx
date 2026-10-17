"use client";

import { Button } from "@pac0/ui/components/button";
import { Input } from "@pac0/ui/components/input";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
	PatientAvatar,
	type PatientAvatarHandle,
} from "@/components/avatar/patient-avatar";
import {
	type AvatarAction,
	describeAction,
	FACES,
	type Face,
	GESTURES,
	type Gesture,
	MOODS,
	type Mood,
	parseCommand,
	VIEWS,
	type View,
} from "@/lib/avatar/commands";

const keys = <T extends object>(o: T) => Object.keys(o) as (keyof T)[];

const GROUPS: { title: string; actions: AvatarAction[] }[] = [
	{
		title: "Ánimo",
		actions: keys(MOODS).map((mood: Mood) => ({ kind: "mood", mood })),
	},
	{
		title: "Cara",
		actions: [
			...keys(FACES).map((face: Face) => ({ kind: "face", face }) as const),
			{ kind: "mouth", tongue: false },
			{ kind: "mouth", tongue: true },
			{ kind: "eyes" },
		],
	},
	{
		title: "Gestos",
		actions: keys(GESTURES).map((gesture: Gesture) => ({
			kind: "gesture",
			gesture,
		})),
	},
	{
		title: "Vista",
		actions: keys(VIEWS).map((view: View) => ({ kind: "view", view })),
	},
];

// Página de prueba del avatar (Persona 3): órdenes por texto o botones y
// labios con el micrófono. Todavía no está conectada a la consulta.
export default function AvatarPage() {
	const avatar = useRef<PatientAvatarHandle>(null);
	const mic = useRef<MediaStream | null>(null);
	const [order, setOrder] = useState("");
	const [last, setLast] = useState<string | null>(null);
	const [listening, setListening] = useState(false);

	function run(action: AvatarAction) {
		avatar.current?.run(action);
		setLast(describeAction(action));
	}

	function submit(event: React.FormEvent) {
		event.preventDefault();
		const action = parseCommand(order);
		if (!action) {
			toast.error("No entendí la orden. Probá con uno de los botones.");
			return;
		}
		run(action);
		setOrder("");
	}

	async function toggleMic() {
		if (listening) {
			avatar.current?.disconnectSpeech();
			for (const track of mic.current?.getTracks() ?? []) track.stop();
			mic.current = null;
			setListening(false);
			return;
		}
		try {
			mic.current = await navigator.mediaDevices.getUserMedia({ audio: true });
			await avatar.current?.connectSpeech(mic.current);
			setListening(true);
		} catch (error) {
			console.error("Micrófono", error);
			toast.error("No pudimos usar el micrófono.");
		}
	}

	return (
		<div className="container mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[minmax(0,28rem)_1fr]">
			<div className="grid content-start gap-2">
				<PatientAvatar
					ref={avatar}
					className="aspect-[4/5] w-full border bg-muted"
				/>
				<p className="text-muted-foreground text-sm" aria-live="polite">
					{last ? `Última orden: ${last}` : "Dale una orden al avatar."}
				</p>
			</div>

			<div className="grid content-start gap-5">
				<h1 className="font-semibold text-2xl">Prueba del avatar</h1>

				<form onSubmit={submit} className="grid gap-2">
					<label htmlFor="orden" className="font-medium">
						Orden
					</label>
					<div className="flex gap-2">
						<Input
							id="orden"
							value={order}
							onChange={(e) => setOrder(e.target.value)}
							placeholder="Ej.: abrí la boca, poné cara de dolor"
							maxLength={120}
						/>
						<Button type="submit" disabled={!order.trim()}>
							Hacer
						</Button>
					</div>
				</form>

				{GROUPS.map((g) => (
					<section key={g.title} className="grid gap-2">
						<h2 className="font-medium">{g.title}</h2>
						<div className="flex flex-wrap gap-2">
							{g.actions.map((a) => (
								<Button
									key={describeAction(a)}
									variant="outline"
									size="sm"
									onClick={() => run(a)}
								>
									{describeAction(a)}
								</Button>
							))}
						</div>
					</section>
				))}

				<section className="grid gap-2">
					<h2 className="font-medium">Labios</h2>
					<Button
						variant={listening ? "default" : "outline"}
						onClick={toggleMic}
					>
						{listening ? "Dejar de escuchar" : "Mover los labios con mi voz"}
					</Button>
					<p className="text-muted-foreground text-xs">
						Hablá al micrófono y el avatar mueve la boca. El audio no se graba
						ni sale de tu computadora. El detector está entrenado en inglés: en
						castellano los labios son aproximados.
					</p>
				</section>
			</div>
		</div>
	);
}
