import { requireTeacher } from "@/server/auth";
import { handle } from "@/server/http";
import { store } from "@/server/store";

// Últimas consultas de todos, para el panel docente (plan.md, sección 10).
// Solo el alias: ningún otro dato del estudiante.
export async function GET() {
	return handle(async () => {
		await requireTeacher();
		return {
			sessions: (await store.listRecentSessions(100)).map((s) => ({
				id: s.id,
				alias: s.alias,
				caseId: s.caseId,
				personalityKey: s.personalityKey,
				status: s.status,
				startedAt: s.startedAt,
			})),
		};
	});
}
