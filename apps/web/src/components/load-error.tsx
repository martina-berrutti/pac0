import Link from "next/link";

import { LogoMark } from "@/frontend/logo";
import { linkButtonClass, Page, Surface } from "@/frontend/ui";

// Cuando una pantalla no puede cargar sus datos: mensaje y salida, en vez de
// quedarse cargando para siempre.
export default function LoadError({ message }: { message: string }) {
	return (
		<Page size="sm" className="min-h-[calc(100svh-4rem)] content-center">
			<Surface className="grid justify-items-center gap-4 p-8 text-center">
				<LogoMark className="size-14 grayscale" />
				<p className="font-semibold text-lg">{message}</p>
				<Link href="/casos" className={linkButtonClass("primary")}>
					Volver a los casos
				</Link>
			</Surface>
		</Page>
	);
}
