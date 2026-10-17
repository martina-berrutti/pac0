"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@pac0/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SignInPage() {
	const { signIn } = useAuthActions();
	const router = useRouter();
	const [pending, setPending] = useState<"google" | "invitado" | null>(null);

	async function enterAsGuest() {
		setPending("invitado");
		try {
			await signIn("anonymous");
			router.replace("/casos");
		} catch {
			toast.error("No pudimos entrar como invitado. Probá de nuevo.");
			setPending(null);
		}
	}

	async function enterWithGoogle() {
		setPending("google");
		try {
			await signIn("google", { redirectTo: "/casos" });
		} catch {
			toast.error("No pudimos entrar con Google. Probá de nuevo.");
			setPending(null);
		}
	}

	return (
		<div className="container mx-auto grid max-w-sm content-center gap-4 px-4 py-8">
			<h1 className="font-semibold text-2xl">Entrar</h1>
			<Button
				size="lg"
				className="h-11"
				disabled={pending !== null}
				onClick={enterWithGoogle}
			>
				{pending === "google" ? "Abriendo Google…" : "Entrar con Google"}
			</Button>
			<Button
				size="lg"
				variant="outline"
				className="h-11"
				disabled={pending !== null}
				onClick={enterAsGuest}
			>
				{pending === "invitado" ? "Entrando…" : "Entrar como invitado"}
			</Button>
			<p className="text-muted-foreground text-sm">
				Solo guardamos un alias y tu año de carrera. De tu cuenta de Google no
				guardamos ni el nombre ni el correo. Lo que hace un invitado se borra a
				las 24 horas.
			</p>
		</div>
	);
}
