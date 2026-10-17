// Chequeo de la Puerta 2 (plan.md, sección 13) y de antes de la demo: una
// consulta completa contra la URL pública, de la primera pregunta al informe.
// Usa la API de texto (la misma del plan B), así que no necesita micrófono.
// Uso: node scripts/probar-consulta.mjs [url]
const base = process.argv[2] ?? "https://pac0-l3xi.vercel.app";

let cookie = "";
let failed = 0;
async function call(path, { method = "POST", body } = {}) {
	const res = await fetch(base + path, {
		method,
		headers: { "Content-Type": "application/json", cookie },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const setCookie = res.headers.get("set-cookie");
	if (setCookie) cookie = setCookie.split(";")[0];
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`${path}: ${res.status} ${data.error ?? ""}`);
	return data;
}
function check(ok, label, detail = "") {
	if (!ok) failed++;
	console.log(
		`${ok ? "ok   " : "FALLA"} | ${label}${detail ? ` (${detail})` : ""}`,
	);
}

// 1. El servidor: base de datos y voz configuradas.
const health = await call("/api/health", { method: "GET" });
check(
	health.store === "convex",
	"los datos se guardan en Convex",
	health.store,
);
check(health.voz, "la voz tiene clave");

// 2. Entrar como invitado y empezar con Lucía.
await call("/api/auth/guest");
const { cases } = await call("/api/cases", { method: "GET" });
check(cases.length >= 1, "hay casos para elegir", `${cases.length}`);
const { sessionId } = await call("/api/sessions", {
	body: { caseId: "garganta-01", personalityKey: "caso" },
});

// 3. La voz: el servidor entrega un token efímero (no abre la llamada).
const token = await call("/api/voice/session", { body: { sessionId } });
check(
	typeof token.token === "string" && token.token.startsWith("auth_tokens/"),
	"la voz entrega un token efímero",
);

// 4. Entrevista por texto.
const lines = [
	"Hola, soy Ana, estudiante de medicina. ¿Qué te trae por acá?",
	"¿Desde cuándo te duele la garganta?",
	"¿Tuviste fiebre? ¿Tenés tos o mocos?",
	"¿Alguien cerca tuyo está con algo parecido?",
	"¿Sos alérgica a algún medicamento? ¿Tomás alguna medicación?",
	"¿Fumás o tomás alcohol?",
];
for (const text of lines) {
	const { patientTurn } = await call(`/api/sessions/${sessionId}/turns`, {
		body: { text },
	});
	console.log(`        Vos: ${text}\n        Lucía: ${patientTurn.text}`);
}

// 5. Examen: con permiso abre bien la boca; se recorre la garganta con la luz.
const { exam } = await call(`/api/sessions/${sessionId}/turns`, {
	body: {
		text: "Te voy a revisar la garganta, ¿puedo? Abrí bien grande, sacá la lengua y decí aaa.",
	},
});
check(
	exam?.action?.variant === "completa",
	"el examen abre la boca completa",
	exam?.action?.variant,
);
if (exam) {
	await call(`/api/sessions/${sessionId}/exam/${exam.action.id}`, {
		method: "PATCH",
		body: {
			hotspotTimesMs: Object.fromEntries(exam.hotspots.map((h) => [h, 1500])),
		},
	});
}
await call(`/api/sessions/${sessionId}/turns`, {
	body: {
		text: "Veo las amígdalas rojas con placas blancas. Si entendí bien, hace tres días que te duele y tuviste fiebre, ¿es así?",
	},
});

// 6. Cierre e informe.
const { report } = await call(`/api/sessions/${sessionId}/finish`, {
	body: {
		hypothesis:
			"Faringoamigdalitis aguda, por la fiebre, el dolor al tragar y las placas en las amígdalas",
		differentials: ["viral", "estreptocócica", "mononucleosis"],
	},
});
const view = await call(`/api/sessions/${sessionId}`, { method: "GET" });
const turnIds = new Set(view.turns.map((t) => t.id));
const dims = Object.entries(report.scores)
	.map(([k, v]) => `${k} ${Math.round(v)}`)
	.join(", ");
check(
	Number.isFinite(report.total),
	"el informe tiene puntaje total",
	`${Math.round(report.total)}%`,
);
check(Object.keys(report.scores).length === 4, "puntaje por dimensión", dims);
check(Boolean(report.verdictMessage), "veredicto", report.verdictMessage);
check(
	Boolean(report.truth?.diagnosis),
	"muestra el diagnóstico del caso",
	report.truth?.diagnosis,
);
const done = report.items.filter((i) => i.status === "si");
const cited = done.filter((i) =>
	i.evidence.some((e) => (e.turnId && turnIds.has(e.turnId)) || e.examActionId),
);
check(
	done.length > 0 && cited.length === done.length,
	"cada ítem cumplido cita un turno o examen real",
	`${cited.length} de ${done.length}`,
);
const ghost = report.mistakes.flatMap((m) =>
	m.evidence.filter((e) => e.turnId && !turnIds.has(e.turnId)),
);
check(ghost.length === 0, "ningún error cita un turno inexistente");
check(
	!report.mistakes.some((m) => m.critical),
	"sin errores críticos (pidió permiso antes de examinar)",
);
console.log(
	`        juez: ${report.judge}; ${report.mistakes.length} error(es) u omisión(es)`,
);
for (const m of report.mistakes.slice(0, 3)) console.log(`        - ${m.what}`);

// 7. Privacidad: otro invitado no puede ver el informe.
const mine = cookie;
cookie = "";
await call("/api/auth/guest");
const other = await fetch(`${base}/api/sessions/${sessionId}/report`, {
	headers: { cookie },
});
check(
	other.status === 404,
	"otro usuario no puede ver el informe",
	`${other.status}`,
);
cookie = mine;

console.log(
	failed
		? `\n${failed} chequeo(s) fallaron.`
		: `\nPuerta 2: la consulta pasa por entrevista, examen e informe con puntaje y evidencia en ${base}.`,
);
process.exit(failed ? 1 : 0);
