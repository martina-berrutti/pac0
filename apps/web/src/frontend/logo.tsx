// Logo de Pac0. El "0" de Paciente 0 es la cara de Paco: un paciente redondo,
// sonriente y con una curita. Se dibuja con los colores de la marca, así
// cambia solo con el modo oscuro.
import { cn } from "@pac0/ui/lib/utils";

export function LogoMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 48 48"
			className={cn("size-9 shrink-0", className)}
			aria-hidden="true"
		>
			<rect x="1" y="1" width="46" height="46" rx="15" fill="var(--primary)" />
			{/* El 0: la cara. */}
			<ellipse
				cx="24"
				cy="25.5"
				rx="11.5"
				ry="13"
				fill="none"
				stroke="var(--primary-foreground)"
				strokeWidth="4.5"
			/>
			<circle cx="19.8" cy="23.5" r="1.9" fill="var(--primary-foreground)" />
			<circle cx="28.2" cy="23.5" r="1.9" fill="var(--primary-foreground)" />
			<path
				d="M19.6 29 q4.4 3.8 8.8 0"
				fill="none"
				stroke="var(--primary-foreground)"
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
			{/* La curita. */}
			<g transform="rotate(-38 32.5 13.5)">
				<rect
					x="25.5"
					y="10.5"
					width="14"
					height="6"
					rx="3"
					fill="var(--coral)"
				/>
				<rect
					x="30.5"
					y="10.5"
					width="4"
					height="6"
					fill="var(--coral-soft)"
					opacity="0.85"
				/>
			</g>
		</svg>
	);
}

export function Logo({
	className,
	markClassName,
	tagline = false,
}: {
	className?: string;
	markClassName?: string;
	tagline?: boolean;
}) {
	return (
		<span className={cn("inline-flex items-center gap-2.5", className)}>
			<LogoMark className={markClassName} />
			<span className="grid leading-none">
				<span className="font-bold font-display text-[1.35rem] tracking-tight">
					pac<span className="text-coral">0</span>
				</span>
				{tagline && (
					<span className="mt-1 text-[0.65rem] text-muted-foreground uppercase tracking-[0.18em]">
						Paciente 0
					</span>
				)}
			</span>
		</span>
	);
}
