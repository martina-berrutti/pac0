// Envoltorio de las rutas: errores a JSON con su código y body validado.
import "server-only";

import { z } from "zod";

import { HttpError } from "./auth";

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
	try {
		const result = await fn();
		return Response.json(result ?? { ok: true });
	} catch (error) {
		if (error instanceof HttpError) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		if (error instanceof z.ZodError) {
			return Response.json(
				{ error: "Datos inválidos", issues: error.issues },
				{ status: 400 },
			);
		}
		console.error(error);
		return Response.json({ error: "Error interno" }, { status: 500 });
	}
}

export async function readBody<T>(
	req: Request,
	schema: z.ZodType<T>,
): Promise<T> {
	let raw: unknown;
	try {
		raw = await req.json();
	} catch {
		throw new HttpError(400, "El cuerpo tiene que ser JSON");
	}
	return schema.parse(raw);
}
