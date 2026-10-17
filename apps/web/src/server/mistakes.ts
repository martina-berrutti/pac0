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

export async function recordMistakes(uid: string, report: Report) {
	const current = await store.getMistakes(uid);
	await store.saveMistakes(uid, mergeMistakes(current, report));
}

export async function getMistakes(uid: string) {
	return sortMistakes(await store.getMistakes(uid));
}
