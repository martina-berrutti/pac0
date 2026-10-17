"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@pac0/backend/convex/_generated/api";
import { Button } from "@pac0/ui/components/button";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ModeToggle } from "./mode-toggle";

export default function Header() {
	const { isAuthenticated } = useConvexAuth();
	const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
	const { signOut } = useAuthActions();
	const router = useRouter();

	return (
		<div>
			<div className="flex flex-row items-center justify-between px-2 py-1">
				<nav className="flex gap-4 text-lg">
					<Link href="/">Paciente 0</Link>
				</nav>
				<div className="flex items-center gap-2">
					{isAuthenticated && (
						<>
							{viewer?.alias && (
								<span className="text-muted-foreground text-sm">
									{viewer.alias}
								</span>
							)}
							<Button
								variant="outline"
								onClick={async () => {
									await signOut();
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
