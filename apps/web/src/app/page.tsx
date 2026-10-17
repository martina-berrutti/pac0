import Link from "next/link";

// Inicio mínimo; la Persona 3 lo diseña (DESIGN.md).
export default function Home() {
	return (
		<div className="container mx-auto grid max-w-xl content-center gap-6 px-4 py-8">
			<h1 className="font-semibold text-3xl">Paciente 0</h1>
			<p>
				Entrevistá por voz a un paciente simulado, examinalo con herramientas
				virtuales y recibí un puntaje con feedback.
			</p>
			<Link
				href="/entrar"
				className="inline-flex h-11 items-center justify-center bg-primary px-4 font-medium text-primary-foreground"
			>
				Empezar
			</Link>
			<p className="text-muted-foreground text-sm">
				Herramienta educativa de práctica: no reemplaza a pacientes reales ni a
				docentes. Los casos son ficticios.
			</p>
		</div>
	);
}
