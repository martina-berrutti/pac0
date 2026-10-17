"use client";

import { Button } from "@pac0/ui/components/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PacoFace } from "@/frontend/logo";
import { Page, Paper } from "@/frontend/ui";
import { api } from "@/lib/api-client";

// Mensajes de /api/auth/google cuando el login no sale.
const GOOGLE_ERRORS: Record<string, string> = {
	"google-no-configurado":
		"El login con Google todavía no está configurado. Entrá como invitado.",
	"google-cancelado": "Se canceló el inicio de sesión con Google.",
	"google-fallo": "No pudimos entrar con Google. Probá de nuevo.",
};

export default function SignInPage() {
	const router = useRouter();
	const [pending, setPending] = useState<"invitado" | "google" | null>(null);

	useEffect(() => {
		const error = new URLSearchParams(window.location.search).get("error");
		if (error)
			toast.error(GOOGLE_ERRORS[error] ?? "No pudimos iniciar sesión.");
	}, []);

	async function enterAsGuest() {
		setPending("invitado");
		try {
			await api.enterAsGuest();
			router.replace("/casos");
		} catch {
			toast.error("No pudimos entrar como invitado. Probá de nuevo.");
			setPending(null);
		}
	}

	function enterWithGoogle() {
		setPending("google");
		window.location.href = "/api/auth/google";
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
				<div className="grid gap-3">
					<Button
						size="lg"
						className="h-12 border-black/25 border-b-[3px] text-base"
						disabled={pending !== null}
						onClick={enterAsGuest}
					>
						{pending === "invitado" ? "Entrando…" : "Entrar como invitado"}
					</Button>
					<Button
						size="lg"
						variant="outline"
						className="h-12 text-base"
						disabled={pending !== null}
						onClick={enterWithGoogle}
					>
						{pending === "google" ? "Abriendo Google…" : "Entrar con Google"}
					</Button>
				</div>
				<p className="border-border border-t border-dashed pt-5 text-muted-foreground text-sm leading-relaxed">
					Solo guardamos un alias y tu año de carrera. De tu cuenta de Google no
					guardamos ni el nombre ni el correo. Lo que hace un invitado se borra
					a las 24 horas.
				</p>
			</Paper>
		</Page>
	);
}
