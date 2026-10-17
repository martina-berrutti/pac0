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
		// El detalle queda en el log; la pantalla muestra algo accionable.
		return Response.json(
			{ error: "Algo falló de nuestro lado. Probá de nuevo en unos segundos." },
			{ status: 500 },
		);
	}
}

const MAX_BODY_BYTES = 64 * 1024;

export async function readBody<T>(
	req: Request,
	schema: z.ZodType<T>,
): Promise<T> {
	// Ninguna ruta necesita más: así nada enorme llega a Convex.
	const declared = Number(req.headers.get("content-length") ?? 0);
	if (declared > MAX_BODY_BYTES)
		throw new HttpError(413, "El pedido es demasiado grande");
	const text = await req.text();
	if (text.length > MAX_BODY_BYTES)
		throw new HttpError(413, "El pedido es demasiado grande");
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new HttpError(400, "El cuerpo tiene que ser JSON");
	}
	return schema.parse(raw);
}
