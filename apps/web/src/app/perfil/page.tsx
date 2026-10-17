"use client";

import { Button } from "@pac0/ui/components/button";
import { Input } from "@pac0/ui/components/input";
import { Label } from "@pac0/ui/components/label";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api-client";

const YEARS = [
	{ value: "1", label: "1º" },
	{ value: "2", label: "2º" },
	{ value: "3", label: "3º" },
	{ value: "4", label: "4º" },
	{ value: "5", label: "5º" },
	{ value: "6", label: "6º" },
	{ value: "internado", label: "Internado" },
	{ value: "recibido", label: "Recién recibido" },
];

// Alias y año de carrera (plan.md, sección 10).
export default function ProfilePage() {
	const router = useRouter();
	const [alias, setAlias] = useState("");
	const [year, setYear] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		api.me().then(({ viewer }) => {
			if (viewer) {
				setAlias(viewer.alias ?? "");
				setYear(viewer.careerYear ?? "");
			}
		});
	}, []);

	async function save(event: React.FormEvent) {
		event.preventDefault();
		if (!year) return;
		setSaving(true);
		try {
			await api.saveProfile(alias, year);
			router.replace("/casos");
		} catch (error) {
			toast.error(
				error instanceof ApiError
					? error.message
					: "No pudimos guardar. Probá de nuevo.",
			);
			setSaving(false);
		}
	}

	return (
		<form
			onSubmit={save}
			className="container mx-auto grid max-w-sm content-center gap-4 px-4 py-8"
		>
			<h1 className="font-semibold text-2xl">Tu perfil</h1>
			<div className="grid gap-2">
				<Label htmlFor="alias">Alias</Label>
				<Input
					id="alias"
					value={alias}
					onChange={(e) => setAlias(e.target.value)}
					maxLength={24}
					autoComplete="off"
					placeholder="Por ejemplo: Doctora Pato"
					required
				/>
				<p className="text-muted-foreground text-xs">
					No uses tu nombre real, tu cédula ni tu teléfono.
				</p>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="year">Año de carrera</Label>
				<select
					id="year"
					value={year}
					onChange={(e) => setYear(e.target.value)}
					className="h-9 border border-input bg-background px-2 text-sm"
					required
				>
					<option value="" disabled>
						Elegí uno
					</option>
					{YEARS.map((y) => (
						<option key={y.value} value={y.value}>
							{y.label}
						</option>
					))}
				</select>
			</div>
			<Button type="submit" size="lg" className="h-11" disabled={saving}>
				{saving ? "Guardando…" : "Continuar"}
			</Button>
		</form>
	);
}
