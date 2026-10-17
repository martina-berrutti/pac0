import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Google({
			// Solo el id opaco de la cuenta: sin nombre, correo ni foto. Así
			// Convex Auth no los copia a ninguna tabla (AGENTS.md).
			profile: (googleProfile) => ({ id: googleProfile.sub }),
		}),
		Anonymous,
	],
	callbacks: {
		// Crea el usuario solo con los campos de schema.ts e ignora el perfil
		// del proveedor.
		async createOrUpdateUser(genericCtx, { existingUserId, provider }) {
			if (existingUserId !== null) {
				return existingUserId;
			}
			const ctx = genericCtx as unknown as MutationCtx;
			const isAnonymous = provider.id === "anonymous";
			return await ctx.db.insert("users", {
				isAnonymous,
				// El invitado entra directo con un alias temporal.
				alias: isAnonymous ? guestAlias() : undefined,
				role: "estudiante",
				createdAt: Date.now(),
			});
		},
	},
});

function guestAlias() {
	const n = Math.floor(1000 + Math.random() * 9000);
	return `Invitado ${n}`;
}
