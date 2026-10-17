"use client";

import { Button } from "@pac0/ui/components/button";
import { Textarea } from "@pac0/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CaseSummary } from "@/cases/schema";
import Loader from "@/components/loader";
import { ApiError, api, type PersonalityOption } from "@/lib/api-client";

// Versión funcional de "elegir caso"; la Persona 3 la diseña.
export default function CasesPage() {
	const router = useRouter();
	const [alias, setAlias] = useState<string | null>(null);
	const [cases, setCases] = useState<CaseSummary[] | null>(null);
	const [personalities, setPersonalities] = useState<PersonalityOption[]>([]);
	const [chosen, setChosen] = useState<Record<string, string>>({});
	const [request, setRequest] = useState("");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		api.me().then(({ viewer }) => {
			if (viewer && !viewer.alias) router.replace("/perfil");
			setAlias(viewer?.alias ?? null);
		});
		api.cases().then((r) => setCases(r.cases));
		api.personalities().then((r) => setPersonalities(r.personalities));
	}, [router]);

	async function start(caseId: string) {
		setBusy(true);
		try {
			const { sessionId } = await api.startSession(
				caseId,
				chosen[caseId] ?? "caso",
			);
			router.push(`/consulta/${sessionId}`);
		} catch (error) {
			toast.error(
				error instanceof ApiError
					? error.message
					: "No pudimos empezar la consulta.",
			);
			setBusy(false);
		}
	}

	async function generate(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		try {
			const r = await api.generateCase(request);
			setCases((current) => [
				r.case,
				...(current ?? []).filter((c) => c.id !== r.case.id),
			]);
			setChosen((current) => ({ ...current, [r.case.id]: r.personalityKey }));
			setRequest("");
			toast.success(
				`Listo: ${r.case.patient.name}, ${r.case.patient.age} años.`,
			);
		} catch (error) {
			toast.error(
				error instanceof ApiError
					? error.message
					: "No pudimos generar el paciente.",
			);
		} finally {
			setBusy(false);
		}
	}

	if (cases === null) return <Loader />;

	return (
		<div className="container mx-auto grid max-w-xl content-start gap-6 px-4 py-8">
			<h1 className="font-semibold text-2xl">
				Hola{alias ? `, ${alias}` : ""}
			</h1>

			<form onSubmit={generate} className="grid gap-2 border p-3">
				<label htmlFor="pedido" className="font-medium">
					Pedime un paciente
				</label>
				<Textarea
					id="pedido"
					value={request}
					onChange={(e) => setRequest(e.target.value)}
					placeholder="Ej.: dame un paciente con algo de garganta, que sea ansioso y de unos 60 años"
					maxLength={300}
				/>
				<Button type="submit" disabled={busy || request.trim().length < 3}>
					Generar paciente
				</Button>
				<p className="text-muted-foreground text-xs">
					Inventamos a la persona; lo clínico sale de plantillas del equipo. Los
					casos generados no fueron revisados por un médico.
				</p>
			</form>

			<section className="grid gap-2">
				<h2 className="font-medium">Casos</h2>
				<ul className="grid gap-2">
					{cases.map((c) => (
						<li key={c.id} className="grid gap-2 border p-3">
							<div>
								<p className="font-medium">
									{c.title}
									{c.origin === "generado" && (
										<span className="ml-2 text-muted-foreground text-xs">
											generado
										</span>
									)}
									{!c.reviewed && (
										<span className="ml-2 text-muted-foreground text-xs">
											sin revisar
										</span>
									)}
								</p>
								<p className="text-muted-foreground text-sm">
									{c.patient.name}, {c.patient.age} años: “{c.chiefComplaint}”
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<select
									aria-label="Personalidad"
									value={chosen[c.id] ?? "caso"}
									onChange={(e) =>
										setChosen((cur) => ({ ...cur, [c.id]: e.target.value }))
									}
									className="h-8 border border-input bg-background px-2 text-sm"
								>
									<option value="caso">Personalidad del caso</option>
									{personalities.map((p) => (
										<option key={p.key} value={p.key}>
											{p.label}
										</option>
									))}
								</select>
								<Button disabled={busy} onClick={() => start(c.id)}>
									Empezar consulta
								</Button>
							</div>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
