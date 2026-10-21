"use client";

import { Button } from "@pac0/ui/components/button";
import { Textarea } from "@pac0/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CaseSummary } from "@/cases/schema";
import LoadError from "@/components/load-error";
import Loader from "@/components/loader";
import {
	Initial,
	inkForCase,
	Note,
	Page,
	Paper,
	selectClass,
	Tag,
} from "@/frontend/ui";
import { ApiError, api, type PersonalityOption } from "@/lib/api-client";

// Los casos del banco van por motivo de consulta (dolor de garganta, de
// rodilla), sin decir quién viene: el paciente se sortea al empezar. Los
// generados, cada uno en su tarjeta, con su persona.
function groupCases(cases: CaseSummary[]) {
	const groups = new Map<string, CaseSummary[]>();
	for (const c of cases) {
		const key = c.origin === "banco" ? `motivo:${c.title}` : c.id;
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
	const [request, setRequest] = useState("");
	const [busy, setBusy] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		// Sin sesión (por ejemplo, un invitado de más de 24 horas), a entrar; si
		// falla otra cosa, un mensaje en vez de quedarse cargando.
		const failed = (error: unknown) => {
			if (error instanceof ApiError && error.status === 401)
				router.replace("/entrar");
			else setLoadError("No pudimos cargar los casos. Probá de nuevo.");
		};
		api
			.me()
			.then(({ viewer }) => {
				if (viewer && !viewer.alias) router.replace("/perfil");
				setAlias(viewer?.alias ?? null);
			})
			.catch(() => {});
		api
			.cases()
			.then((r) => setCases(r.cases))
			.catch(failed);
		// Sin la lista, queda solo "Personalidad del caso".
		api
			.personalities()
			.then((r) => setPersonalities(r.personalities))
			.catch(() => {});
	}, [router]);

	// Un motivo con varios casos (rodilla) viene por uno al azar: el
	// estudiante no elige qué lesión tiene.
	async function start(key: string, options: CaseSummary[]) {
		const caseId = options[Math.floor(Math.random() * options.length)]?.id;
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

	if (loadError) return <LoadError message={loadError} />;
	if (cases === null) return <Loader />;

	return (
		<Page size="lg" className="gap-10">
			<header className="grid gap-2">
				<Note className="-rotate-1 text-pen">
					{alias ? `hola, ${alias}` : "hola"}
				</Note>
				<h1 className="font-display text-4xl">¿Qué atendemos hoy?</h1>
				<p className="max-w-prose text-muted-foreground">
					Elegí un motivo de consulta y la forma de ser del paciente. Quién
					viene te toca al azar. Cada consulta dura hasta 8 minutos.
				</p>
			</header>

			<ul className="grid gap-x-6 gap-y-10 pt-2 md:grid-cols-2">
				{groupCases(cases).map(({ key, cases: options }, index) => {
					const first = options[0];
					if (!first) return null;
					const bank = first.origin === "banco";
					const ink = inkForCase(first.title);
					return (
						<Paper
							as="li"
							key={key}
							tape={ink}
							tilt={index % 2 === 0 ? -0.6 : 0.7}
							className="grid content-between gap-5 px-6 pt-8 pb-6"
						>
							<div className="grid gap-4">
								<div className="flex items-center gap-4">
									<Initial
										name={bank ? first.title : first.patient.name}
										ink={ink}
									/>
									<div className="grid min-w-0 gap-0.5">
										<h2 className="font-display text-2xl leading-tight">
											{bank
												? first.title
												: `${first.patient.name}, ${first.patient.age}`}
										</h2>
										<div className="flex flex-wrap gap-x-3">
											{!bank && <Tag ink={ink}>{first.title}</Tag>}
											{first.origin === "generado" && <Tag>inventado</Tag>}
											{!first.reviewed && <Tag>sin revisar</Tag>}
										</div>
									</div>
								</div>
								<p className="font-hand text-2xl leading-snug">
									{`“${bank ? `Vengo por ${first.title.toLowerCase()}` : first.chiefComplaint}”`}
								</p>
							</div>
							<div className="grid gap-2.5">
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
								<Button
									size="lg"
									className="h-12 border-black/25 border-b-[3px] text-base"
									disabled={busy}
									onClick={() => start(key, options)}
								>
									{bank
										? "Hacer pasar al paciente"
										: `Hacer pasar a ${first.patient.name}`}
								</Button>
							</div>
						</Paper>
					);
				})}
			</ul>

			<section className="grid gap-4 border-border border-t border-dashed pt-10">
				<form onSubmit={generate} className="grid max-w-2xl gap-4">
					<div className="grid gap-1">
						<label htmlFor="pedido" className="font-display text-2xl">
							¿Querés otro paciente?
						</label>
						<p className="text-muted-foreground text-sm">
							Contame qué querés practicar y lo invento.
						</p>
					</div>
					<Textarea
						id="pedido"
						value={request}
						onChange={(e) => setRequest(e.target.value)}
						placeholder="Ej.: dame un paciente con algo de garganta, que sea ansioso y de unos 60 años"
						maxLength={300}
					/>
					<div className="flex flex-wrap items-center gap-4">
						<Button
							type="submit"
							variant="outline"
							className="h-11 px-5"
							disabled={busy || request.trim().length < 3}
						>
							Inventar paciente
						</Button>
						<p className="max-w-sm text-muted-foreground text-xs">
							Inventamos a la persona; lo clínico sale de plantillas del equipo.
							Los casos inventados no fueron revisados por un médico.
						</p>
					</div>
				</form>
			</section>
		</Page>
	);
}
