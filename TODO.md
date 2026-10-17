# Paciente 0 — Lista de tareas

Todo lo que hay que hacer según [`plan.md`](plan.md), por persona. Marcá `[x]` al terminar y anotá el avance en [`PROGRESO.md`](PROGRESO.md).

- Prioridad: **P1** imprescindible, **P2** importante, **P3** si sobra tiempo (plan.md, sección 1). Si algo se atrasa, se corta de abajo hacia arriba.
- Cada tarea termina cuando pasan sus validaciones, más `npm run lint`, `npm run check-types`, `npm test` y `npm run build`.
- Cada persona toca solo sus carpetas (tabla "Quién toca qué"). Para tocar algo de otra, avisar antes.
- Decisión del 17/10: **Convex queda para el final**. Hoy todo corre en la API de Next.js con almacenamiento en memoria (`apps/web/src/server/store.ts`).

## Quién toca qué

| Carpeta (en `apps/web/src/`) | Dueña |
|---|---|
| `server/`, `app/api/`, `lib/patient/`, `lib/voice/`, `lib/contracts/session.ts`, `proxy.ts` | Persona 1 |
| `lib/scoring/`, `components/exam/`, `lib/contracts/exam.ts`, `lib/contracts/report.ts` | Persona 2 |
| `cases/`, pantallas y estilos de `app/` (salvo `app/api/`), `components/ui` (`packages/ui`), `DESIGN.md`, `assets/`, `CREDITS.md`, `docs/` | Persona 3 |
| `packages/backend/convex/` (fase final) | Persona 1 |

## Contratos entre frentes

- [x] Forma del caso con zod: `cases/schema.ts` (Personas 1 y 3)
- [x] Sesión, turnos y eventos: `lib/contracts/session.ts` (Persona 1)
- [x] Acción de examen y mediciones de presión: `lib/contracts/exam.ts` (Persona 2)
- [x] Informe: `lib/contracts/report.ts` (Persona 2)
- [x] Esquema de Convex con las 10 tablas: `packages/backend/convex/schema.ts` (para la fase final)
- [ ] Revisar los contratos entre las tres y congelarlos (cambios por mensaje)

---

## Persona 1 · Voz y motor del paciente (`feat/voz-motor`)

Termina cuando: una consulta completa funciona de punta a punta con 3 personalidades.

### Base
- [x] Primer commit y repo andando en Orca
- [x] Base con Better-T-Stack (Next.js, shadcn/ui, Turborepo) y Biome
- [x] `AGENTS.md` y `.claude/settings.json` que bloquea los `.env` de todo el repo
- [x] Deploy en Vercel: https://pac0-l3xi.vercel.app
- [x] Cargar `SESSION_SECRET` en Vercel
- [x] Cargar `GEMINI_API_KEY` (Google AI Studio) en `apps/web/.env.local` y en Vercel (voz e IA)
- [x] `.gitattributes` con `* text=auto eol=lf`: en Windows (`core.autocrlf=true`) `npm run lint` fallaba por los finales de línea CRLF

### Usuarios y acceso (plan.md, sección 10)
- [x] Invitado con alias temporal y cookie firmada, en menos de 10 s
- [x] Perfil: alias y año de carrera; el alias rechaza correo, cédula y teléfono
- [x] Rutas protegidas (`proxy.ts`) y cada ruta de la API valida al usuario
- [x] Una sesión y su informe solo los ve su dueño
- [x] Cerrar sesión
- [ ] Probar el login desde un celular en la URL pública
- [x] Login con Google por OAuth propio (`/api/auth/google`): solo `openid`, id con hash, perfil guardado en Convex
- [ ] Crear las credenciales OAuth en Google Cloud y cargarlas en Vercel (`/api/health` en producción dice `google: false`)
- [ ] Probar el login con Google en la URL pública
- [x] Rol en el perfil: estudiante por defecto, docente si su id de cuenta está en `DOCENTES` (`server/auth.ts`, `roleOf`). `/api/me` devuelve `role` y `accountId` para pedir el alta. Un invitado nunca es docente
- [ ] Cargar `DOCENTES` en Vercel con los ids de cuenta de los docentes (separados por coma)
- [x] Docentes autorizados pueden leer la consulta y el informe de cualquiera (solo leer) y listar las últimas consultas: `GET /api/teacher/sessions`
- [ ] Persona 3: pantalla del panel docente contra `/api/teacher/sessions` (P3)
- [x] Retención de las transcripciones de las cuentas: `records.purgeOldSessions` cada 6 horas borra las sesiones (con turnos, eventos, examen e informe) más viejas que `TRANSCRIPT_RETENTION_DAYS`. Sin la variable no borra nada
- [ ] Persona 3: preguntar a la facultad el plazo (ley 18.331); después cargar `TRANSCRIPT_RETENTION_DAYS` en Convex

### Motor del paciente (plan.md, sección 5)
- [x] Prompt del paciente desde el caso y la personalidad, **sin el diagnóstico** (`lib/patient/brief.ts`)
- [x] Cuatro arquetipos: directo, ansioso, mayor con audición reducida, hostil (`lib/patient/personalities.ts`)
- [x] Datos sensibles (alcohol, tabaco, drogas) solo con confianza alta
- [x] Paciente por reglas sin IA, como respaldo (`lib/patient/rule-responder.ts`)
- [x] Paciente con IA por texto con Gemini si hay `GEMINI_API_KEY` (OpenAI como alternativa)
- [x] Guardar los hechos que el paciente inventa para no contradecirse (P2): herramienta `anotar_dato` en la voz
- [x] Variación controlada: sortear valores dentro de rangos sin cambiar el diagnóstico (P2): campo `variations` del caso
- [ ] Persona 3: revisar con un médico las variaciones del caso 1 (fiebre y contactos)
- [x] Los eventos objetivos actualizan el estado (plan.md, sección 5, versión 1): interrumpir baja `paciencia` (−0,1) y `confianza` (−0,05), un silencio largo baja `paciencia` (−0,05) y pedir consentimiento sube `confianza` (+0,1). Cada cambio queda como `cambio_animo` con el motivo (`lib/patient/state.ts`)
- [ ] Calibrar esos valores con un docente
- [ ] Clasificador rápido por turno (pregunta abierta o cerrada, jerga, empatía) que actualice el estado (versión 2, P3)

### Voz (plan.md, secciones 4 y 5) · Gemini Live de Google AI Studio
- [x] Decisión del 17/10: la voz usa Gemini Live (Google AI Studio) en vez de OpenAI Realtime
- [x] Token efímero de Gemini con las instrucciones fijadas: `POST /api/voice/session` (la clave real no sale del servidor)
- [x] Sesión de voz por WebSocket en `/consulta`: micrófono a 16 kHz y audio del paciente a 24 kHz (`lib/voice/use-voice.ts`)
- [x] Aviso antes de la voz: se guarda la transcripción, no el audio; no decir datos personales
- [x] Guardar cada turno transcrito (`POST /api/sessions/[id]/voice-turns`)
- [x] El estudiante interrumpe al paciente: se registra `interrupcion_estudiante`
- [x] El paciente interrumpe o retoma tras un silencio largo (20 s): `interrupcion_paciente` y `silencio_largo`
- [x] Detección de turno más rápida para pacientes impacientes (`silenceDurationMs` 500 en vez de 800)
- [x] Tope de 8 minutos en el servidor y reloj en pantalla
- [x] Decisión del 17/10: la consulta es **solo por voz**; se sacó el campo para escribir (la transcripción se ve para leer)
- [ ] Plan B si falla la voz o el wifi en la demo: el plan pedía versión por texto; decidir si alcanza con el video de respaldo
- [x] Probar la voz con la clave real (Gemini Live): audio, transcripción, personaje y herramienta `examinar` funcionan
- [ ] Probar con micrófono en el navegador (computadora y celular)
- [x] Verificar qué versión de API acepta el token efímero: `v1beta` funciona
- [x] Verificar `usageMetadata` de Gemini Live: es por turno (el prompt crece porque relee la conversación), sumar es correcto
- [x] Muestras de 6 voces (Kore, Aoede, Leda, Zephyr, Puck, Charon) con la misma frase de Lucía
- [ ] Elegir la voz y cargarla en `LIVE_VOICE` (Vercel y `.env.local`)
- [x] Registrar los tokens de cada respuesta de la voz (`session.voiceUsage`)
- [x] Estimar el costo: US$0,50 a 0,80 por consulta de 8 min (audio entrada US$3/M, salida US$12/M; capa gratuita sin costo)
- [ ] Confirmar el costo con `voiceUsage` de una consulta real por micrófono
- [x] Reconectar la voz si se corta la conexión (o si Google avisa con `goAway`), hasta 3 veces: el token nuevo lleva los últimos 40 turnos y la confianza actual, y la pantalla dice "Reconectando…"
- [x] Probar la reconexión en el navegador: en producción, con Chrome y micrófono simulado, se cortó la conexión a mano y la pantalla pasó a "Reconectando…" y volvió a "En línea" sola (`voiceStarts` 2)
- [ ] Probarla con una persona hablando y cortando el wifi de verdad
- [x] Topes para cuidar los créditos (plan.md, sección 14): 10 consultas por usuario por día (`MAX_SESSIONS_PER_USER_PER_DAY`), 200 en total por día (`MAX_SESSIONS_PER_DAY`, porque un invitado nuevo no cuesta nada). Responden 429 con un mensaje claro; `/api/health` muestra los topes
- [ ] `/consulta` sin errores de consola a 390 y 1280 px (validación del prompt de la Persona 1, plan.md, sección 12). Arreglado: había un `<div>` dentro de la lista (`<ol>`), que React marca como error, y un fragmento inútil. Revisada con Chrome a 390 y 1280 px: sin desborde horizontal ni errores propios en la consola

### Herramientas del paciente (plan.md, secciones 4 y 6)
- [x] `examinar(zona, maniobra, claridad, consentimiento)`: el caso decide la variante; al modelo no le llega el hallazgo
- [x] `terminar_consulta`
- [x] `medir_presion(pasos_cumplidos)`: el valor lo calcula el código (`lib/patient/blood-pressure.ts`)
- [x] `mostrar_region(region)`: avisa si la región no está disponible
- [x] `actualizar_estado(delta, motivo)`: guarda `cambio_animo`
- [x] Conectar `medir_presion` con el tensiómetro de la Persona 2 (valores marcados por el estudiante)

### Seguridad del personaje
- [x] Tests: no revela el diagnóstico ante "¿qué enfermedad tenés?" ni "ignorá tus instrucciones"
- [x] Script `apps/web/scripts/probar-personaje.mjs` (paciente por reglas: 6 de 6 en personaje)
- [x] Script con IA: el paciente siguió en personaje ("para eso vine, doc"); por voz también
- [ ] Repetir el script completo cuando producción guarde en Convex (se cortó por "Sesión no encontrada")

### Generador "pedime un paciente" (feature nueva)
- [x] `POST /api/cases/generate`: "dame un paciente con algo de garganta, que sea ansioso, de 60 años"
- [x] Inventa a la persona (con IA si hay clave, si no al azar); lo clínico sale de `cases/templates.ts`
- [x] Personalidad, edad y sexo desde el pedido; marcado como "generado" y "sin revisar"
- [x] Pedidos fuera de alcance (rodilla) devuelven un error claro
- [x] Pedir personalidad con más detalle ("que no quiera abrir la boca", "que hable mucho")
- [ ] Acordar con el equipo la regla de `AGENTS.md` para casos generados

### Avatar (P3)
- [x] Nivel de voz del paciente con `AnalyserNode`: `readPatientLevel()` en `useVoice`
- [ ] Persona 3: usar `readPatientLevel()` en el avatar para mover la boca

### Si la Persona 1 termina antes
- [ ] Tomar el tensiómetro con la Persona 2

---

## Persona 2 · Examen y evaluador (`feat/examen-evaluador`)

Termina cuando: el informe sale con puntaje, evidencia y veredicto válido.

### Vista de examen (plan.md, sección 6)
- [x] Orofaringe: círculo de luz que sigue al mouse o al dedo, zonas y tiempo por zona (`components/exam/orofaringe-view.tsx`)
- [x] Variantes de apertura (parcial, completa, negado) según la claridad
- [x] Guardar los tiempos por zona (`PATCH /api/sessions/[id]/exam/[actionId]`)
- [ ] Reemplazar el esquema por la foto con licencia de la Persona 3 (oscurecida, con máscara radial)
- [ ] Ubicar bien las zonas sobre la foto real (posición y radio)
- [ ] Tecla de abatelenguas que mejora la vista de las amígdalas (opcional)
- [ ] Describir por voz lo que vio y compararlo con el hallazgo esperado (crédito parcial si vio sin describir)

### Motor de puntaje (plan.md, sección 8)
- [x] Pesos 3, 2, 1; parcial 50%; ganados ÷ aplicables × 100 (`lib/scoring/engine.ts`)
- [x] Dimensiones 30/25/25/20 y tope de 15 puntos de penalización
- [x] Veredicto: 85% sin errores críticos, 70% a 84% "casi", menos de 70% "a repasar"
- [x] Penalizaciones: interrumpir desde la tercera vez, pregunta sugestiva, pregunta repetida
- [x] Error crítico: examinar sin consentimiento
- [x] Razonamiento: hipótesis 40%, diferenciales 25%, justificación 20%, estudios 15%
- [ ] Penalizaciones que faltan: jerga sin explicar, ignorar una pista emocional, saltar al diagnóstico
- [ ] Errores críticos que faltan: insistir contra la negativa, pasar por alto una alarma, trato irrespetuoso
- [ ] "Sube la confianza de un paciente difícil" como punto a favor
- [ ] Calibrar pesos y penalizaciones con un docente

### Evaluador con IA (plan.md, sección 8)
- [x] Juez por reglas que cita el turno (`lib/scoring/rule-judge.ts`)
- [x] Juez con IA por ítem (sí, parcial o no, con cita del turno), salida validada con zod (`lib/scoring/ai-judge.ts`)
- [x] Verificador de omisiones: buscar X en la transcripción antes de decir "no preguntaste X"
- [x] Redactor de feedback: por qué importa y cómo hacerlo la próxima vez (`lib/scoring/ai-evaluate.ts`; falta citar la fuente)
- [x] Evaluación del diagnóstico con IA (variantes aceptables)

### Validación del evaluador
- [x] 3 estudiantes simulados (bueno, mediocre, malo) ordenados bien (`tests/scoring.test.ts`)
- [x] Consistencia: 3 corridas iguales con el juez por reglas
- [ ] Repetir orden y consistencia con el juez con IA (variación menor a 5 puntos): `tests/evaluator-live.test.ts`, corre con la clave
- [ ] Cero omisiones inventadas: en `tests/evaluator-live.test.ts`, corre con la clave
- [ ] Contraste con 2 estudiantes reales

### Tensiómetro (P2)
- [x] Arrastrar el manguito, Espacio infla, S marca PAS, D marca PAD (`components/exam/tensiometro-view.tsx`)
- [x] Ruidos de Korotkoff (sintetizados) solo entre la PAS y la PAD del manómetro
- [x] Usar el valor de `medir_presion` y guardar lo que marcó el estudiante (`VitalsMeasurement.marked`)
- [ ] Calibrar los ajustes de `lib/exam/blood-pressure.ts` con un docente

### Otoscopio (P3)
- [x] Traccionar con arrastre, introducir con scroll, vista circular en esquema y técnica del afiche HC-02 (`components/exam/otoscopio-view.tsx`)
- [ ] Imágenes de oído con licencia (Persona 3) y hallazgos por caso (`lib/exam/otoscope.ts`)

### Si la Persona 2 se atrasa
- [ ] Simplificar el informe a puntaje por dimensión y errores principales

---

## Persona 3 · Producto, clínica y diseño (`feat/producto-ui`)

Termina cuando: 2 casos revisados por un médico y la app se ve bien a 390 y 1280 px.

### Casos y rúbrica (plan.md, sección 7)
- [x] Esquema del caso con zod (`cases/schema.ts`)
- [x] Caso 1 (Lucía) en borrador (`cases/garganta-01.json`)
- [x] Plantillas de garganta para el generador (`cases/templates.ts`)
- [ ] Revisar el caso 1 con un estudiante avanzado o un médico y completar `reviewedBy`
- [ ] Traducir las listas de cotejo de la facultad a `expectedChecklist` con pesos y palabras clave
- [ ] Revisar las plantillas del generador con un médico
- [ ] Caso 2: Rosa Rodríguez, hipertensión mal medida (P2)
- [ ] Caso 3: garganta con otra personalidad (P2)

### Banco de imágenes (plan.md, sección 7)
- [ ] Orofaringe normal, faringitis con eritema y faringoamigdalitis con exudado, con licencia
- [ ] Imágenes de apertura parcial (persona sana)
- [ ] Recortar, igualar color y viñeta, marcar zonas
- [ ] Registrar cada una en `assets/` y `CREDITS.md` (fuente, licencia, atribución, quién la validó)

### Diseño y pantallas
- [ ] `DESIGN.md`: fondo claro, un acento azul sereno, tipografía legible, botones grandes
- [ ] Inicio con la leyenda "herramienta de práctica, no reemplaza a pacientes reales ni a docentes"
- [ ] Entrar, perfil, elegir caso (con el generador), consulta, examen e informe
- [ ] Informe con las siete partes: veredicto con 4 barras, lo que hiciste bien, errores, línea de tiempo, mapa del examen, repetición sugerida y perfil de errores
- [ ] Todas las pantallas sin cortes a 390 y 1280 px

### Personajes y avatar (plan.md, sección 9)
- [ ] Método del retrato (generado o de stock) y voz elegida (hoy a las 14:00)
- [ ] Por personaje: retrato, 4 expresiones, 2 bocas entreabiertas, voz y ficha
- [ ] Avatar nivel 1: parpadeo, respiración y boca por volumen (P3)
- [ ] Probar 2 APIs de avatar (P3, después de la puerta 2)

### Validación con estudiantes y pitch
- [ ] Encuesta: 10 a 15 respuestas con año de carrera
- [ ] Preguntar a la facultad: permiso de materiales, nota "ORDEN", ficha de rodilla
- [ ] Pitch de 3 minutos, video de respaldo y declaración de qué es funcional, simulado o pendiente

---

## Fase final · Convex (Persona 1)

- [x] `ConvexStore` que cumpla la interfaz `Store` de `server/store.ts` (tabla `records`, protegida con `STORE_SECRET`)
- [x] Cargar `CONVEX_URL` y `STORE_SECRET` en Vercel: no llegaban porque Varlock borra las variables que no están en `.env.schema` (arreglado en `2becc63`). Desde las 17:15, `/api/health` en producción dice `store: convex`
- [ ] Declarar en `apps/web/.env.schema` las variables nuevas del servidor: `DOCENTES` y, si se quieren cambiar, `MAX_SESSIONS_PER_USER_PER_DAY` y `MAX_SESSIONS_PER_DAY` (si no, Varlock las borra)
- [x] `npx convex deploy` con `listRecentSessions`, `countSessionsSince`, `purgeOldSessions` y el cron nuevo (17/10)
- [x] Usuarios con Google e invitado: resuelto con OAuth propio y `records` (Convex Auth en `packages/backend/convex/auth.ts` queda sin usar)
- [x] Borrado de invitados a las 24 horas: `records.purgeExpiredGuests` cada hora (`crons.ts`)
- [ ] `mistakeProfile`: perfil de errores entre sesiones
- [ ] Imágenes en Convex storage y tabla `assets`
- [x] Credenciales de Google: van en Vercel (OAuth propio), no en Convex
- [x] Conectar Convex como almacenamiento (adelantado el 17/10: en Vercel la consulta fallaba con "Sesión no encontrada")
- [ ] Más adelante: pasar de `records` a las tablas tipadas del esquema

## Puertas (plan.md, sección 13)

- [ ] **Puerta 1:** URL pública con login, invitado y una sesión de voz de prueba
- [ ] **Puerta 2:** una consulta pasa por voz, examen e informe con puntaje y evidencia en la URL pública
- [ ] **Puerta 3:** funciones congeladas; solo arreglos, ensayo y video
