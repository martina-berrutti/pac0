import { ARCHETYPES } from "@/lib/patient/personalities";
import { handle } from "@/server/http";

export async function GET() {
	return handle(async () => ({
		personalities: ARCHETYPES.map(({ key, label, description }) => ({
			key,
			label,
			description,
		})),
	}));
}
