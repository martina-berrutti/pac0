"use client";

import { Button } from "@pac0/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
		<div className="container mx-auto grid max-w-sm content-center gap-4 px-4 py-8">
			<h1 className="font-semibold text-2xl">Entrar</h1>
			<Button
				size="lg"
				className="h-11"
				disabled={pending}
				onClick={enterAsGuest}
			>
				{pending ? "Entrando…" : "Entrar como invitado"}
			</Button>
			{/* Google vuelve con Convex Auth al final (TODO.md, fase final). */}
			<Button size="lg" variant="outline" className="h-11" disabled>
				Entrar con Google (pronto)
			</Button>
			<p className="text-muted-foreground text-sm">
				Solo guardamos un alias y tu año de carrera. Lo que hace un invitado se
				borra a las 24 horas.
			</p>
		</div>
	);
}
