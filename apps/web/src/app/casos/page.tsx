"use client";

import { Button } from "@pac0/ui/components/button";
import { Textarea } from "@pac0/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CaseSummary } from "@/cases/schema";
import Loader from "@/components/loader";
import { ApiError, api, type PersonalityOption } from "@/lib/api-client";

// Valor del selector de problema para sortear uno.
const RANDOM = "azar";

// Los casos del mismo paciente (group) van en una sola tarjeta; los
// generados, cada uno en la suya.
function groupCases(cases: CaseSummary[]) {
	const groups = new Map<string, CaseSummary[]>();
	for (const c of cases) {
		const key = c.group ?? c.id;
		groups.set(key, [...(groups.get(key) ?? []), c]);
	}
	return [...groups.entries()].map(([key, list]) => ({ key, cases: list }));
}

// Versión funcional de "elegir caso"; la Persona 3 la diseña.
export default function CasesPage() {
	const router = useRouter();
	const [alias, setAlias] = useState<string | null>(null);
	const [cases, setCases] = useState<CaseSummary[] | null>(null);
	const [personalities, setPersonalities] = useState<PersonalityOption[]>([]);
	const [chosen, setChosen] = useState<Record<string, string>>({});
	// Problema elegido por paciente: id del caso o RANDOM.
	const [problem, setProblem] = useState<Record<string, string>>({});
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

	async function start(key: string, options: CaseSummary[]) {
		const picked = problem[key] ?? options[0]?.id;
		const caseId =
			picked === RANDOM
				? options[Math.floor(Math.random() * options.length)]?.id
				: picked;
		if (!caseId) return;
		setBusy(true);
		try {
			const { sessionId } = await api.startSession(
				caseId,
				chosen[key] ?? "caso",
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
					{groupCases(cases).map(({ key, cases: options }) => {
						const first = options[0];
						if (!first) return null;
						const grouped = options.length > 1;
						return (
							<li key={key} className="grid gap-2 border p-3">
								<div>
									<p className="font-medium">
										{first.title}
										{first.origin === "generado" && (
											<span className="ml-2 text-muted-foreground text-xs">
												generado
											</span>
										)}
										{!first.reviewed && (
											<span className="ml-2 text-muted-foreground text-xs">
												sin revisar
											</span>
										)}
									</p>
									<p className="text-muted-foreground text-sm">
										{first.patient.name}, {first.patient.age} años
										{grouped ? "" : `: “${first.chiefComplaint}”`}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{grouped && (
										<select
											aria-label="Problema"
											value={problem[key] ?? first.id}
											onChange={(e) =>
												setProblem((cur) => ({ ...cur, [key]: e.target.value }))
											}
											className="h-8 border border-input bg-background px-2 text-sm"
										>
											{options.map((c) => (
												<option key={c.id} value={c.id}>
													{c.problem ?? c.id}
												</option>
											))}
											<option value={RANDOM}>Al azar</option>
										</select>
									)}
									<select
										aria-label="Personalidad"
										value={chosen[key] ?? "caso"}
										onChange={(e) =>
											setChosen((cur) => ({ ...cur, [key]: e.target.value }))
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
									<Button disabled={busy} onClick={() => start(key, options)}>
										Empezar consulta
									</Button>
								</div>
							</li>
						);
					})}
				</ul>
			</section>
		</div>
	);
}
