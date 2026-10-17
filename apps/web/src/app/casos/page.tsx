"use client";

import { Button } from "@pac0/ui/components/button";
import { Textarea } from "@pac0/ui/components/textarea";
import { Sparkles, Stethoscope, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CaseSummary } from "@/cases/schema";
import Loader from "@/components/loader";
import {
	IconBubble,
	Page,
	PageHeader,
	PatientBadge,
	Pill,
	Surface,
	selectClass,
	toneForCase,
} from "@/frontend/ui";
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
		<Page size="lg">
			<PageHeader
				eyebrow="Tus pacientes"
				title={
					<>
						Hola{alias ? `, ${alias}` : ""}{" "}
						<span className="inline-block origin-[70%_70%] animate-wave">
							👋
						</span>
					</>
				}
			>
				¿A quién atendemos hoy? Elegí un paciente, su forma de ser y empezá la
				consulta. Tenés hasta 8 minutos.
			</PageHeader>

			<ul className="grid gap-4 md:grid-cols-2">
				{groupCases(cases).map(({ key, cases: options }) => {
					const first = options[0];
					if (!first) return null;
					const grouped = options.length > 1;
					const tone = toneForCase(first.title);
					return (
						<Surface
							as="li"
							key={key}
							className="grid animate-rise content-between gap-5 transition-shadow hover:shadow-lg"
						>
							<div className="grid gap-4">
								<div className="flex items-start gap-4">
									<PatientBadge name={first.patient.name} tone={tone} />
									<div className="grid min-w-0 gap-1">
										<h2 className="font-bold text-xl leading-tight">
											{first.patient.name}, {first.patient.age} años
										</h2>
										<div className="flex flex-wrap gap-1.5">
											<Pill tone={tone}>{first.title}</Pill>
											{first.origin === "generado" && (
												<Pill tone="mint">
													<Sparkles className="size-3" aria-hidden="true" />
													generado
												</Pill>
											)}
											{!first.reviewed && <Pill>sin revisar</Pill>}
										</div>
									</div>
								</div>
								{!grouped && (
									<p className="rounded-2xl rounded-tl-md bg-muted px-4 py-3 text-sm">
										“{first.chiefComplaint}”
									</p>
								)}
								{grouped && (
									<p className="text-muted-foreground text-sm">
										Viene por {options.length} problemas distintos. Elegí uno o
										dejá que sea sorpresa.
									</p>
								)}
							</div>
							<div className="grid gap-3">
								<div className="grid gap-2">
									{grouped && (
										<select
											aria-label="Problema"
											value={problem[key] ?? first.id}
											onChange={(e) =>
												setProblem((cur) => ({ ...cur, [key]: e.target.value }))
											}
											className={selectClass}
										>
											{options.map((c) => (
												<option key={c.id} value={c.id}>
													{c.problem ?? c.id}
												</option>
											))}
											<option value={RANDOM}>Sorpresa (al azar)</option>
										</select>
									)}
									<select
										aria-label="Personalidad"
										value={chosen[key] ?? "caso"}
										onChange={(e) =>
											setChosen((cur) => ({ ...cur, [key]: e.target.value }))
										}
										className={selectClass}
									>
										<option value="caso">Personalidad del caso</option>
										{personalities.map((p) => (
											<option key={p.key} value={p.key}>
												{p.label}
											</option>
										))}
									</select>
								</div>
								<Button
									size="lg"
									className="h-11"
									disabled={busy}
									onClick={() => start(key, options)}
								>
									<Stethoscope aria-hidden="true" />
									Empezar consulta
								</Button>
							</div>
						</Surface>
					);
				})}
			</ul>

			<Surface className="border-dashed bg-gradient-to-br from-mint-soft to-coral-soft/60">
				<form onSubmit={generate} className="grid gap-4">
					<div className="flex items-start gap-3">
						<IconBubble icon={Wand2} tone="coral" className="bg-card" />
						<div className="grid gap-1">
							<label
								htmlFor="pedido"
								className="font-bold font-display text-lg"
							>
								Pedime un paciente
							</label>
							<p className="text-muted-foreground text-sm">
								Contame qué querés practicar y lo invento para vos.
							</p>
						</div>
					</div>
					<Textarea
						id="pedido"
						value={request}
						onChange={(e) => setRequest(e.target.value)}
						placeholder="Ej.: dame un paciente con algo de garganta, que sea ansioso y de unos 60 años"
						maxLength={300}
					/>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="max-w-sm text-muted-foreground text-xs">
							Inventamos a la persona; lo clínico sale de plantillas del equipo.
							Los casos generados no fueron revisados por un médico.
						</p>
						<Button
							type="submit"
							variant="secondary"
							disabled={busy || request.trim().length < 3}
						>
							<Sparkles aria-hidden="true" />
							Generar paciente
						</Button>
					</div>
				</form>
			</Surface>
		</Page>
	);
}
