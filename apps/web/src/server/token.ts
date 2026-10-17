// Token de sesión firmado con HMAC (Web Crypto): funciona en el proxy y en
// las rutas. Solo lleva alias, año de carrera y si es invitado.
export const SESSION_COOKIE = "p0_session";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type Viewer = {
	uid: string;
	alias: string | null;
	careerYear: string | null;
	guest: boolean;
	exp: number;
};

const DEV_SECRET = "solo-para-desarrollo-local-no-usar-en-produccion";

function secret() {
	const s = process.env.SESSION_SECRET;
	if (s) return s;
	if (process.env.NODE_ENV === "production") {
		throw new Error("Falta SESSION_SECRET en producción");
	}
	return DEV_SECRET;
}

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array) {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
	const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key() {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret()),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

export async function signViewer(viewer: Viewer): Promise<string> {
	const payload = b64url(encoder.encode(JSON.stringify(viewer)));
	const sig = new Uint8Array(
		await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload)),
	);
	return `${payload}.${b64url(sig)}`;
}

export async function verifyViewer(
	token: string | undefined,
): Promise<Viewer | null> {
	if (!token) return null;
	const [payload, sig] = token.split(".");
	if (!payload || !sig) return null;
	try {
		const ok = await crypto.subtle.verify(
			"HMAC",
			await key(),
			fromB64url(sig),
			encoder.encode(payload),
		);
		if (!ok) return null;
		const viewer = JSON.parse(
			new TextDecoder().decode(fromB64url(payload)),
		) as Viewer;
		return viewer.exp > Date.now() ? viewer : null;
	} catch {
		return null;
	}
}
