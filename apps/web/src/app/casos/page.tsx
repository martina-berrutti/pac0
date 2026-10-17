"use client";

import { api } from "@pac0/backend/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import Loader from "@/components/loader";

// Versión mínima protegida de "elegir caso"; la Persona 3 la diseña.
export default function CasesPage() {
	const { isAuthenticated } = useConvexAuth();
	const viewer = useQuery(api.users.viewer);
	// Sin sesión (por ejemplo, justo después de "Salir") no se consulta.
	const cases = useQuery(api.cases.list, isAuthenticated ? {} : "skip");
	const router = useRouter();

	const needsProfile = viewer !== undefined && viewer?.alias === null;
	useEffect(() => {
		if (needsProfile) {
			router.replace("/perfil");
		}
	}, [needsProfile, router]);

	if (viewer === undefined || needsProfile) {
		return <Loader />;
	}

	return (
		<div className="container mx-auto grid max-w-xl content-start gap-4 px-4 py-8">
			<h1 className="font-semibold text-2xl">Hola, {viewer?.alias}</h1>
			<h2 className="font-medium">Casos</h2>
			{cases === undefined ? (
				<Loader />
			) : cases.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Todavía no hay casos publicados.
				</p>
			) : (
				<ul className="grid gap-2">
					{cases.map((c) => (
						<li key={c._id} className="border p-3">
							<p className="font-medium">{c.title}</p>
							<p className="text-muted-foreground text-sm">
								{c.patient.name}, {c.patient.age} años: “{c.chiefComplaint}”
							</p>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
