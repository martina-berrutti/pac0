"use client";

// Entrada: solo como invitado. El login con Google se sacó de la pantalla
// (Persona 3); las rutas de /api/auth/google siguen, sin botón que las use.
import { Button } from "@pac0/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PacoFace } from "@/frontend/logo";
import { Page, Paper } from "@/frontend/ui";
import { api } from "@/lib/api-client";

export default function SignInPage() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function enterAsGuest() {
		setPending(true);
		try {
			await api.enterAsGuest();
			router.replace("/casos");
		} catch {
			toast.error("No pudimos entrar como invitado. Probá de nuevo.");
			setPending(false);
		}
	}

	return (
		<Page size="sm" className="min-h-[calc(100svh-4rem)] content-center">
			<Paper tape="sage" tilt={-1} className="grid gap-7 px-7 pt-10 pb-8">
				<div className="grid justify-items-center gap-3 text-center">
					<PacoFace className="size-16" strokeWidth={2.8} />
					<h1 className="font-display text-3xl">Hola, soy Paco</h1>
					<p className="text-muted-foreground">
						Entrá y elegí a tu primer paciente. Es un minuto.
					</p>
				</div>
				<Button
					size="lg"
					className="h-12 border-black/25 border-b-[3px] text-base"
					disabled={pending}
					onClick={enterAsGuest}
				>
					{pending ? "Entrando…" : "Entrar como invitado"}
				</Button>
				<p className="border-border border-t border-dashed pt-5 text-muted-foreground text-sm leading-relaxed">
					Solo guardamos un alias y tu año de carrera. Lo que hacés se borra a
					las 24 horas.
				</p>
			</Paper>
		</Page>
	);
}
