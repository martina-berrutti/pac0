import { toSummary } from "@/cases/schema";
import { requireViewer } from "@/server/auth";
import { handle } from "@/server/http";
import { store } from "@/server/store";

// Casos para elegir: solo el resumen, nunca truth ni historia oculta.
export async function GET() {
	return handle(async () => {
		const viewer = await requireViewer();
		return { cases: (await store.listCases(viewer.uid)).map(toSummary) };
	});
}
