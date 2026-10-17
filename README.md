# Paciente 0

App web donde un estudiante de medicina entrevista por voz a un paciente simulado, lo examina con herramientas virtuales y recibe un puntaje con feedback. Herramienta educativa: no usa datos de pacientes reales.

- Plan completo y reparto del equipo: [`plan.md`](plan.md)
- Reglas para personas y agentes: [`AGENTS.md`](AGENTS.md) (leerlo primero)

## Stack

Creado con [Better-T-Stack](https://better-t-stack.dev) (monorepo con npm workspaces y Turborepo):

| Carpeta | Qué es |
|---|---|
| `apps/web` | Next.js 16 + Tailwind. Rutas en `src/app/`, protección de rutas en `src/proxy.ts` |
| `packages/backend/convex` | Convex: esquema (`schema.ts`), auth (`auth.ts`), funciones |
| `packages/ui` | Componentes shadcn/ui compartidos |

En el plan, `convex/...` es `packages/backend/convex/...` y `app/...` es `apps/web/src/app/...`.

## Puesta en marcha

Requiere Node 22 y npm 11 o más (`npm install -g npm@latest`).

```bash
npm install
npm run dev:setup   # una vez: elegir o crear el proyecto de Convex
npm run dev         # web en http://localhost:3001 y Convex en paralelo
```

`dev:setup` crea `packages/backend/.env.local`. Copiá `CONVEX_URL` de ahí a `apps/web/.env.local` como `NEXT_PUBLIC_CONVEX_URL`. Los `.env` no se suben al repo y los agentes no los pueden leer (`.claude/settings.json`).

### Variables del deployment de Convex

Se cargan con `npx convex env set` (desde `packages/backend`), nunca en archivos del repo:

| Variable | Para qué |
|---|---|
| `JWT_PRIVATE_KEY`, `JWKS` | Firmar las sesiones. Se generan con `npx @convex-dev/auth` |
| `SITE_URL` | URL de la web (`http://localhost:3001` en dev, la de Vercel en prod) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Credenciales OAuth de Google |

En Google Cloud, la URI de redirección autorizada es `https://<deployment>.convex.site/api/auth/callback/google`.

## Comandos

```bash
npm run build        # build de producción
npm run check-types  # TypeScript en todos los paquetes
npm run lint         # Biome (npm run check corrige)
npm test             # tests de permisos de Convex
```

## Despliegue

Vercel, con Root Directory `apps/web`. El build (`apps/web/vercel.json`) publica Convex y después compila Next con la URL del deployment. En Vercel hace falta la variable `CONVEX_DEPLOY_KEY` (clave de producción, desde el dashboard de Convex).

## Autenticación y privacidad

- Convex Auth con Google y modo invitado (proveedor anónimo).
- De Google solo se guarda el id opaco de la cuenta: ni nombre, ni correo, ni foto.
- El invitado entra directo con un alias temporal (`Invitado 1234`). Sus datos se borran a las 24 horas (`crons.ts`).
- Al primer ingreso con Google se pide alias y año de carrera. El alias rechaza correos y números largos (cédula, teléfono).
- Cada función pública de Convex valida al usuario con los helpers de `convex/lib/access.ts`. `truth` e `hiddenHistory` solo se leen desde funciones internas (`cases.getFull`).
