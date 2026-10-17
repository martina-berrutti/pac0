// Piezas visuales de Pac0, con la idea de un cuaderno de guardia: hojas con
// cinta, resaltador, subrayados y dibujos a mano. Solo presentación: la
// lógica sigue en cada página.
import { cn } from "@pac0/ui/lib/utils";

// Color de cada tipo de consulta (la cinta de su ficha).
export type Ink = "pen" | "clay" | "sky" | "sage" | "tape";

const INK_VAR: Record<Ink, string> = {
	pen: "var(--pen)",
	clay: "var(--clay)",
	sky: "var(--sky)",
	sage: "var(--sage)",
	tape: "var(--tape)",
};

export function inkForCase(title: string): Ink {
	const t = title.toLowerCase();
	if (t.includes("garganta")) return "clay";
	if (t.includes("oído") || t.includes("oido")) return "sky";
	if (t.includes("presión") || t.includes("presion") || t.includes("hiper"))
		return "pen";
	return "sage";
}

// Contenedor de cada pantalla.
export function Page({
	children,
	className,
	size = "md",
}: {
	children: React.ReactNode;
	className?: string;
	size?: "sm" | "md" | "lg" | "xl";
}) {
	const width = {
		sm: "max-w-md",
		md: "max-w-2xl",
		lg: "max-w-4xl",
		xl: "max-w-6xl",
	}[size];
	return (
		<main
			className={cn(
				"mx-auto grid w-full content-start gap-8 px-4 py-8 sm:py-12",
				width,
				className,
			)}
		>
			{children}
		</main>
	);
}

// Una hoja de papel, con los bordes apenas irregulares y, si se pide, un
// pedazo de cinta arriba.
export function Paper({
	children,
	className,
	as: Tag = "div",
	tape,
	tilt = 0,
}: {
	children: React.ReactNode;
	className?: string;
	as?: "div" | "section" | "li" | "article";
	tape?: Ink;
	tilt?: number;
}) {
	return (
		<Tag
			className={cn(
				"relative border border-border bg-card p-5 shadow-[0_1px_0_var(--border),0_10px_24px_-18px_color-mix(in_oklch,var(--foreground)_45%,transparent)]",
				className,
			)}
			style={{
				borderRadius: "14px 18px 15px 20px / 18px 14px 20px 15px",
				transform: tilt ? `rotate(${tilt}deg)` : undefined,
			}}
		>
			{tape && <Tape ink={tape} />}
			{children}
		</Tag>
	);
}

export function Tape({ ink = "tape" }: { ink?: Ink }) {
	return (
		<span
			aria-hidden="true"
			className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-[-3deg] opacity-80"
			style={{
				background: INK_VAR[ink],
				clipPath:
					"polygon(2% 8%, 98% 0, 100% 30%, 97% 62%, 99% 100%, 3% 94%, 0 60%, 2% 34%)",
			}}
		/>
	);
}

// Resaltador de fibra sobre una frase.
export function Highlight({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn("-mx-0.5 px-0.5 [box-decoration-break:clone]", className)}
			style={{
				backgroundImage:
					"linear-gradient(100deg, transparent 0.4em, var(--highlighter) 0.5em, var(--highlighter) calc(100% - 0.5em), transparent calc(100% - 0.3em))",
				backgroundSize: "100% 62%",
				backgroundPosition: "0 78%",
				backgroundRepeat: "no-repeat",
			}}
		>
			{children}
		</span>
	);
}

// Subrayado a mano, en birome.
export function Underline({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("relative inline-block", className)}>
			{children}
			<svg
				viewBox="0 0 200 14"
				preserveAspectRatio="none"
				className="pointer-events-none absolute -bottom-2 left-0 h-3 w-full text-pen"
				aria-hidden="true"
			>
				<path
					d="M3 9 C 40 4, 80 5, 120 7 S 175 10, 197 4"
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					strokeLinecap="round"
					pathLength={1}
					strokeDasharray={1}
					className="animate-draw"
				/>
			</svg>
		</span>
	);
}

// La nota del informe, encerrada con birome como la marca un docente.
export function Grade({ value }: { value: number }) {
	const pct = Math.max(0, Math.min(100, Math.round(value)));
	return (
		<div
			className="relative grid size-40 shrink-0 place-items-center"
			role="img"
			aria-label={`Puntaje: ${pct} de 100`}
		>
			<svg
				viewBox="0 0 120 110"
				className="absolute inset-0 size-full text-pen"
				aria-hidden="true"
			>
				<path
					d="M64 9 C 96 8, 116 30, 112 58 C 108 88, 78 104, 50 100 C 21 96, 5 74, 9 47 C 13 22, 36 5, 70 12"
					fill="none"
					stroke="currentColor"
					strokeWidth="3.2"
					strokeLinecap="round"
					pathLength={1}
					strokeDasharray={1}
					className="animate-draw"
				/>
			</svg>
			<span className="grid -rotate-3 place-items-center font-hand text-pen leading-none">
				<span className="text-7xl">{pct}</span>
				<span className="text-xl">/ 100</span>
			</span>
		</div>
	);
}

// Anotación en letra a mano.
export function Note({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"font-hand text-muted-foreground text-xl leading-tight",
				className,
			)}
		>
			{children}
		</span>
	);
}

// Etiqueta sobria: un punto de color y el texto.
export function Tag({
	children,
	ink,
	className,
}: {
	children: React.ReactNode;
	ink?: Ink;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-muted-foreground text-sm",
				className,
			)}
		>
			{ink && (
				<span
					aria-hidden="true"
					className="size-2 rounded-full"
					style={{ background: INK_VAR[ink] }}
				/>
			)}
			{children}
		</span>
	);
}

// Inicial del paciente dentro de un círculo hecho a mano.
export function Initial({ name, ink }: { name: string; ink: Ink }) {
	return (
		<span
			aria-hidden="true"
			className="relative grid size-14 shrink-0 place-items-center"
		>
			<svg
				viewBox="0 0 48 48"
				className="absolute inset-0 size-full"
				style={{ color: INK_VAR[ink] }}
				aria-hidden="true"
			>
				<path
					d="M25 4 C 37 4, 44 13, 44 24 C 44 36, 35 44, 23 44 C 12 43, 4 35, 4.5 23.5 C 5 12, 13 4.5, 27 6"
					fill="currentColor"
					fillOpacity="0.35"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
				/>
			</svg>
			<span className="relative font-display font-semibold text-2xl">
				{name.trim().charAt(0).toUpperCase()}
			</span>
		</span>
	);
}

// Dibujos a mano alzada para los pasos del inicio.
function Doodle({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<svg
			viewBox="0 0 64 64"
			className={cn("size-16 text-primary", className)}
			fill="none"
			stroke="currentColor"
			strokeWidth="2.4"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

export function DoodleTalk({ className }: { className?: string }) {
	return (
		<Doodle className={className}>
			<path d="M11 15 C 11 9.5, 15 7.5, 21 7.8 L 45 8.4 C 51.5 8.6, 55 11.5, 54.6 17.6 L 54 33 C 53.7 39, 50 41.6, 44.6 41.4 L 27 41.6 L 16.5 52 L 18.4 41.8 C 12.6 41.5, 9.4 38.2, 9.6 32.6 Z" />
			<path d="M19 20.5 C 27 19.6, 35 20, 44 19.4" />
			<path d="M19 29 C 25 28.4, 31 28.8, 37 28.2" />
		</Doodle>
	);
}

export function DoodleStethoscope({ className }: { className?: string }) {
	return (
		<Doodle className={className}>
			<path d="M17 7 C 13.5 18, 13 28, 23.5 33.5 C 34 28.6, 34 18.5, 31 7.4" />
			<path d="M14.6 7.4 l4.6 -0.6 M28.6 7.6 l4.6 0.2" />
			<path d="M23.5 33.5 C 23.2 44, 29 51.8, 39 50.6 C 47.4 49.6, 50.2 42, 46.6 35.6" />
			<path d="M46.4 23.4 C 51.6 23.6, 53.4 28, 52.4 31.4 C 51.2 35.4, 45.6 36.6, 42.6 33.4 C 39.8 30.4, 41 23.2, 46.4 23.4 Z" />
		</Doodle>
	);
}

export function DoodleChart({ className }: { className?: string }) {
	return (
		<Doodle className={className}>
			<path d="M14 9 C 26 8.4, 38 8.6, 49 9.4 L 50.4 55.6 C 38 56, 26 55.8, 15.4 55.2 Z" />
			<path d="M20 21 l3.6 4 l7.8 -8.6" />
			<path d="M35.6 21.6 C 39 21.2, 41.6 21.4, 44.4 21.2" />
			<path d="M20 35 l3.6 4 l7.8 -8.6" />
			<path d="M35.6 35.6 C 39 35.2, 41.6 35.4, 44.4 35.2" />
			<path d="M21 47.6 C 29 47, 37 47.4, 44 46.8" />
		</Doodle>
	);
}

// Selector nativo con el estilo de la marca.
export const selectClass =
	"h-11 w-full rounded-[0.7rem] border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

// Botón como enlace (los Link de Next no usan el componente Button).
export function linkButtonClass(variant: "primary" | "quiet" = "primary") {
	return cn(
		"inline-flex h-12 items-center justify-center gap-2 font-semibold text-[0.95rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
		variant === "primary"
			? "rounded-[0.7rem] border-black/25 border-b-[3px] bg-primary px-6 text-primary-foreground hover:bg-primary/90 active:translate-y-px active:border-b"
			: "px-2 text-foreground underline decoration-2 decoration-pen underline-offset-[6px] hover:decoration-[3px]",
	);
}
