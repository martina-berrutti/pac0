"use client";
import { Button } from "@pac0/ui/components/button";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
		<header className="sticky top-0 z-30 border-border/60 border-b bg-background/75 backdrop-blur-md">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
				<Link
					href={me ? "/casos" : "/"}
					className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					aria-label="Pac0, inicio"
				>
					<Logo tagline />
				</Link>
				<div className="flex items-center gap-2">
					{me && (
						<>
							{me.alias && (
								<Link
									href="/perfil"
									className="hidden items-center gap-2 rounded-full bg-secondary py-1 pr-3 pl-1 font-medium text-secondary-foreground text-sm sm:inline-flex"
								>
									<span className="grid size-7 place-items-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
										{me.alias.charAt(0).toUpperCase()}
									</span>
									{me.alias}
								</Link>
							)}
							<Button
								variant="ghost"
								onClick={async () => {
									await api.logout();
									setMe(null);
									router.replace("/");
								}}
							>
								<LogOut aria-hidden="true" />
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
