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
- [-] ~~Probar el login desde un celular en la URL pública~~ (descartado 17/10: no se va a probar en celular)
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
- [x] Clasificador rápido por turno (`lib/patient/turn-classifier.ts`): pregunta abierta o cerrada, sugestiva, jerga, empatía y repetida; actualiza el estado y avisa al modelo de voz con una nota silenciosa
- [ ] Persona 2: usar las etiquetas de `turn.tags` en el evaluador (preguntas abiertas, jerga, sugestivas)

### Voz (plan.md, secciones 4 y 5) · Gemini Live de Google AI Studio
- [x] Decisión del 17/10: la voz usa Gemini Live (Google AI Studio) en vez de OpenAI Realtime
- [ ] **Para más adelante (pedido el 17/10, no ahora):** volver a pasar la voz a OpenAI (GPT Realtime) en vez de Gemini Live
- [x] Token efímero de Gemini con las instrucciones fijadas: `POST /api/voice/session` (la clave real no sale del servidor)
- [x] Sesión de voz por WebSocket en `/consulta`: micrófono a 16 kHz y audio del paciente a 24 kHz (`lib/voice/use-voice.ts`)
- [x] Aviso antes de la voz: se guarda la transcripción, no el audio; no decir datos personales
- [x] Guardar cada turno transcrito (`POST /api/sessions/[id]/voice-turns`)
- [x] El estudiante interrumpe al paciente: se registra `interrupcion_estudiante`
- [x] El paciente se entera en el momento: el servidor devuelve una nota (sin turno) con la interrupción y su paciencia; desde la segunda vez muestra fastidio ("pará, dejame terminar")
- [ ] Probar con una persona que el paciente reacciona cuando lo interrumpen varias veces
- [x] Sin avisos de consola al reconectar: no se manda audio ni notas a una conexión que se está cerrando
- [x] El paciente interrumpe o retoma tras un silencio largo (20 s): `interrupcion_paciente` y `silencio_largo`
- [x] Detección de turno más rápida para pacientes impacientes (`silenceDurationMs` 500 en vez de 800)
- [x] Tope de 8 minutos en el servidor y reloj en pantalla
- [x] Decisión del 17/10: la consulta es **solo por voz**; se sacó el campo para escribir (la transcripción se ve para leer)
- [x] Plan B si falla la voz o el wifi: si la voz no arranca o se cae, aparece «Seguir por texto» y la consulta sigue escribiendo, con el mismo paciente; pedir examinar abre el examen igual. Probado en Chrome a 390 px
- [x] Probar la voz con la clave real (Gemini Live): audio, transcripción, personaje y herramienta `examinar` funcionan
- [x] Probar con micrófono en la computadora (URL pública, 17/10)
- [-] ~~Probar con micrófono en el celular~~ (descartado 17/10)
- [x] Verificar qué versión de API acepta el token efímero: `v1beta` funciona
- [x] Verificar `usageMetadata` de Gemini Live: es por turno (el prompt crece porque relee la conversación), sumar es correcto
- [x] Muestras de 6 voces (Kore, Aoede, Leda, Zephyr, Puck, Charon) con la misma frase de Lucía
- [x] Voces: cada consulta sortea una acorde al sexo del paciente (Kore, Aoede, Leda, Zephyr; Puck, Charon). `LIVE_VOICE` ya no se usa
- [x] Registrar los tokens de cada respuesta de la voz (`session.voiceUsage`)
- [x] Estimar el costo: US$0,50 a 0,80 por consulta de 8 min (audio entrada US$3/M, salida US$12/M; capa gratuita sin costo)
- [x] Costo real con `voiceUsage`: 2,8 min ≈ US$0,09 y 3,2 min ≈ US$0,14; una de 8 min ≈ US$0,40 a 0,60 (capa gratuita: sin costo)
- [x] Reconectar la voz si se corta la conexión (o si Google avisa con `goAway`), hasta 3 veces: el token nuevo lleva los últimos 40 turnos y la confianza actual, y la pantalla dice "Reconectando…"
- [x] Probar la reconexión en el navegador: en producción, con Chrome y micrófono simulado, se cortó la conexión a mano y la pantalla pasó a "Reconectando…" y volvió a "En línea" sola (`voiceStarts` 2)
- [ ] Probarla con una persona hablando y cortando el wifi de verdad
- [x] Topes para cuidar los créditos (plan.md, sección 14): 10 consultas por usuario por día (`MAX_SESSIONS_PER_USER_PER_DAY`), 200 en total por día (`MAX_SESSIONS_PER_DAY`, porque un invitado nuevo no cuesta nada). Responden 429 con un mensaje claro; `/api/health` muestra los topes
- [x] `/consulta` sin errores de consola a 390 y 1280 px (validación del prompt de la Persona 1, plan.md, sección 12). Arreglado: había un `<div>` dentro de la lista (`<ol>`), que React marca como error, y un fragmento inútil. Revisada con Chrome a 390 y 1280 px: sin desborde horizontal ni errores propios en la consola

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
- [x] Repetido en producción con Convex (17/10): 6 de 6 en personaje con el paciente con IA
- [x] Los casos del banco, cada uno con sus palabras prohibidas (con los cuatro de antes: 24 de 24 en producción; el script ya tiene los cuatro problemas actuales). El script separa el eco (el paciente repite sin entender lo que dijo el estudiante) de la fuga
- [x] Tests de una consulta completa por caso con su herramienta e informe (`tests/casos-completos.test.ts`)
- [x] Texto: nombrar la garganta («¿desde cuándo te duele la garganta?») ya no abre el examen; hacía falta para el plan B
- [x] Persona 2: el informe en producción sale con el juez con IA (revisado el 17/10 con `probar-consulta.mjs`: `juez: ia`)
- [x] Script completo en producción con Convex: 6 de 6 en personaje, sin cortes

### Generador "pedime un paciente" (feature nueva)
- [x] `POST /api/cases/generate`: "dame un paciente con algo de garganta, que sea ansioso, de 60 años"
- [x] Inventa a la persona (con IA si hay clave, si no al azar); lo clínico sale de `cases/templates.ts`
- [x] Personalidad, edad y sexo desde el pedido; marcado como "generado" y "sin revisar"
- [x] Pedidos fuera de alcance (rodilla) devuelven un error claro
- [x] Pedir personalidad con más detalle ("que no quiera abrir la boca", "que hable mucho")
- [ ] Acordar con el equipo la regla de `AGENTS.md` para casos generados

### Avatar (P3)
- [x] Nivel de voz del paciente con `AnalyserNode`: `readPatientLevel()` en `useVoice`
- [x] Persona 3: el avatar mueve los labios con la voz del paciente (resuelto con HeadAudio en `components/avatar/patient-avatar.tsx`, sin `readPatientLevel()`)

### Si la Persona 1 termina antes
- [x] Tensiómetro: lo hizo la Persona 2 (PR #2)

---

## Persona 2 · Examen y evaluador (`feat/examen-evaluador`)

Termina cuando: el informe sale con puntaje, evidencia y veredicto válido.

### Vista de examen (plan.md, sección 6)
- [x] Orofaringe: círculo de luz que sigue al mouse o al dedo, zonas y tiempo por zona (`components/exam/orofaringe-view.tsx`)
- [x] Variantes de apertura (parcial, completa, negado) según la claridad
- [x] Guardar los tiempos por zona (`PATCH /api/sessions/[id]/exam/[actionId]`)
- [x] Registro de fotos por clave de asset con sus zonas (`lib/exam/oropharynx.ts`); sin foto, sigue el esquema. Un test exige que cada foto exista y esté en `CREDITS.md`
- [ ] Persona 3: subir `mouth-partial-01`, `throat-exudate-01` y `throat-erythema-01` a `apps/web/public/exam/` con `CREDITS.md`; después registrarlas y ubicar las zonas (tecla Z en desarrollo)
- [x] Tecla de abatelenguas (A, o botón): sin él, amígdalas y pared posterior cuentan la mitad
- [x] Describir lo que vio y compararlo con el hallazgo esperado; parcial si vio sin describir; ignora lo negado ("no veo placas"). También para el oído
- [x] Aviso sin puntaje por un examen que el caso no necesitaba (`Report.notices`)
- [ ] Persona 3: mostrar en el informe `source` de cada error y `notices`

### Motor de puntaje (plan.md, sección 8)
- [x] Pesos 3, 2, 1; parcial 50%; ganados ÷ aplicables × 100 (`lib/scoring/engine.ts`)
- [x] Dimensiones 30/25/25/20 y tope de 15 puntos de penalización
- [x] Veredicto: 85% sin errores críticos, 70% a 84% "casi", menos de 70% "a repasar"
- [x] Penalizaciones: interrumpir desde la tercera vez, pregunta sugestiva, pregunta repetida
- [x] Error crítico: examinar sin consentimiento
- [x] Ese error crítico mira el orden (extractor: `atMs` del evento `consentimiento` contra cada examen); test de punta a punta con la voz en `tests/voice.test.ts`
- [x] Razonamiento: hipótesis 40%, diferenciales 25%, justificación 20%, estudios 15%
- [x] Penalizaciones: jerga sin explicar, ignorar una pista emocional, saltar al diagnóstico
- [x] Errores críticos: insistir contra la negativa, pasar por alto una alarma (ítem del caso con "alarma"), trato irrespetuoso
- [x] "Sube la confianza de un paciente difícil" como punto a favor (+5 de comunicación)
- [ ] Persona 3: ítem de signos de alarma en los casos de garganta y de oído (propuesta en la planilla de calibración)
- [ ] Verificar en el equipo la planilla de calibración (sin docente; propuestas con fuentes públicas) y pasar los valores al código

### Evaluador con IA (plan.md, sección 8)
- [x] Juez por reglas que cita el turno (`lib/scoring/rule-judge.ts`)
- [x] Juez con IA por ítem (sí, parcial o no, con cita del turno), salida validada con zod (`lib/scoring/ai-judge.ts`)
- [x] Verificador de omisiones: buscar X en la transcripción antes de decir "no preguntaste X"
- [x] Redactor de feedback: por qué importa y cómo hacerlo la próxima vez (`lib/scoring/ai-evaluate.ts`); cada error nombra su fuente (`source`)
- [x] Evaluación del diagnóstico con IA (variantes aceptables)

### Validación del evaluador
- [x] 3 estudiantes simulados (bueno, mediocre, malo) ordenados bien (`tests/scoring.test.ts`)
- [x] Consistencia: 3 corridas iguales con el juez por reglas
- [x] Orden y consistencia con el juez con IA (17/10, Gemini): 97 / 46 / 5 y tres corridas en 46 (`tests/evaluator-live.test.ts`, con pedidos espaciados por la cuota gratuita)
- [x] Cero omisiones inventadas con el juez con IA
- [ ] Contraste con una estudiante real en 2 casos (garganta y oído), con la guía de prueba

### Tensiómetro (P2)
- [x] Arrastrar el manguito, Espacio infla, S marca PAS, D marca PAD (`components/exam/tensiometro-view.tsx`)
- [x] Ruidos de Korotkoff (sintetizados) solo entre la PAS y la PAD del manómetro
- [x] Usar el valor de `medir_presion` y guardar lo que marcó el estudiante (`VitalsMeasurement.marked`)
- [ ] Pasar al código los ajustes de la planilla (AHA 2019, Handler 2009) cuando el equipo los verifique

### Otoscopio (P3)
- [x] Traccionar con arrastre, introducir con scroll, vista circular en esquema y técnica del afiche HC-02 (`components/exam/otoscopio-view.tsx`)
- [x] Hallazgos por caso: examinar los dos oídos y empezar por el sano; hallazgo esperado en palabras (`lib/exam/otoscope.ts`)
- [x] Registro de fotos de oído por hallazgo (`EAR_PHOTOS`)
- [ ] Persona 3: fotos de oído con licencia y el ítem `describe-hallazgo` en `oido-01.json`

### Si la Persona 2 se atrasa
- [ ] Simplificar el informe a puntaje por dimensión y errores principales

---

## Persona 3 · Producto, clínica y diseño (`feat/producto-ui`)

Termina cuando: 2 casos revisados por un médico y la app se ve bien a 390 y 1280 px.

### Casos y rúbrica (plan.md, sección 7)
- [x] Esquema del caso con zod (`cases/schema.ts`)
- [x] Caso 1 (Lucía, faringoamigdalitis) en borrador; desde el 17/10 ya no está en el banco y quedó como fixture del evaluador (`apps/web/tests/fixtures/faringoamigdalitis.json`)
- [x] Plantillas de garganta para el generador (`cases/templates.ts`)
- [ ] Revisar el caso 1 con un estudiante avanzado o un médico y completar `reviewedBy`
- [ ] Traducir las listas de cotejo de la facultad a `expectedChecklist` con pesos y palabras clave
- [ ] Revisar las plantillas del generador con un médico
- [x] 17/10: el banco queda con dos pacientes y dos problemas cada uno, a elegir antes de empezar («Problema 1, 2» o «Al azar»; el nombre no dice el diagnóstico)
  - Lucía (garganta): `garganta-02` faringitis viral (Problema 1), `garganta-03` mononucleosis (Problema 2)
  - Diego (oído): `oido-01` otitis externa (Problema 1), `oido-02` otitis media aguda con tímpano abombado (Problema 2)
  - Se sacaron la faringoamigdalitis (`garganta-01`) y el dolor de oído por la mandíbula (`oido-03`)
  - Se sacaron Rosa y Jorge. `hipertension-01.json` queda solo para el generador (pacientes de presión)
- [x] En cualquier caso se puede examinar la garganta, el oído y la presión; lo que no es del problema (`relevantExams` del caso) resta 1 punto de examen por tipo
- [ ] Revisar con un médico los cuatro problemas (todos borrador) y completar `reviewedBy`, incluidos los datos clave, lo que distingue a cada diferencial y la conducta razonable (`truth.keyClues`, `differentialHints`, `conduct`)
- [x] Evaluación del diagnóstico en el informe (`lib/scoring/diagnosis.ts`): si acertó, si estuvo cerca o si planteó un diferencial (y qué los distingue), datos clave que encontró y que le faltaron, si los usó para justificar, diferenciales que pensó y que le faltaron, y si le dijo al paciente un diagnóstico equivocado
- [x] Informe con «Tu diagnóstico», «Lo que hiciste bien», «Lo que hiciste mal», «Puntos a mejorar» (los 5 más importantes, en orden) y «Datos clave del caso»
- [x] Razonamiento por caso: la justificación cuenta con los datos clave del caso y la conducta con la del caso (antes, en los casos de oído nunca contaban)
- [ ] Calibrar con un docente si medir la presión o mirar la garganta en un caso de oído tiene que restar (hoy resta 1 punto)


### Banco de imágenes (plan.md, sección 7)
- [x] Orofaringe normal, faringitis con eritema y faringoamigdalitis con exudado, con licencia (`public/exam/`, validadas por una estudiante avanzada)
- [ ] Imágenes de apertura parcial (persona sana)
- [ ] Recortar, igualar color y viñeta, marcar zonas
- [x] Registrar cada una en `CREDITS.md` (fuente, licencia, atribución, quién la validó). Faltan validar las dos de oído

### Diseño y pantallas
- [ ] `DESIGN.md`: fondo claro, un acento azul sereno, tipografía legible, botones grandes
- [x] Inicio con la leyenda "herramienta de práctica, no reemplaza a pacientes reales ni a docentes"
- [ ] Entrar, perfil, elegir caso (con el generador), consulta, examen e informe
- [ ] Informe con las siete partes: veredicto con 4 barras, lo que hiciste bien, errores, línea de tiempo, mapa del examen, repetición sugerida y perfil de errores
- [ ] Todas las pantallas sin cortes a 390 y 1280 px

### Personajes y avatar (plan.md, sección 9)
- [ ] Método del retrato (generado o de stock) y voz elegida (hoy a las 14:00)
- [ ] Por personaje: retrato, 4 expresiones, 2 bocas entreabiertas, voz y ficha
- [x] Avatar: modelo 3D con labios sincronizados con la voz y cara según el ánimo (TalkingHead y HeadAudio, CC0 y MIT)
- [ ] Probar 2 APIs de avatar (P3, después de la puerta 2)

### Validación con estudiantes y pitch
- [ ] Encuesta: 10 a 15 respuestas con año de carrera
- [ ] Preguntar a la facultad: permiso de materiales, nota "ORDEN", ficha de rodilla
- [ ] Pitch de 3 minutos, video de respaldo y declaración de qué es funcional, simulado o pendiente

---

## Revisión de código (17/10)

- [x] Cambios atómicos de sesión, historia oculta fuera de la vista, topes de gasto y arreglos de voz (ver PROGRESO.md)
- [x] Límite por IP para crear invitados y sesiones (50 invitados y 100 consultas por hora por IP; se cambian con `MAX_GUESTS_PER_IP_PER_HOUR` y `MAX_SESSIONS_PER_IP_PER_HOUR`, que habría que declarar en `.env.schema`)
- [ ] Persona 2: en `lib/scoring/ai-judge.ts`, comparar la hipótesis con `truth.acceptable` en código antes de confiar en el sí/no de la IA

## Fase final · Convex (Persona 1)

- [x] `ConvexStore` que cumpla la interfaz `Store` de `server/store.ts` (tabla `records`, protegida con `STORE_SECRET`)
- [x] Cargar `CONVEX_URL` y `STORE_SECRET` en Vercel: no llegaban porque Varlock borra las variables que no están en `.env.schema` (arreglado en `2becc63`). Desde las 17:15, `/api/health` en producción dice `store: convex`
- [ ] Declarar en `apps/web/.env.schema` las variables nuevas del servidor: `DOCENTES` y, si se quieren cambiar, `MAX_SESSIONS_PER_USER_PER_DAY` y `MAX_SESSIONS_PER_DAY` (si no, Varlock las borra)
- [x] `npx convex deploy` con `listRecentSessions`, `countSessionsSince`, `purgeOldSessions` y el cron nuevo (17/10)
- [x] Usuarios con Google e invitado: resuelto con OAuth propio y `records` (Convex Auth en `packages/backend/convex/auth.ts` queda sin usar)
- [x] Borrado de invitados a las 24 horas: `records.purgeExpiredGuests` cada hora (`crons.ts`)
- [x] Perfil de errores entre consultas: se suma al cerrar cada consulta; `GET /api/me/mistakes` y `api.mistakes()`
- [ ] Persona 3: mostrar el perfil de errores en el informe (parte 7) con `api.mistakes()`
- [ ] Imágenes en Convex storage y tabla `assets`
- [x] Credenciales de Google: van en Vercel (OAuth propio), no en Convex
- [x] Conectar Convex como almacenamiento (adelantado el 17/10: en Vercel la consulta fallaba con "Sesión no encontrada")
- [ ] Más adelante: pasar de `records` a las tablas tipadas del esquema

## Puertas (plan.md, sección 13)

- [x] **Puerta 1:** URL pública con invitado y voz probada con micrófono (17/10). El login con Google espera las credenciales
- [ ] **Puerta 2:** una consulta pasa por voz, examen e informe con puntaje y evidencia en la URL pública. Por texto ya pasa (17/10, `node apps/web/scripts/probar-consulta.mjs`: 13 chequeos en verde, 90%, «Lo hiciste bien»; repetido después del merge de la Persona 2: 87%, «Lo hiciste bien», juez con IA). Falta una consulta completa por voz con una persona: la hace la estudiante de la guía de prueba (garganta y oído)
- [ ] **Puerta 3:** funciones congeladas; solo arreglos, ensayo y video
