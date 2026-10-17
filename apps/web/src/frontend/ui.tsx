// Piezas visuales de Pac0 que comparten las pantallas. Solo presentación: la
// lógica sigue en cada página.
import { cn } from "@pac0/ui/lib/utils";
import type { LucideIcon } from "lucide-react";

export type Tone = "primary" | "coral" | "sun" | "mint" | "muted";

const TONE_SOFT: Record<Tone, string> = {
	primary: "bg-secondary text-secondary-foreground",
	coral: "bg-coral-soft text-accent-foreground",
	sun: "bg-sun-soft text-foreground",
	mint: "bg-mint-soft text-secondary-foreground",
	muted: "bg-muted text-muted-foreground",
};

const TONE_SOLID: Record<Tone, string> = {
	primary: "bg-primary text-primary-foreground",
	coral: "bg-coral text-white",
	sun: "bg-sun text-foreground",
	mint: "bg-mint text-foreground",
	muted: "bg-muted-foreground text-background",
};

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
				"mx-auto grid w-full content-start gap-6 px-4 py-6 sm:py-10",
				width,
				className,
			)}
		>
			{children}
		</main>
	);
}

export function Surface({
	children,
	className,
	as: Tag = "div",
}: {
	children: React.ReactNode;
	className?: string;
	as?: "div" | "section" | "li" | "form" | "article";
}) {
	return (
		<Tag
			className={cn(
				"rounded-3xl border bg-card p-5 shadow-[0_1px_0_0_var(--border),0_12px_32px_-18px_color-mix(in_oklch,var(--foreground)_25%,transparent)]",
				className,
			)}
		>
			{children}
		</Tag>
	);
}

export function Pill({
	children,
	tone = "muted",
	className,
}: {
	children: React.ReactNode;
	tone?: Tone;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium text-xs",
				TONE_SOFT[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}

export function IconBubble({
	icon: Icon,
	tone = "primary",
	className,
}: {
	icon: LucideIcon;
	tone?: Tone;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"grid size-11 shrink-0 place-items-center rounded-2xl",
				TONE_SOFT[tone],
				className,
			)}
		>
			<Icon className="size-5" aria-hidden="true" />
		</span>
	);
}

// Iniciales del paciente en un círculo de color.
export function PatientBadge({
	name,
	tone = "primary",
	className,
}: {
	name: string;
	tone?: Tone;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid size-14 shrink-0 place-items-center rounded-2xl font-bold font-display text-xl",
				TONE_SOLID[tone],
				className,
			)}
		>
			{name.trim().charAt(0).toUpperCase()}
		</span>
	);
}

// Color por tipo de consulta, para que cada caso se reconozca de un vistazo.
export function toneForCase(title: string): Tone {
	const t = title.toLowerCase();
	if (t.includes("garganta")) return "coral";
	if (t.includes("oído") || t.includes("oido")) return "sun";
	if (t.includes("presión") || t.includes("presion") || t.includes("hiper"))
		return "primary";
	return "mint";
}

export function PageHeader({
	eyebrow,
	title,
	children,
	className,
}: {
	eyebrow?: React.ReactNode;
	title: React.ReactNode;
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<header className={cn("grid gap-2", className)}>
			{eyebrow && (
				<p className="font-semibold text-primary text-xs uppercase tracking-[0.16em]">
					{eyebrow}
				</p>
			)}
			<h1 className="text-balance font-bold text-3xl leading-tight sm:text-4xl">
				{title}
			</h1>
			{children && (
				<div className="max-w-prose text-pretty text-muted-foreground">
					{children}
				</div>
			)}
		</header>
	);
}

// Puntaje de 0 a 100 en un anillo.
export function ScoreRing({
	value,
	tone = "primary",
	size = 148,
	label,
}: {
	value: number;
	tone?: "primary" | "coral" | "sun" | "success";
	size?: number;
	label?: string;
}) {
	const stroke = 12;
	const r = (size - stroke) / 2;
	const c = 2 * Math.PI * r;
	const pct = Math.max(0, Math.min(100, value));
	const color = {
		primary: "var(--primary)",
		coral: "var(--coral)",
		sun: "var(--sun)",
		success: "var(--success)",
	}[tone];
	return (
		<div
			className="relative grid shrink-0 place-items-center"
			style={{ width: size, height: size }}
			role="img"
			aria-label={`${label ?? "Puntaje"}: ${pct}%`}
		>
			<svg width={size} height={size} className="-rotate-90" aria-hidden="true">
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill="none"
					stroke="var(--muted)"
					strokeWidth={stroke}
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill="none"
					stroke={color}
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={c}
					strokeDashoffset={c * (1 - pct / 100)}
					className="transition-[stroke-dashoffset] duration-1000 ease-out"
				/>
			</svg>
			<span className="absolute grid place-items-center leading-none">
				<span className="font-bold font-display text-4xl">{pct}</span>
				<span className="text-muted-foreground text-xs">de 100</span>
			</span>
		</div>
	);
}

// Selector nativo con el estilo de la marca.
export const selectClass =
	"h-10 rounded-full border border-input bg-card px-3.5 pr-8 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

// Botón como enlace (los Link de Next no usan el componente Button).
export function linkButtonClass(variant: "primary" | "outline" = "primary") {
	return cn(
		"inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 font-semibold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px",
		variant === "primary"
			? "bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)] hover:brightness-110"
			: "border bg-card hover:bg-muted",
	);
}
