// Prueba de punta a punta de la API contra un servidor corriendo (sin claves
// de IA alcanza): recorre todas las rutas, controla que otro usuario no pueda
// tocar una sesión ajena y que los errores tengan su código.
// Uso: node scripts/probar-api.mjs [http://localhost:3001]
const base = process.argv[2] ?? "http://localhost:3001";
let failures = 0;

function client() {
	let cookie = "";
	return async function call(method, path, body) {
		const res = await fetch(base + path, {
			method,
			headers: {
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
				...(cookie ? { Cookie: cookie } : {}),
			},
			body:
				body === undefined
					? undefined
					: typeof body === "string"
						? body
						: JSON.stringify(body),
			redirect: "manual",
		});
		const set = res.headers.get("set-cookie");
		if (set) cookie = set.split(";")[0];
		const data = await res.json().catch(() => ({}));
		return { status: res.status, data };
	};
}

function check(name, ok, extra = "") {
	if (!ok) failures++;
	console.log(`${ok ? "ok   " : "FALLA"} ${name}${extra ? ` (${extra})` : ""}`);
}

const ana = client();
const beto = client();
const anon = client();

// Acceso y perfil
check("sin sesión: 401", (await anon("GET", "/api/cases")).status === 401);
check(
	"health sin secretos",
	!JSON.stringify((await anon("GET", "/api/health")).data).includes(
		'secret":"',
	),
);
check(
	"personalidades",
	((await anon("GET", "/api/personalities")).data.personalities ?? []).length >=
		3,
);
check("invitado", (await ana("POST", "/api/auth/guest")).status === 200);
await beto("POST", "/api/auth/guest");
check("me", (await ana("GET", "/api/me")).data.viewer?.guest === true);
const badAlias = await ana("PATCH", "/api/me", {
	alias: "12345678",
	careerYear: "3",
});
check(
	"alias con cédula: 400",
	badAlias.status === 400,
	String(badAlias.status),
);
check(
	"perfil",
	(await ana("PATCH", "/api/me", { alias: "Ana", careerYear: "3" })).status ===
		200,
);
check(
	"perfil de errores vacío",
	Array.isArray((await ana("GET", "/api/me/mistakes")).data.mistakes),
);
check(
	"panel docente: 403 a un invitado",
	(await ana("GET", "/api/teacher/sessions")).status === 403,
);

// Casos
const cases = await ana("GET", "/api/cases");
const caseId = cases.data.cases?.[0]?.id;
check(
	"casos sin la verdad",
	Boolean(caseId) && !JSON.stringify(cases.data).includes("truth"),
);
const gen = await ana("POST", "/api/cases/generate", {
	text: "un paciente con dolor de garganta, ansioso",
});
check(
	"generar paciente",
	gen.status === 200 && !JSON.stringify(gen.data).includes("truth"),
	String(gen.status),
);
check(
	"generar fuera de alcance: 422",
	(
		await ana("POST", "/api/cases/generate", {
			text: "un paciente con dolor de rodilla",
		})
	).status === 422,
);

// Errores del cuerpo
check(
	"no JSON: 400",
	(await ana("POST", "/api/sessions", "no es json")).status === 400,
);
check(
	"cuerpo enorme: 413",
	(await ana("POST", "/api/sessions", { caseId, x: "a".repeat(100_000) }))
		.status === 413,
);

// Consulta
const id = (
	await ana("POST", "/api/sessions", { caseId, personalityKey: "hostil" })
).data.sessionId;
check("empieza la sesión", Boolean(id));
check(
	"historial",
	((await ana("GET", "/api/sessions")).data.sessions ?? []).some(
		(s) => s.id === id,
	),
);
const view = await ana("GET", `/api/sessions/${id}`);
check(
	"vista sin historia oculta",
	view.status === 200 &&
		!("historyOverrides" in view.data.session) &&
		view.data.readOnly === false,
);
check(
	"turno de voz",
	(
		await ana("POST", `/api/sessions/${id}/voice-turns`, {
			speaker: "estudiante",
			text: "Hola, ¿qué te trae?",
		})
	).status === 200,
);
check(
	"turno por texto",
	(
		await ana("POST", `/api/sessions/${id}/turns`, {
			text: "¿Desde cuándo te duele?",
		})
	).status === 200,
);
check(
	"evento",
	(
		await ana("POST", `/api/sessions/${id}/events`, {
			type: "silencio_largo",
			durationMs: 21000,
		})
	).status === 200,
);
check(
	"tokens",
	(
		await ana("POST", `/api/sessions/${id}/usage`, {
			inputTokens: 1,
			outputTokens: 1,
			inputAudioTokens: 1,
			outputAudioTokens: 1,
			cachedTokens: 0,
		})
	).status === 200,
);
const denied = await ana("POST", `/api/sessions/${id}/tools`, {
	name: "examinar",
	arguments: { zona: "boca", claridad: "alta", consentimiento: false },
});
check("hostil sin permiso no abre", denied.data.output?.variante === "negado");
const exam = await ana("POST", `/api/sessions/${id}/tools`, {
	name: "examinar",
	arguments: { zona: "garganta", claridad: "alta", consentimiento: true },
});
check(
	"con permiso abre, sin el hallazgo",
	exam.data.output?.variante === "completa" &&
		!JSON.stringify(exam.data.output).includes("exudado"),
);
const action = exam.data.ui?.exam?.action?.id;
const hotspot = exam.data.ui?.exam?.hotspots?.[0];
const times = await ana("PATCH", `/api/sessions/${id}/exam/${action}`, {
	hotspotTimesMs: { [hotspot]: 1500, inventada: 9 },
});
check(
	"tiempos solo de zonas reales",
	JSON.stringify(times.data.action?.hotspotTimesMs) ===
		JSON.stringify({ [hotspot]: 1500 }),
);
check(
	"herramienta desconocida: 400",
	(
		await ana("POST", `/api/sessions/${id}/tools`, {
			name: "toString",
			arguments: {},
		})
	).status === 400,
);
const bp = await ana("POST", `/api/sessions/${id}/vitals`);
const vitalId = bp.data.measurementId;
check("tensiómetro", bp.status === 200 && Boolean(vitalId), String(bp.status));
check(
	"manguito",
	(
		await ana("PATCH", `/api/sessions/${id}/vitals/${vitalId}`, {
			cuffSize: "adecuado",
			overClothes: false,
		})
	).status === 200,
);
check(
	"marcar presión",
	(
		await ana("PATCH", `/api/sessions/${id}/vitals/${vitalId}`, {
			pas: 110,
			pad: 70,
		})
	).status === 200,
);
const oto = await ana("POST", `/api/sessions/${id}/otoscopy`, {
	ear: "derecho",
});
check(
	"otoscopio",
	oto.status === 200 && Boolean(oto.data.actionId),
	String(oto.status),
);
const otoRecord = {
	hand: "derecha",
	prep: ["higiene"],
	speculum: "adulto",
	traction: "arriba-atras",
	roughInsertions: 0,
	maxDepth: 10,
	canalMs: 1000,
	tympanumMs: 1000,
};
check(
	"terminar otoscopia",
	(
		await ana(
			"PATCH",
			`/api/sessions/${id}/otoscopy/${oto.data.actionId}`,
			otoRecord,
		)
	).status === 200,
);
check(
	"voz sin clave: 503 claro",
	(await ana("POST", "/api/voice/session", { sessionId: id })).status === 503,
);

// Otro usuario: 404 en todo lo de una sesión ajena
const foreign = [
	["GET", `/api/sessions/${id}`],
	[
		"POST",
		`/api/sessions/${id}/voice-turns`,
		{ speaker: "estudiante", text: "hola" },
	],
	["POST", `/api/sessions/${id}/turns`, { text: "hola" }],
	["POST", `/api/sessions/${id}/events`, { type: "silencio_largo" }],
	[
		"POST",
		`/api/sessions/${id}/usage`,
		{
			inputTokens: 1,
			outputTokens: 1,
			inputAudioTokens: 1,
			outputAudioTokens: 1,
			cachedTokens: 0,
		},
	],
	[
		"POST",
		`/api/sessions/${id}/tools`,
		{ name: "terminar_consulta", arguments: {} },
	],
	["PATCH", `/api/sessions/${id}/exam/${action}`, { hotspotTimesMs: {} }],
	["POST", `/api/sessions/${id}/vitals`],
	["PATCH", `/api/sessions/${id}/vitals/${vitalId}`, { pas: 120, pad: 80 }],
	["POST", `/api/sessions/${id}/otoscopy`, { ear: "izquierdo" }],
	["POST", "/api/voice/session", { sessionId: id }],
	["POST", `/api/sessions/${id}/finish`, { hypothesis: "x" }],
	["GET", `/api/sessions/${id}/report`],
];
for (const [method, path, body] of foreign) {
	const r = await beto(method, path, body);
	// La voz sin clave responde 503 antes de mirar la sesión: no revela nada.
	const ok =
		r.status === 404 || (path === "/api/voice/session" && r.status === 503);
	check(
		`otro usuario: ${method} ${path.replace(id, ":id")}`,
		ok,
		String(r.status),
	);
}

// Cierre
check(
	"hipótesis vacía: 400",
	(await ana("POST", `/api/sessions/${id}/finish`, { hypothesis: "   " }))
		.status === 400,
);
check(
	"informe",
	(
		await ana("POST", `/api/sessions/${id}/finish`, {
			hypothesis: "Faringoamigdalitis",
			differentials: ["viral"],
		})
	).status === 200,
);
check(
	"después de cerrar: 409",
	(
		await ana("POST", `/api/sessions/${id}/voice-turns`, {
			speaker: "estudiante",
			text: "chau",
		})
	).status === 409,
);
check(
	"el dueño ve el informe",
	(await ana("GET", `/api/sessions/${id}/report`)).status === 200,
);
check(
	"perfil de errores actualizado",
	((await ana("GET", "/api/me/mistakes")).data.mistakes ?? []).length > 0,
);
const page = await fetch(`${base}/consulta/${id}`, { redirect: "manual" });
check(
	"página sin cookie redirige",
	page.status === 307 || page.status === 308,
	String(page.status),
);
check("cerrar sesión", (await ana("POST", "/api/auth/logout")).status === 200);
check(
	"después de cerrar sesión: 401",
	(await ana("GET", "/api/cases")).status === 401,
);

console.log(failures === 0 ? "\nTodo ok." : `\n${failures} falla(s).`);
process.exit(failures === 0 ? 0 : 1);
