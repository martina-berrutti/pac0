import { ARCHETYPES } from "@/lib/patient/personalities";
import { handle } from "@/server/http";

export async function GET() {
	return handle(async () => ({
		personalities: ARCHETYPES.filter((a) => !a.hidden).map(
			({ key, label, description }) => ({ key, label, description }),
		),
	}));
}
