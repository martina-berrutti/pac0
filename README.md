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

Requiere Node 22 y npm 11 o más (`npm install -g npm@latest`). No hace falta ninguna cuenta ni clave.

```bash
npm install
npm run dev:web     # web y API en http://localhost:3001
```

Hoy no se usa Convex: la API de Next.js guarda todo en memoria (`apps/web/src/server/store.ts`) y se borra al reiniciar. Convex queda para la fase final (`TODO.md`).

### Variables opcionales (`apps/web/.env.local`)

Los `.env` no se suben al repo y los agentes no los pueden leer (`.claude/settings.json`). La lista completa está en `apps/web/.env.schema`.

| Variable | Para qué |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio: voz (Gemini Live), paciente por texto con IA y generador. Sin ella, paciente por reglas y solo texto |
| `SESSION_SECRET` | Firma la cookie de sesión. **Obligatoria en producción** (Vercel) |
| `LIVE_MODEL`, `LIVE_VOICE`, `AI_MODEL` | Modelos y voz; tienen valores por defecto (`gemini-3.8-live`, `Kore`, `gemini-3.8-flash`) |
| `OPENAI_API_KEY` | Alternativa opcional solo para el texto |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login con Google (OAuth). Solo se pide `openid`: ni nombre ni correo |
| `CONVEX_URL`, `STORE_SECRET` | Guardar los datos en Convex. **Obligatorias en Vercel**: sin ellas, la memoria se pierde entre instancias |

## Comandos

```bash
npm run build        # build de producción
npm run check-types  # TypeScript en todos los paquetes
npm run lint         # Biome (npm run check corrige)
npm test             # tests de la web y de Convex
```

## Despliegue

Vercel, con Root Directory `apps/web`; cada push a `main` publica https://pac0-l3xi.vercel.app. En Vercel hacen falta `SESSION_SECRET`, `CONVEX_URL`, `STORE_SECRET` y `GEMINI_API_KEY` (y `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` para el login con Google). `GET /api/health` dice cuáles están cargadas, sin mostrar los valores.

## Seguimiento

- [`TODO.md`](TODO.md): todas las tareas del plan por persona.
- [`PROGRESO.md`](PROGRESO.md): qué se hizo, cómo se validó y qué falta.

## Privacidad

- Del estudiante solo se guarda un alias y el año de carrera. El alias rechaza correos y números largos (cédula, teléfono).
- De la voz se guarda la transcripción, nunca el audio.
- El diagnóstico (`truth`) solo lo lee el servidor: no llega al navegador ni a las instrucciones del paciente.
- Cada ruta de la API valida al usuario, y una sesión o un informe solo los ve su dueño.
