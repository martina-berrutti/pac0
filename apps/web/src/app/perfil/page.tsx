"use client";

import { Button } from "@pac0/ui/components/button";
import { Input } from "@pac0/ui/components/input";
import { Label } from "@pac0/ui/components/label";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Note, Page, Paper } from "@/frontend/ui";
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
		<Page size="sm" className="min-h-[calc(100svh-4rem)] content-center">
			<Paper tape="clay" tilt={1} className="px-7 pt-10 pb-8">
				<form onSubmit={save} className="grid gap-6">
					<div className="grid gap-1.5">
						<Note className="-rotate-1 text-pen">un paso más…</Note>
						<h1 className="font-display text-3xl">¿Cómo te llamamos?</h1>
						<p className="text-muted-foreground">
							Elegí un alias divertido: es lo único que vamos a mostrar.
						</p>
					</div>
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
					<fieldset className="grid gap-2">
						<legend className="mb-2 font-medium text-sm">Año de carrera</legend>
						<div className="flex flex-wrap gap-2">
							{YEARS.map((y) => (
								<label
									key={y.value}
									className="cursor-pointer rounded-[0.6rem] border border-input bg-card px-4 py-2 font-medium text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
								>
									<input
										type="radio"
										name="year"
										value={y.value}
										checked={year === y.value}
										onChange={() => setYear(y.value)}
										className="sr-only"
										required
									/>
									{y.label}
								</label>
							))}
						</div>
					</fieldset>
					<Button
						type="submit"
						size="lg"
						className="h-12 border-black/25 border-b-[3px] text-base"
						disabled={saving || !year}
					>
						{saving ? "Guardando…" : "Conocer a mis pacientes"}
					</Button>
				</form>
			</Paper>
		</Page>
	);
}
