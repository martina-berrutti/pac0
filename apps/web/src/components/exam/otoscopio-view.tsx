"use client";

// Otoscopio virtual (plan.md, sección 6, afiche HC-02). Se prepara (higiene,
// oído externo, luz), se elige mano y espéculo, se arrastra el pabellón para
// traccionarlo y se introduce con la rueda del mouse o los botones. Sin
// imágenes con licencia todavía: la vista circular es un esquema, no una foto
// clínica. Qué se ve lo decide el servidor; los errores los calcula el código.
import { Button } from "@pac0/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api-client";
import type {
	Ear,
	EarAppearance,
	OtoscopyPrep,
	OtoscopyRecord,
} from "@/lib/contracts/exam";
import {
	BLOCKED_DEPTH,
	CANAL_DEPTH,
	TOO_DEEP,
	TYMPANUM_DEPTH,
} from "@/lib/exam/otoscope";

const PREP: { key: OtoscopyPrep; label: string }[] = [
	{ key: "higiene", label: "Higiene de manos" },
	{ key: "inspeccion-externa", label: "Inspeccionar el oído externo" },
	{ key: "verificar-luz", label: "Verificar la luz" },
];

const CANAL_COLOR = {
	sano: "#e8b4a0",
	eritema: "#d9534f",
	secrecion: "#d8c27a",
} as const;
const TYMPANUM_COLOR = {
	nacarado: "#c9c9cf",
	eritematoso: "#c9605a",
	abombado: "#b8433d",
} as const;

// Subir más de esto en 300 ms es entrar de golpe.
const ROUGH_DELTA = 25;
const TICK_MS = 100;

type Traction = OtoscopyRecord["traction"];

export function OtoscopioView({
	sessionId,
	onClose,
}: {
	sessionId: string;
	onClose: () => void;
}) {
	const [ear, setEar] = useState<Ear | null>(null);
	const [actionId, setActionId] = useState<string | null>(null);
	const [appearance, setAppearance] = useState<EarAppearance | null>(null);
	const [prep, setPrep] = useState<OtoscopyPrep[]>([]);
	const [hand, setHand] = useState<OtoscopyRecord["hand"] | null>(null);
	const [speculum, setSpeculum] = useState<OtoscopyRecord["speculum"]>(null);
	const [traction, setTraction] = useState<Traction>(null);
	const [depth, setDepth] = useState(0);
	const depthRef = useRef(0);
	const [saving, setSaving] = useState(false);
	const [times, setTimes] = useState({ canal: 0, tympanum: 0 });
	const record = useRef({ maxDepth: 0, rough: 0, inserted: false });
	const recent = useRef<{ at: number; depth: number }[]>([]);
	const dragFrom = useRef<{ x: number; y: number } | null>(null);

	const tractionOk = traction === "arriba-atras" || traction === "abajo-atras";
	const blocked = depth >= BLOCKED_DEPTH && !tractionOk;
	const seesTympanum = depth >= TYMPANUM_DEPTH && tractionOk;
	const seesCanal = depth >= CANAL_DEPTH && !blocked && !seesTympanum;
	const hurts = blocked || depth > TOO_DEEP;

	async function chooseEar(chosen: Ear) {
		try {
			const r = await api.startOtoscopy(sessionId, chosen);
			setEar(chosen);
			setActionId(r.actionId);
			setAppearance(r.appearance);
		} catch (e) {
			toast.error(
				e instanceof ApiError ? e.message : "No se pudo abrir el otoscopio.",
			);
		}
	}

	// Tiempo mirando el conducto y el tímpano.
	useEffect(() => {
		if (!seesCanal && !seesTympanum) return;
		const id = setInterval(() => {
			setTimes((t) =>
				seesTympanum
					? { ...t, tympanum: t.tympanum + TICK_MS }
					: { ...t, canal: t.canal + TICK_MS },
			);
		}, TICK_MS);
		return () => clearInterval(id);
	}, [seesCanal, seesTympanum]);

	function insert(delta: number) {
		if (!hand || !speculum) {
			toast.info("Elegí la mano y el espéculo antes de introducir.");
			return;
		}
		const next = Math.max(0, Math.min(100, depthRef.current + delta));
		depthRef.current = next;
		const now = performance.now();
		recent.current = [
			...recent.current.filter((r) => now - r.at < 300),
			{ at: now, depth: next },
		];
		const oldest = recent.current[0]?.depth ?? next;
		if (next - oldest > ROUGH_DELTA) {
			record.current.rough += 1;
			recent.current = [];
		}
		if (next > 0) record.current.inserted = true;
		record.current.maxDepth = Math.max(record.current.maxDepth, next);
		setDepth(next);
	}

	function togglePrep(key: OtoscopyPrep) {
		// Lo que se hace después de introducir ya no cuenta como preparación.
		if (record.current.inserted) {
			toast.info("Eso va antes de introducir el espéculo.");
			return;
		}
		setPrep((p) => (p.includes(key) ? p : [...p, key]));
	}

	// Tracción: arrastrar desde el pabellón. La nuca queda del lado contrario a
	// la cara según el oído (vista lateral).
	function endDrag(e: React.PointerEvent) {
		const from = dragFrom.current;
		dragFrom.current = null;
		if (!from) return;
		const dx = e.clientX - from.x;
		const dy = e.clientY - from.y;
		if (Math.hypot(dx, dy) < 20) return;
		const backward = ear === "derecho" ? -dx : dx;
		if (backward > 10 && dy < -10) setTraction("arriba-atras");
		else if (backward > 10 && dy > 10) setTraction("abajo-atras");
		else setTraction("otra");
	}

	async function finish() {
		if (!actionId || !hand) return;
		setSaving(true);
		try {
			await api.finishOtoscopy(sessionId, actionId, {
				hand,
				prep,
				speculum,
				traction,
				roughInsertions: record.current.rough,
				maxDepth: record.current.maxDepth,
				canalMs: times.canal,
				tympanumMs: times.tympanum,
			});
			onClose();
		} catch (e) {
			toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
			setSaving(false);
		}
	}

	if (!ear || !appearance) {
		return (
			<div className="grid gap-2 border p-3">
				<p className="text-sm">¿Qué oído vas a examinar?</p>
				<div className="flex gap-2">
					<Button onClick={() => chooseEar("derecho")}>Oído derecho</Button>
					<Button onClick={() => chooseEar("izquierdo")}>Oído izquierdo</Button>
				</div>
				<Button variant="outline" onClick={onClose}>
					Cancelar
				</Button>
			</div>
		);
	}

	const nucaLeft = ear === "derecho";
	const choice = (on: boolean) => (on ? "default" : "outline");

	return (
		<div className="grid gap-3 border p-3">
			<p className="font-medium text-sm">Oído {ear}</p>

			<div className="flex flex-wrap gap-2">
				{PREP.map((p) => (
					<Button
						key={p.key}
						size="sm"
						variant={choice(prep.includes(p.key))}
						onClick={() => togglePrep(p.key)}
					>
						{p.label}
					</Button>
				))}
			</div>

			<div className="grid gap-2 sm:grid-cols-2">
				<div className="flex gap-2">
					<Button
						size="sm"
						variant={choice(hand === "derecha")}
						onClick={() => setHand("derecha")}
					>
						Mano derecha
					</Button>
					<Button
						size="sm"
						variant={choice(hand === "izquierda")}
						onClick={() => setHand("izquierda")}
					>
						Mano izquierda
					</Button>
				</div>
				<div className="flex gap-2">
					<Button
						size="sm"
						variant={choice(speculum === "pediatrico")}
						onClick={() => setSpeculum("pediatrico")}
						disabled={record.current.inserted}
					>
						Espéculo 2,5 mm
					</Button>
					<Button
						size="sm"
						variant={choice(speculum === "adulto")}
						onClick={() => setSpeculum("adulto")}
						disabled={record.current.inserted}
					>
						Espéculo 4 mm
					</Button>
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				{/* Pabellón en vista lateral: arrastrar para traccionar. */}
				<div
					onPointerDown={(e) => {
						(e.target as HTMLElement).setPointerCapture(e.pointerId);
						dragFrom.current = { x: e.clientX, y: e.clientY };
					}}
					onPointerUp={endDrag}
					className="relative grid aspect-square touch-none select-none place-items-center border bg-orange-100/40 text-xs"
					role="img"
					aria-label="Pabellón de la oreja; arrastrá para traccionar"
				>
					<span className="absolute top-1">arriba</span>
					<span className="absolute bottom-1">abajo</span>
					<span className={`absolute ${nucaLeft ? "left-1" : "right-1"}`}>
						nuca
					</span>
					<span className={`absolute ${nucaLeft ? "right-1" : "left-1"}`}>
						cara
					</span>
					<div
						className="h-1/2 w-1/3 rounded-[50%] border-4 border-orange-300 bg-orange-200/70"
						style={{
							transform:
								traction === "arriba-atras"
									? `translate(${nucaLeft ? -8 : 8}px, -8px)`
									: traction === "abajo-atras"
										? `translate(${nucaLeft ? -8 : 8}px, 8px)`
										: undefined,
						}}
					/>
					<span className="absolute bottom-6 text-muted-foreground">
						{traction === null
							? "Arrastrá el pabellón para traccionar"
							: `Tracción: ${traction}`}
					</span>
				</div>

				{/* Vista por el otoscopio: rueda del mouse para introducir. */}
				<div
					onWheel={(e) =>
						insert(Math.sign(e.deltaY) * Math.min(30, Math.abs(e.deltaY) / 8))
					}
					className="relative grid aspect-square place-items-center overflow-hidden rounded-full bg-black"
					role="img"
					aria-label={`Vista del otoscopio, profundidad ${Math.round(depth)}`}
				>
					{depth < CANAL_DEPTH && (
						<div className="size-1/2 rounded-full bg-orange-200/60" />
					)}
					{seesCanal && (
						<div
							className="size-3/4 rounded-full border-[18px]"
							style={{ borderColor: CANAL_COLOR[appearance.canal] }}
						/>
					)}
					{blocked && <div className="size-full bg-rose-300/80" />}
					{seesTympanum && (
						<div
							className="relative size-2/3 rounded-full"
							style={{
								background: TYMPANUM_COLOR[appearance.tympanum],
								transform:
									appearance.tympanum === "abombado" ? "scale(1.1)" : undefined,
							}}
						>
							{appearance.tympanum === "nacarado" && (
								// Triángulo luminoso.
								<div className="absolute right-[20%] bottom-[20%] h-1/4 w-1/6 rotate-45 bg-white/70" />
							)}
						</div>
					)}
					<p className="absolute bottom-3 text-[10px] text-neutral-400">
						Esquema, no es una foto
					</p>
				</div>
			</div>

			{hurts && (
				<p className="text-destructive text-sm">Paciente: «¡Ay! Me duele.»</p>
			)}

			<div className="flex flex-wrap gap-2">
				<Button variant="outline" onClick={() => insert(5)}>
					Introducir
				</Button>
				<Button variant="outline" onClick={() => insert(-10)}>
					Retirar
				</Button>
				<Button variant="outline" onClick={() => setTraction(null)}>
					Soltar el pabellón
				</Button>
			</div>
			<p className="text-muted-foreground text-xs">
				Conducto: {(times.canal / 1000).toFixed(1)} s · Tímpano:{" "}
				{(times.tympanum / 1000).toFixed(1)} s
			</p>

			<div className="flex gap-2">
				<Button variant="outline" onClick={onClose}>
					Cancelar
				</Button>
				<Button onClick={finish} disabled={saving || !hand}>
					Terminar la otoscopia
				</Button>
			</div>
		</div>
	);
}
