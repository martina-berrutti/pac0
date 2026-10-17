// Perfil de errores del usuario (Persona 1). Se actualiza una vez por
// consulta con los errores del informe.
import "server-only";

import type { MistakeEntry } from "@/lib/contracts/mistakes";
import type { Report } from "@/lib/contracts/report";

import { store } from "./store";

// Un error cuenta una vez por consulta aunque aparezca varias veces.
export function mergeMistakes(
	current: MistakeEntry[],
	report: Report,
	now: number = Date.now(),
): MistakeEntry[] {
	const byTag = new Map(current.map((e) => [e.tag, { ...e }]));
	const seen = new Set<string>();
	for (const m of report.mistakes) {
		if (seen.has(m.tag)) continue;
		seen.add(m.tag);
		const prev = byTag.get(m.tag);
		byTag.set(m.tag, {
			tag: m.tag,
			label: m.what,
			count: (prev?.count ?? 0) + 1,
			critical: (prev?.critical ?? false) || m.critical,
			lastSeenAt: now,
		});
	}
	return sortMistakes([...byTag.values()]);
}

// Primero lo que más se repite; a igual cantidad, lo más reciente.
export function sortMistakes(entries: MistakeEntry[]) {
	return [...entries].sort(
		(a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt,
	);
}

// Leer, combinar y guardar solo si nadie lo cambió en el medio (dos consultas
// del mismo usuario cerrándose a la vez se pisaban). Se reintenta un par de
// veces.
export async function recordMistakes(uid: string, report: Report) {
	for (let attempt = 0; attempt < 5; attempt++) {
		const stored = await store.getMistakes(uid);
		const next = mergeMistakes(stored, report);
		if (await store.replaceMistakesIf(uid, stored, next)) return;
	}
	throw new Error("No se pudo actualizar el perfil de errores");
}

export async function getMistakes(uid: string) {
	return sortMistakes(await store.getMistakes(uid));
}
