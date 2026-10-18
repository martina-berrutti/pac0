"use client";
import { Button } from "@pac0/ui/components/button";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/frontend/logo";
import { api, type Me } from "@/lib/api-client";

import { ModeToggle } from "./mode-toggle";

export default function Header() {
	const [me, setMe] = useState<Me | null>(null);
	const pathname = usePathname();
	const router = useRouter();

	// Se vuelve a leer al cambiar de pantalla (entrar, perfil, salir).
	useEffect(() => {
		if (!pathname) return;
		api
			.me()
			.then((r) => setMe(r.viewer))
			.catch(() => setMe(null));
	}, [pathname]);

	return (
		<header className="sticky top-0 z-30 border-border border-b border-dashed bg-background/90 backdrop-blur-sm">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
				<Link
					href={me ? "/casos" : "/"}
					className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					aria-label="Pac0, inicio"
				>
					<Logo tagline />
				</Link>
				<div className="flex items-center gap-1 sm:gap-3">
					{me && (
						<>
							{me.alias && (
								<Link
									href="/perfil"
									className="hidden text-muted-foreground text-sm hover:text-foreground sm:inline"
								>
									<span className="font-hand text-lg">hola,</span>{" "}
									<span className="font-medium text-foreground">
										{me.alias}
									</span>
								</Link>
							)}
							<Button
								variant="ghost"
								onClick={async () => {
									try {
										await api.logout();
									} catch {
										toast.error("No pudimos cerrar la sesión. Probá de nuevo.");
										return;
									}
									setMe(null);
									router.replace("/");
								}}
							>
								Salir
							</Button>
						</>
					)}
					<ModeToggle />
				</div>
			</div>
		</header>
	);
}
