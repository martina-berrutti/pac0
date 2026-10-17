"use client";

import { Button } from "@pac0/ui/components/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
		<div className="container mx-auto grid max-w-sm content-center gap-4 px-4 py-8">
			<h1 className="font-semibold text-2xl">Entrar</h1>
			<Button
				size="lg"
				className="h-11"
				disabled={pending !== null}
				onClick={enterAsGuest}
			>
				{pending === "invitado" ? "Entrando…" : "Entrar como invitado"}
			</Button>
			<Button
				size="lg"
				variant="outline"
				className="h-11"
				disabled={pending !== null}
				onClick={enterWithGoogle}
			>
				{pending === "google" ? "Abriendo Google…" : "Entrar con Google"}
			</Button>
			<p className="text-muted-foreground text-sm">
				Solo guardamos un alias y tu año de carrera. De tu cuenta de Google no
				guardamos ni el nombre ni el correo. Lo que hace un invitado se borra a
				las 24 horas.
			</p>
		</div>
	);
}
