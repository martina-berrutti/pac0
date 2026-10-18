import { convexAuth } from "@convex-dev/auth/server";

// La app web tiene su propio login (invitado con cookie y Google por OAuth,
// apps/web/src/server/). Convex Auth quedó del comienzo y no lo usa nadie:
// sin proveedores, signIn no crea usuarios. Antes el proveedor anónimo dejaba
// a cualquiera con la URL del deployment crear usuarios sin límite.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [],
});
