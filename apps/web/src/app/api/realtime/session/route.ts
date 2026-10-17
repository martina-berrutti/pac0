import { HttpError, requireViewer } from "@/server/auth";
import { handle } from "@/server/http";

// TODO (Persona 1, TODO.md 1.4): pedir una clave efímera a OpenAI Realtime con
// las instrucciones de buildPatientPrompt (sin el diagnóstico) y las
// herramientas del paciente. La clave real nunca sale del servidor.
export async function POST() {
	return handle(async () => {
		await requireViewer();
		throw new HttpError(
			501,
			"La consulta por voz todavía no está implementada; usá la versión por texto.",
		);
	});
}
