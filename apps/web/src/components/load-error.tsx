import Link from "next/link";

// Cuando una pantalla no puede cargar sus datos: mensaje y salida, en vez de
// quedarse cargando para siempre.
export default function LoadError({ message }: { message: string }) {
	return (
		<div className="container mx-auto grid max-w-sm content-center gap-4 px-4 py-8 text-center">
			<p className="font-medium">{message}</p>
			<Link
				href="/casos"
				className="inline-flex h-11 items-center justify-center bg-primary px-4 font-medium text-primary-foreground"
			>
				Volver a los casos
			</Link>
		</div>
	);
}
