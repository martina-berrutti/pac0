// Cliente de la API para las pantallas. Tira ApiError con el mensaje del
// servidor, listo para mostrar en un toast.
import type { CaseSummary } from "@/cases/schema";
import type {
	BpReading,
	CuffSize,
	Ear,
	ExamAction,
	OtoscopyRecord,
	TemperatureReading,
} from "@/lib/contracts/exam";
import type { MistakeEntry } from "@/lib/contracts/mistakes";
import type { Report } from "@/lib/contracts/report";
import { timeoutSignal } from "@/lib/timeout-signal";
import type { SessionView, TurnResult } from "@/server/consultation";
import type { OtoscopyStart } from "@/server/otoscopy";
import type { BpGauge, BpStart } from "@/server/vitals";

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

// Tope por pedido: sin él, un servidor colgado deja la pantalla cargando para
// siempre. Es generoso porque el informe con IA puede tardar.
const REQUEST_TIMEOUT_MS = 60_000;

async function request<T>(
	path: string,
	init?: { method?: string; body?: unknown },
): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path, {
			method: init?.method ?? "GET",
			headers:
				init?.body === undefined
					? undefined
					: { "Content-Type": "application/json" },
			body: init?.body === undefined ? undefined : JSON.stringify(init.body),
			signal: timeoutSignal(REQUEST_TIMEOUT_MS),
		});
	} catch {
		throw new ApiError(
			0,
			"No pudimos comunicarnos con el servidor. Revisá la conexión y probá de nuevo.",
		);
	}
	const data = (await res.json().catch(() => null)) as {
		error?: string;
	} | null;
	if (!res.ok)
		throw new ApiError(
			res.status,
			data?.error ?? "Algo salió mal. Probá de nuevo.",
		);
	// Un 200 con el cuerpo cortado no es una respuesta: la pantalla se rompería
	// al leer campos que no están.
	if (data === null)
		throw new ApiError(
			res.status,
			"La respuesta del servidor llegó cortada. Probá de nuevo.",
		);
	return data as T;
}

export type Me = {
	alias: string | null;
	careerYear: string | null;
	guest: boolean;
	role: "estudiante" | "docente";
	// Id de cuenta para pedir el rol de docente; null para el invitado.
	accountId: string | null;
};
export type PersonalityOption = {
	key: string;
	label: string;
	description: string;
};

export const api = {
	enterAsGuest: () =>
		request<{ alias: string }>("/api/auth/guest", { method: "POST" }),
	logout: () => request("/api/auth/logout", { method: "POST" }),
	me: () => request<{ viewer: Me | null }>("/api/me"),
	saveProfile: (alias: string, careerYear: string) =>
		request<{ viewer: Me }>("/api/me", {
			method: "PATCH",
			body: { alias, careerYear },
		}),
	cases: () => request<{ cases: CaseSummary[] }>("/api/cases"),
	personalities: () =>
		request<{ personalities: PersonalityOption[] }>("/api/personalities"),
	generateCase: (text: string, personalityKey?: string) =>
		request<{ case: CaseSummary; personalityKey: string }>(
			"/api/cases/generate",
			{ method: "POST", body: { text, personalityKey } },
		),
	startSession: (caseId: string, personalityKey: string) =>
		request<{ sessionId: string }>("/api/sessions", {
			method: "POST",
			body: { caseId, personalityKey },
		}),
	session: (id: string) => request<SessionView>(`/api/sessions/${id}`),
	sendTurn: (id: string, text: string) =>
		request<TurnResult>(`/api/sessions/${id}/turns`, {
			method: "POST",
			body: { text },
		}),
	saveExamTimes: (
		id: string,
		actionId: string,
		hotspotTimesMs: Record<string, number>,
	) =>
		request<{ action: ExamAction }>(`/api/sessions/${id}/exam/${actionId}`, {
			method: "PATCH",
			body: { hotspotTimesMs },
		}),
	takeTemperature: (id: string) =>
		request<TemperatureReading>(`/api/sessions/${id}/temperature`, {
			method: "POST",
		}),
	startBp: (id: string) =>
		request<BpStart>(`/api/sessions/${id}/vitals`, { method: "POST" }),
	placeCuff: (
		id: string,
		measurementId: string,
		cuffSize: CuffSize,
		overClothes: boolean,
	) =>
		request<BpGauge>(`/api/sessions/${id}/vitals/${measurementId}`, {
			method: "PATCH",
			body: { cuffSize, overClothes },
		}),
	markBp: (id: string, measurementId: string, marked: BpReading) =>
		request<{ ok: boolean }>(`/api/sessions/${id}/vitals/${measurementId}`, {
			method: "PATCH",
			body: marked,
		}),
	startOtoscopy: (id: string, ear: Ear) =>
		request<OtoscopyStart>(`/api/sessions/${id}/otoscopy`, {
			method: "POST",
			body: { ear },
		}),
	finishOtoscopy: (id: string, actionId: string, record: OtoscopyRecord) =>
		request<{ ok: boolean }>(`/api/sessions/${id}/otoscopy/${actionId}`, {
			method: "PATCH",
			body: record,
		}),
	// Vista de solo foto: no hay técnica, solo cuánto miró.
	finishPhotoOtoscopy: (id: string, actionId: string, lookedMs: number) =>
		request<{ ok: boolean }>(`/api/sessions/${id}/otoscopy/${actionId}`, {
			method: "PATCH",
			body: { mode: "foto", lookedMs: Math.round(lookedMs) },
		}),
	finish: (id: string, hypothesis: string, differentials: string[]) =>
		request<{ report: Report }>(`/api/sessions/${id}/finish`, {
			method: "POST",
			body: { hypothesis, differentials },
		}),
	report: (id: string) =>
		request<{ report: Report }>(`/api/sessions/${id}/report`),
	// Perfil de errores entre consultas (lo más repetido primero).
	mistakes: () => request<{ mistakes: MistakeEntry[] }>("/api/me/mistakes"),
};
