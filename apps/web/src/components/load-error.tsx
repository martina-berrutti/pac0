import Link from "next/link";

import { PacoFace } from "@/frontend/logo";
import { linkButtonClass, Page, Paper } from "@/frontend/ui";

// Cuando una pantalla no puede cargar sus datos: mensaje y salida, en vez de
// quedarse cargando para siempre.
export default function LoadError({ message }: { message: string }) {
	return (
		<Page size="sm" className="min-h-[calc(100svh-4rem)] content-center">
			<Paper className="grid justify-items-center gap-4 p-8 text-center">
				<PacoFace className="size-14 text-muted-foreground" />
				<p className="font-display text-xl">{message}</p>
				<Link href="/casos" className={linkButtonClass("primary")}>
					Volver a los casos
				</Link>
			</Paper>
		</Page>
	);
}
