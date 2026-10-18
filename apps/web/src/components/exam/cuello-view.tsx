"use client";

// Palpación de los ganglios del cuello (Persona 3, odinofagia). El estudiante
// toca las cadenas cervicales anteriores de los dos lados; al palpar, el
// servidor registra el examen y devuelve el hallazgo del caso.
import { Button } from "@pac0/ui/components/button";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api-client";

type Side = "derecha" | "izquierda";

// Cadena cervical anterior de cada lado, en el dibujo. El lado derecho de la
// paciente queda a la izquierda de la pantalla (está de frente).
const ZONES: Record<Side, { cx: number; label: string }> = {
	derecha: { cx: 118, label: "Ganglios del lado derecho del cuello" },
	izquierda: { cx: 182, label: "Ganglios del lado izquierdo del cuello" },
};

export function CuelloView({
	sessionId,
	onClose,
}: {
	sessionId: string;
	onClose: () => void;
}) {
	const [touched, setTouched] = useState<Side[]>([]);
	const [finding, setFinding] = useState<string | null>(null);
	// Se registra una sola palpación por vez que se abre la vista.
	const asked = useRef<Promise<string | null> | null>(null);

	function palpate(side: Side) {
		if (!asked.current)
			asked.current = api
				.palpateNeck(sessionId)
				.then((r) => r.finding)
				.catch((e) => {
					asked.current = null;
					toast.error(
						e instanceof ApiError ? e.message : "No se pudo palpar el cuello.",
					);
					return null;
				});
		void asked.current.then((f) => {
			if (!f) return;
			setTouched((t) => (t.includes(side) ? t : [...t, side]));
			setFinding(f);
		});
	}

	const both = touched.length === 2;

	return (
		<div className="grid gap-4 rounded-2xl border bg-card p-4">
			<p className="text-muted-foreground text-sm">
				{both
					? "Palpaste los dos lados."
					: touched.length === 1
						? "Ahora palpá el otro lado."
						: "Tocá los ganglios de cada lado del cuello, por delante del músculo."}
			</p>

			<div className="relative">
				<svg
					viewBox="0 0 300 220"
					className="w-full text-primary"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					{/* Mentón y mandíbula */}
					<path
						d="M92 20 C 96 70, 120 96, 150 100 C 180 96, 204 70, 208 20"
						fill="color-mix(in oklch, var(--clay) 45%, var(--card))"
					/>
					{/* Cuello */}
					<path
						d="M112 88 C 112 130, 108 170, 92 210 L 208 210 C 192 170, 188 130, 188 88"
						fill="color-mix(in oklch, var(--clay) 35%, var(--card))"
					/>
					{/* Esternocleidomastoideos */}
					<path d="M116 92 C 124 140, 136 180, 146 206" strokeWidth="1.5" />
					<path d="M184 92 C 176 140, 164 180, 154 206" strokeWidth="1.5" />
					{/* Tráquea */}
					<path
						d="M150 112 L 150 190"
						strokeWidth="1.2"
						strokeDasharray="4 5"
					/>
				</svg>

				{(Object.keys(ZONES) as Side[]).map((side) => {
					const z = ZONES[side];
					const done = touched.includes(side);
					return (
						<button
							key={side}
							type="button"
							onClick={() => palpate(side)}
							aria-label={z.label}
							aria-pressed={done}
							className={`absolute top-[50%] size-[13%] -translate-x-1/2 rounded-full border-2 border-dashed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
								done
									? "border-primary bg-primary/25"
									: "border-pen bg-pen/10 hover:bg-pen/20"
							}`}
							style={{ left: `${(z.cx / 300) * 100}%` }}
						/>
					);
				})}
			</div>

			{finding && (
				<p
					className="rounded-md border bg-secondary px-3 py-2 text-sm"
					aria-live="polite"
				>
					{finding}
				</p>
			)}

			<div className="flex gap-2">
				<Button variant="outline" onClick={onClose}>
					{touched.length > 0 ? "Listo" : "Cancelar"}
				</Button>
			</div>
		</div>
	);
}
