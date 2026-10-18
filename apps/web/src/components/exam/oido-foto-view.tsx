"use client";

// Oído en la consulta a pantalla completa (Persona 3): la foto del otoscopio,
// grande y redonda, sin controles. Lo que se ve lo decide el servidor
// (startOtoscopy); se cierra hablando ("ya está") y guarda cuánto miró. La
// técnica del otoscopio (mano, espéculo, tracción) está en OtoscopioView.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api-client";
import type { Ear, EarAppearance } from "@/lib/contracts/exam";
import { earPhoto } from "@/lib/exam/otoscope";

// Sin foto registrada, un esquema con el color del hallazgo.
const SCHEMA_COLOR = {
	sano: "#e8b4a0",
	eritema: "#d9534f",
	secrecion: "#d8c27a",
	nacarado: "#c9c9cf",
	eritematoso: "#c9605a",
	abombado: "#b8433d",
} as const;

export function OidoFotoView({
	sessionId,
	ear,
	onClose,
	endRequest = 0,
}: {
	sessionId: string;
	ear: Ear;
	onClose: () => void;
	// Sube cuando el estudiante termina el examen hablando.
	endRequest?: number;
}) {
	const [appearance, setAppearance] = useState<EarAppearance | null>(null);
	const action = useRef<{ id: string; shownAt: number } | null>(null);
	const saved = useRef(false);
	const close = useRef(onClose);
	close.current = onClose;

	// Guarda una sola vez cuánto miró (al cerrar hablando o con la cruz).
	const save = useRef(() => {
		const a = action.current;
		if (!a || saved.current) return Promise.resolve();
		saved.current = true;
		return api
			.finishPhotoOtoscopy(sessionId, a.id, performance.now() - a.shownAt)
			.then(() => {})
			.catch(() => toast.error("No se guardó la otoscopia."));
	});

	useEffect(() => {
		let cancelled = false;
		api
			.startOtoscopy(sessionId, ear)
			.then((r) => {
				if (cancelled) return;
				action.current = { id: r.actionId, shownAt: performance.now() };
				setAppearance(r.appearance);
			})
			.catch((e) => {
				toast.error(
					e instanceof ApiError ? e.message : "No se pudo abrir el otoscopio.",
				);
				close.current();
			});
		const finish = save.current;
		return () => {
			cancelled = true;
			void finish();
		};
	}, [sessionId, ear]);

	useEffect(() => {
		if (endRequest > 0) save.current().then(() => close.current());
	}, [endRequest]);

	if (!appearance) return null;
	// Si el conducto está afectado, es lo que se ve primero; si no, el tímpano.
	const canalSick = appearance.canal !== "sano";
	const photo = canalSick
		? earPhoto("conducto", appearance.canal)
		: earPhoto("timpano", appearance.tympanum);
	const color =
		SCHEMA_COLOR[canalSick ? appearance.canal : appearance.tympanum];

	return (
		<figure className="grid justify-items-center gap-2">
			<div
				className="relative aspect-square w-[min(85vw,calc(100svh-9rem))] overflow-hidden rounded-full bg-black shadow-2xl ring-8 ring-neutral-900"
				role="img"
				aria-label={`Otoscopia del oído ${ear}`}
			>
				{photo ? (
					// biome-ignore lint/performance/noImgElement: foto fija de public/, sin optimización de next/image
					<img
						src={photo.src}
						alt={photo.alt}
						draggable={false}
						className="h-full w-full object-cover"
					/>
				) : (
					<div
						className="absolute inset-[18%] rounded-full"
						style={{ background: color }}
					/>
				)}
				{/* Viñeta del otoscopio: el borde se oscurece. */}
				<div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_40px_12px_rgba(0,0,0,0.75)]" />
			</div>
			<figcaption className="rounded-full bg-background/80 px-3 py-1 text-xs backdrop-blur">
				Oído {ear}
				{photo ? ` · Foto: ${photo.credit}` : " · Esquema: foto pendiente"}
			</figcaption>
		</figure>
	);
}
