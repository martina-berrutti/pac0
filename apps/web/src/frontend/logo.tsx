// Logo de Pac0. El "0" de Paciente 0 es la cara de Paco, dibujada a mano: un
// círculo imperfecto, dos puntos, una sonrisa y una curita. Usa los colores
// de la marca, así cambia solo con el modo oscuro.
import { cn } from "@pac0/ui/lib/utils";

// La cara sola, para usar como el "0" o como ilustración.
export function PacoFace({
	className,
	strokeWidth = 3.2,
}: {
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<svg
			viewBox="0 0 48 48"
			className={cn("size-9 shrink-0 text-primary", className)}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path
				d="M25 6.5 C 36.5 6, 43 14, 42.5 25 C 42 36.5, 34.5 43, 23.5 42.8 C 12.5 42.5, 5.8 35, 6.2 24 C 6.6 13.5, 13.5 6.2, 26.5 7.6"
				strokeWidth={strokeWidth}
			/>
			<path d="M18.2 21.6 l0.2 0.4" strokeWidth={strokeWidth + 0.6} />
			<path d="M29.4 21.2 l0.2 0.4" strokeWidth={strokeWidth + 0.6} />
			<path
				d="M17 29.2 C 19.6 33.4, 27.4 33.8, 31 28.4"
				strokeWidth={strokeWidth * 0.8}
			/>
			{/* La curita. */}
			<g transform="rotate(-34 34 10)" stroke="none">
				<rect
					x="27"
					y="6.6"
					width="14.5"
					height="6.4"
					rx="3.1"
					fill="var(--pen)"
				/>
				<rect
					x="32.3"
					y="7.6"
					width="3.9"
					height="4.4"
					rx="0.8"
					fill="var(--card)"
				/>
			</g>
		</svg>
	);
}

// "pac" + la cara de Paco como el 0.
export function Logo({
	className,
	tagline = false,
}: {
	className?: string;
	tagline?: boolean;
}) {
	return (
		<span className={cn("inline-flex items-end gap-2", className)}>
			<span className="inline-flex items-center font-display font-semibold text-[1.7rem] leading-none tracking-tight">
				pac
				<PacoFace className="mt-0.5 -ml-0.5 size-[1.55rem]" strokeWidth={4} />
			</span>
			{tagline && (
				<span className="mb-[3px] hidden font-hand text-lg text-muted-foreground leading-none sm:inline">
					tu paciente 0
				</span>
			)}
		</span>
	);
}
