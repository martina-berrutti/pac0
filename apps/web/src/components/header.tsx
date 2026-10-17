"use client";
import { Button } from "@pac0/ui/components/button";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
		<div>
			<div className="flex flex-row items-center justify-between px-2 py-1">
				<nav className="flex gap-4 text-lg">
					<Link href="/">Paciente 0</Link>
				</nav>
				<div className="flex items-center gap-2">
					{me && (
						<>
							{me.alias && (
								<span className="text-muted-foreground text-sm">
									{me.alias}
								</span>
							)}
							<Button
								variant="outline"
								onClick={async () => {
									await api.logout();
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
			<hr />
		</div>
	);
}
