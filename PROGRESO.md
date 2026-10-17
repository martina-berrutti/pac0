# Paciente 0 — Progreso

Registro de avances. Lo más nuevo arriba. Cada entrada dice quién, qué se hizo, cómo se validó y qué quedó pendiente. Las tareas están en [`TODO.md`](TODO.md).

## 17/10 · Persona 1 · Tres casos nuevos para mostrar más funciones

- **Rosa Rodríguez, 58** (`hipertension-01`): hipertensión mal medida, el caso 2 del plan. Llega corriendo, tomó café y está con el celular; sin reposo ni silencio la presión da más de 150. Usa el tensiómetro de la Persona 2, que ya preveía su brazo grande (manguito chico). Café variable entre consultas.
- **Diego, 29** (`oido-01`): guardavidas con otitis externa derecha. Usa el otoscopio: conducto derecho con secreción, tímpano sano. Si por voz le piden revisar el oído, la herramienta `examinar` abre el otoscopio.
- **Jorge, 45** (`garganta-02`): faringitis viral con paciente hostil y voz de hombre; no abre la boca sin permiso.
- El generador ahora también arma pacientes con dolor de oído y para control de presión (plantillas que reutilizan lo clínico de esos casos; hipertensión con 45 años o más).
- Los tres son **borradores sin revisar** (`reviewedBy: null`). `AGENTS.md` dice "un solo caso perfecto antes de agregar otro": se agregaron a pedido para la demo y falta la revisión médica.
- Validación: 109 tests en web.

## 17/10 · Persona 1 · Clasificador de turnos y voces al azar

- Clasificador por reglas de cada turno del estudiante (`lib/patient/turn-classifier.ts`): pregunta abierta o cerrada, sugestiva, jerga sin explicar, empatía y pregunta repetida. Actualiza el estado del paciente (`cambio_animo` con motivo "clasificador: …") y guarda las etiquetas en `turn.tags` para el evaluador. Funciona en texto y en voz, y la empatía ya no se suma dos veces.
- En la voz, cuando la confianza o la paciencia cambian de nivel, el cliente le manda al modelo una nota silenciosa (`turnComplete: false`). Probado en producción: la nota no genera audio, y después de la empatía el paciente hostil afloja ("Bueno, ta, está bien. Abrila entonces, si me decís para qué sirve.").
- Voces: cada consulta sortea una acorde al sexo del paciente (`patient.sex` en el caso; el generador lo completa) y la mantiene aunque se reconecte.
- Validación: 98 tests en web y 18 en backend.
- Ojo: `apps/web/.env.local` quedó vacío a las 17:08, así que la voz local no anda hasta volver a poner `GEMINI_API_KEY`.

## 17/10 · Persona 1 · Tareas agregadas en la revisión

- **Rol de docente:** `roleOf` en `server/auth.ts`; docente es quien tiene su id de cuenta en `DOCENTES` (nunca un invitado). Puede leer la consulta y el informe de cualquiera, pero no actuar en ellas, y listar las últimas consultas con `GET /api/teacher/sessions` (solo el alias). `/api/me` devuelve `role` y `accountId`.
- **Retención:** `records.purgeOldSessions` (cron cada 6 h) borra las sesiones de las cuentas más viejas que `TRANSCRIPT_RETENTION_DAYS`, con todo lo que cuelga de ellas; el perfil se queda. Sin la variable no borra nada hasta que la facultad defina el plazo.
- **Estado del paciente:** las interrupciones del estudiante, los silencios largos y el consentimiento mueven `paciencia` y `confianza` (`lib/patient/state.ts`), y cada cambio queda como `cambio_animo` con el motivo. `actualizar_estado` usa la misma función.
- **Reconexión de la voz:** si la conexión se corta o Google manda `goAway`, el navegador guarda lo que quedó a medias y pide un token nuevo (hasta 3 veces). El token lleva los últimos 40 turnos y la confianza, así el paciente sigue desde donde estaba.
- **Topes:** 10 consultas por usuario por día, 200 en total (configurables), más el tope de 6 conexiones de voz por consulta que ya estaba en `main`. Si Convex todavía no tiene la función del conteo, la consulta igual arranca.
- **`/consulta`:** se sacó un `<div>` que estaba dentro de la lista (React lo marca en la consola) y un fragmento inútil. Lint sin avisos.
- **`.gitattributes`** con `eol=lf`: `npm run lint` ya pasa en Windows.
- Validación: 80 tests en web (7 nuevos en `tests/persona1.test.ts`) y 18 en backend (2 nuevos); lint, tipos y build pasan.
- **Desplegado:** `npx convex deploy` a producción y push a `main` (Vercel ya muestra los topes en `/api/health`).
- **Prueba en producción** con Chrome y micrófono simulado: la voz conecta; al cortar la conexión a mano la pantalla pasa a "Reconectando…" y vuelve a "En línea" sola (`voiceStarts` 2). `/consulta` a 390 y 1280 px sin desborde horizontal ni errores propios en la consola.
- **Falta:** declarar `DOCENTES` en `.env.schema` y cargarlo en Vercel. Producción ya usa Convex (`/api/health` dice `store: convex` desde que se declararon las variables en `.env.schema`).

## 17/10 · Persona 1 · Revisión del avance contra plan.md

- Repasé la lista de la Persona 1 (plan.md, sección 11) contra el código y producción, y la actualicé en `plan.md` y en `TODO.md`.
- **Producción** (`/api/health` en https://pac0-l3xi.vercel.app): `store: memoria`, `convexUrl: false`, `storeSecret: false`, `google: false`; la voz y `SESSION_SECRET` sí están. Cargar `CONVEX_URL` y `STORE_SECRET` en Vercel es lo que más urge: sin eso no se cruza la puerta 1.
- **Hecho:** base y deploy, esquema, invitado, endpoint de voz (Gemini Live), prompt sin diagnóstico, las 5 herramientas, personalidades y confianza, interrupciones, tope de 8 min, pruebas de personaje y `readPatientLevel()`.
- **A medias:** Google (el código está pero faltan las credenciales), turnos en Convex (el código está pero faltan las variables en Vercel), respaldo por texto (se sacó, falta decidir).
- **Tareas nuevas** que pide el plan y no estaban en la lista: rol estudiante o docente en el perfil y acceso de docentes a los informes; retención de transcripciones (ley 18.331); eventos objetivos que actualicen el estado del paciente; reconectar la voz sin perder la conversación; límite de consultas por usuario para cuidar los créditos; `/consulta` sin errores de consola a 390 y 1280 px.
- Validación: 72 tests en web pasan (3 del evaluador con IA se saltean sin clave); tipos pasan. Lint pasa con los archivos de git (solo 1 aviso: fragmento inútil en `consulta/[id]/page.tsx`). En Windows con `core.autocrlf=true`, Biome marca los archivos como mal formateados por los finales de línea CRLF: conviene agregar un `.gitattributes` con `* text=auto eol=lf`.

## 17/10 · Persona 1 · Producción con Convex y perfil de errores

- **Producción funcionando:** `/api/health` dice `store: convex`. Una consulta se crea y se lee 8 veces sin cortarse, y la prueba de personaje con IA (6 intentos en una consulta larga) pasa sin errores.
- Causa del problema: varlock borra del servidor las variables que no están en `apps/web/.env.schema`. Se declararon `CONVEX_URL`, `STORE_SECRET`, `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
- Después, `STORE_SECRET` de Vercel no coincidía con la de Convex (se comparó por hash, sin mostrar valores). Se recargó con la CLI de Vercel.
- Perfil de errores entre consultas: al cerrar cada consulta se suman los errores del informe por tema (`server/mistakes.ts`); `GET /api/me/mistakes` y `api.mistakes()` para la pantalla del informe. En invitados se borra a las 24 horas.
- README: cómo usar la voz en la compu después de hacer pull.
- Validación: 76 tests en web y 16 en backend.

## 17/10 · Persona 1 · Mejoras de la voz para la demo

- Micrófono y audio a la frecuencia propia del navegador. Antes se forzaba 16 kHz, y Firefox no deja mezclar frecuencias: la voz no arrancaba.
- Los contextos de audio se crean en el mismo clic, como pide Safari (sobre todo iPhone).
- Primero se pide el micrófono y después el token, así no se gasta un token si se niega el permiso.
- Mensajes claros: micrófono bloqueado (con cómo permitirlo), sin micrófono y conexión cortada (para reconectar).
- Tope de 6 conexiones de voz por consulta, para que nadie gaste la clave pidiendo tokens sin parar. Test incluido.
- El texto (generador y paciente por texto) usa primero `gemini-3.5-flash-lite`, que responde rápido; `gemini-3.8-flash` queda de respaldo.
- Validación: 73 tests en web y 16 en backend; lint, tipos y build pasan.

## 17/10 · Persona 1 · Login con Google, borrado de invitados, costo y voces

- **Producción todavía en memoria:** `/api/health` en Vercel dice `store: memoria`, con `convexUrl` y `storeSecret` en false. Faltan esas dos variables en Vercel, y por eso la consulta se sigue cortando con "Sesión no encontrada".
- Integrado el PR #2 de la Persona 2 (evaluador con IA, tensiómetro unificado con `medir_presion`, otoscopio). Todo sigue pasando: 72 tests en web y 16 en backend.
- Login con Google por OAuth propio (`/api/auth/google` y `/api/auth/google/callback`): solo `openid`, `state` contra CSRF, id `ggl_` + hash del identificador, cuenta por 30 días. Alias y año se guardan en Convex (`records` tipo `user`). Tests con Google simulado.
- Borrado de invitados: los ids de invitado empiezan con `gst_`, sus sesiones y casos se marcan `guest`, y `records.purgeExpiredGuests` los borra a las 24 horas, cada hora. Test con reloj simulado.
- Costo de la voz: `usageMetadata` llega una vez por turno y no es acumulado, pero el prompt crece porque relee la conversación. Precio de `gemini-3.8-live`: audio de entrada US$3/M y de salida US$12/M. Estimación: US$0,50 a 0,80 por consulta de 8 min; la capa gratuita no cobra.
- Voces: muestras de Kore, Aoede, Leda, Zephyr, Puck y Charon con la misma frase de Lucía, para elegir.
- Prueba de personaje con IA: "¿Qué enfermedad tenés?" → "Y... para eso vine, doc, no tengo idea qué será. ¿Vos qué decís?".
- `GET /api/health`: qué almacenamiento usa el servidor y qué variables están cargadas, sin mostrar valores.

## 17/10 · Persona 1 · Datos en Convex (arreglo de "Sesión no encontrada")

- Problema: en Vercel la consulta mostraba "Sesión no encontrada" y se quedaba cargando. Cada instancia tenía su propia memoria y la sesión se creaba en una y se pedía en otra.
- Arreglo: el almacenamiento usa Convex cuando están `CONVEX_URL` y `STORE_SECRET` (tabla `records` en `packages/backend/convex/records.ts`). Cada función exige `STORE_SECRET`, que solo conoce el servidor. Sin esas variables (local y tests) sigue la memoria.
- La interfaz `Store` pasó a ser asincrónica; rutas, consulta, voz y tests actualizados.
- Si una pantalla no puede cargar, ahora muestra el error y un botón para volver, en vez de quedarse cargando.
- Validación: dos servidores de producción separados (3002 y 3003) contra Convex. Caso generado, sesión, turno de voz, herramienta, consentimiento e informe se crean en uno y se leen en el otro. Otro usuario recibe 404. Convex de producción ya tiene las funciones y `STORE_SECRET`.
- **Falta:** cargar `CONVEX_URL` y `STORE_SECRET` en Vercel.

## 17/10 · Persona 1 · Voz con Gemini probada en vivo

- Probado con la clave real contra Gemini Live (texto en lugar de micrófono): el paciente responde con audio, en rioplatense ("Y, mmm… ta"), con transcripción, y no revela el diagnóstico ante "¿qué enfermedad tenés?".
- "¿Puedo revisarte? Abrí bien grande y decí aaa" llama a `examinar(orofaringe, alta, consentimiento)`; el servidor guarda la apertura completa y el paciente responde "Ah... aaa...".
- Arreglo: con `lockAdditionalFields` y herramientas, Google rechaza el token ("field_mask is invalid"). Sin ese campo el token igual fija toda la configuración.
- Arreglo: `gemini-3.8-flash` dio 503 por alta demanda; el texto ahora prueba `gemini-3.5-flash-lite` de respaldo.
- El token funciona con `v1beta`.
- **Falta:** probar con micrófono en el navegador.

## 17/10 · Persona 1 · Consulta solo por voz

- Se sacó el campo para escribir en `/consulta`: la entrevista es solo por voz y la transcripción se muestra para leer. La hipótesis y los diferenciales se siguen escribiendo al terminar.
- La API de turnos por texto queda para los tests y `scripts/probar-personaje.mjs`, sin pantalla.
- Ojo: el plan (secciones 5 y 14) pedía una versión por texto como plan B si falla la voz o el wifi. Queda el video de respaldo.

## 17/10 · Persona 1 · La voz pasa a Gemini Live (Google AI Studio)

- Decisión: la voz usa la Live API de Gemini en vez de OpenAI Realtime. Una sola clave (`GEMINI_API_KEY`) sirve para la voz, el paciente por texto y el generador.
- El servidor crea un token efímero de un solo uso con las instrucciones del paciente, la voz, la transcripción y las herramientas **fijadas** (`liveConnectConstraints`): el navegador no las ve ni las puede cambiar.
- El navegador manda el micrófono en PCM a 16 kHz por WebSocket y reproduce la voz del paciente a 24 kHz. Las interrupciones llegan como `serverContent.interrupted`, y la transcripción como `inputTranscription` y `outputTranscription`.
- Modelos: `gemini-3.8-live` (voz) y `gemini-3.8-flash` (texto), según la documentación de Google del 17/10.
- La documentación web dice que los tokens efímeros van por `v1beta` y el SDK dice `v1alpha`: el servidor prueba las dos.
- Validación: 38 tests en web, con el SDK de Google simulado; lint, tipos y build pasan.
- **Pendiente:** probar en vivo con la clave.

## 17/10 · Persona 1 · Pendientes del motor del paciente

- Generador: entiende pedidos de personalidad con palabras ("que hable mucho", "que no quiera abrir la boca", "impaciente", "que no escuche").
- Variación controlada: el caso define opciones por dato (`variations`) y se sortea una al empezar. El caso 1 varía fiebre y contactos (a revisar por la Persona 3).
- Herramienta `anotar_dato`: lo que el paciente inventa queda en la sesión y en sus instrucciones, para no contradecirse.
- Se suman los tokens de cada respuesta de la voz por sesión (`voiceUsage`), para medir el costo sin inventar la cifra.
- `readPatientLevel()` en `useVoice`: volumen del paciente de 0 a 1 para el avatar.
- Script `scripts/probar-personaje.mjs`: 6 intentos de sacar al paciente del personaje. Con el paciente por reglas, 6 de 6 en personaje.
- Validación: 38 tests en web y 13 en backend; lint, tipos y build pasan.
- **Bloqueado sin clave:** probar la voz en vivo, el script con IA, elegir la voz y medir el costo.
- **Producción caída:** en https://pac0-l3xi.vercel.app el invitado da 500 hasta cargar `SESSION_SECRET` en Vercel.

## 17/10 · Persona 1 · Voz y herramientas del paciente

- Consulta por voz con OpenAI Realtime por WebRTC en `/consulta`. El servidor pide la clave efímera con las instrucciones del paciente sin el diagnóstico (`POST /api/realtime/session`).
- Herramientas del paciente: `examinar`, `medir_presion`, `mostrar_region`, `actualizar_estado` y `terminar_consulta`. Las ejecuta el servidor; al modelo no le llegan hallazgos ni valores de presión.
- Se guardan las transcripciones (no el audio), las interrupciones en ambos sentidos y los silencios largos. Tope de 8 minutos con reloj en pantalla.
- Validación: 12 tests nuevos (34 en web). Cubren que la clave efímera no lleve el diagnóstico, las herramientas, el paciente hostil que no abre sin permiso, la presión calculada por código y el tope de tiempo. Lint, tipos y build pasan.
- **Pendiente:** probar la voz en vivo; hace falta una `OPENAI_API_KEY`. Sin clave, la pantalla avisa y queda la versión por texto.

## 17/10 · Persona 1 · App funcional sin Convex

- Decisión: Convex queda para el final. La API de Next.js guarda todo en memoria detrás de la interfaz `Store`.
- Invitado con cookie firmada, perfil con alias y año, rutas protegidas.
- API completa: casos, generador, sesiones, turnos, examen, cierre e informe.
- Feature nueva, **"pedime un paciente"**: inventa a la persona y toma lo clínico de plantillas del equipo.
- Contratos compartidos para las Personas 2 y 3; motor de puntaje, juez por reglas, vista de linterna y pantallas mínimas.
- Validación: 22 tests en web; el evaluador ordena bien a 3 estudiantes simulados. Commit `d8f258c`.

## 17/10 · Persona 1 · Base, esquema y deploy

- Base con Better-T-Stack, Biome, `AGENTS.md` y `.claude/settings.json`.
- Esquema de Convex con las 10 tablas y Convex Auth con Google e invitado (queda para la fase final).
- Deploy en Vercel: https://pac0-l3xi.vercel.app. Commit `723ca17`.
