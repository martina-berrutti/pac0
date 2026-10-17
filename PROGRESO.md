# Paciente 0 — Progreso

Registro de avances. Lo más nuevo arriba. Cada entrada dice quién, qué se hizo, cómo se validó y qué quedó pendiente. Las tareas están en [`TODO.md`](TODO.md).

## 17/10 · Persona 1 · Arreglo y prevención de bugs (integrado con main)

Cinco pasadas buscando errores en lo de la Persona 1, integradas sobre `main`. Donde `main` ya resolvía algo (limpieza de invitados en Convex, tope de 6 conexiones de voz, tensiómetro, frecuencias de audio, mensajes del micrófono, costo de la voz), quedó su versión.

- Voz:
  - Todo lo que el navegador manda al servidor va en fila (`lib/voice/queue.ts`, con tests): turnos en orden, el permiso anotado antes de `examinar` y sin escrituras que se pisen en Convex.
  - Al cortar o al vencer los 8 minutos se guarda lo que se estaba diciendo, y "Ver mi informe" espera a que se guarde todo.
  - Reconexión: el paciente recibe lo ya hablado, marcado como solo transcripción (no son instrucciones) y recortado.
  - Si se sale mientras conecta, se cierran el socket y el micrófono. Los mensajes que llegan después de `close()` se ignoran (antes podían correr `examinar` con la voz cortada), y una herramienta en espera no corre si se cortó.
  - Los envíos por un socket cerrado ya no tiran excepciones a la consola. La respuesta de una herramienta va solo a la sesión que la pidió.
  - `interrupcion_estudiante` (penaliza desde la tercera) solo cuenta si el audio del paciente ya sonaba.
  - El token de Gemini vence con la consulta, no a los 10 minutos.
- Herramientas: argumentos fuera del esquema se corrigen en vez de fallar ("Alta", ±0.9, pasos inventados). "toString" no es una herramienta. `anotar_dato` no pisa el perfil ni lo sorteado.
- Consentimiento: "¿puedo preguntarte la edad?" ya no autoriza a examinar (el paciente hostil abría la boca). "Palabra" no es un pedido de examen.
- Privacidad: `GET /api/sessions/[id]` mandaba `historyOverrides` (historia oculta sorteada) e `inventedFacts` al navegador; ahora es una lista blanca.
- Límites: cuerpos de más de 64 KB → 413; 30 casos generados por usuario; turnos de voz largos se recortan en vez de perderse con un 400; tiempos del examen solo de zonas del caso.
- Cierre: se evalúa antes de guardar, y el informe se guarda antes que el estado. Si el evaluador (ahora también con IA) falla, la sesión no queda "evaluada" sin informe.
- Generador y paciente por reglas: "él" y "varón", "tos" como palabra entera ("datos" elegía la plantilla de catarro), "100 años", JSON de la IA entre ```, respuesta sin género, `cambio_animo` guarda el cambio.
- Pantalla de consulta: no ofrece la voz si la consulta venció o se cerró; limita la hipótesis a 500 caracteres y 10 diferenciales.
- Cliente de voz con tests (`tests/use-voice.test.ts`): el hook corre en Node con el micrófono, el `AudioContext`, el socket de Gemini y el servidor simulados. Cubre el orden de los turnos (el estudiante antes que la herramienta aunque su guardado tarde más), cortar a mitad de frase, mensajes después de cortar, cancelar mientras se pide el micrófono, micrófono bloqueado, socket cerrado e interrupciones. Si se sacan la fila o el filtro de mensajes tardíos, los tests fallan.
- Revisión del código nuevo de `main` en carpetas de la Persona 1 (login con Google, invitados `gst_`, `/api/health`, tensiómetro, otoscopio, `records`):
  - Tensiómetro y otoscopio: colocar el manguito, marcar la presión y terminar la otoscopia tienen 60 s de margen después de los 8 minutos (`FINISH_EXAM_GRACE_MS`). Antes, un examen empezado cerca del final daba 409 y se perdía. Empezar uno nuevo sigue exigiendo estar dentro de los 8 minutos.
  - Limpieza de invitados en Convex: cada corrida podía leer y borrar decenas de miles de registros en una sola mutación. Si pasaba el límite de Convex, fallaba siempre con las mismas sesiones y la limpieza quedaba trabada. Ahora tiene un presupuesto de 1000 borrados por corrida (una sesión larga se borra en varias) y corre cada 10 minutos. Test con una sesión de 1500 turnos.
  - Login con Google (state, emisor, audiencia, vencimiento, hash del id), `/api/health` (solo booleanos) y el perfil de cuentas: sin problemas.
  - Pedidos colgados: el `fetch` del cliente de voz no tenía tope, y como las escrituras van en fila, un pedido colgado trababa los turnos, las herramientas y "Ver mi informe". Ahora cortan a los 15 s y la fila sigue (test que se cuelga si se saca el tope). Las pantallas (`lib/api-client.ts`) cortan a los 60 s con un mensaje claro.
  - Búsqueda de patrones en todas las carpetas de la Persona 1: llamadas al store sin `await` (todas dentro de `Promise.all`), `JSON.parse` (todos con `try` o atrapados por quien llama), `fetch` sin tope (arreglados), aserciones `!` (ninguna), `.collect()` sin límite (solo en la limpieza de Convex Auth, que ya no se usa y tiene la tabla vacía).
  - Segunda integración con `main` (reconexión automática de la voz, retención, perfil de errores, rol docente): el presupuesto de borrados quedó en la `deleteSession` compartida, así que cubre a invitados y a la retención de cuentas. El contexto de reconexión es uno solo: el de `main` (con la confianza actual) más la marca de transcripción y el recorte. Sobre el hook con reconexión se volvieron a aplicar la fila, el guardado al cortar, la cancelación por intento (con la reconexión, cortar mientras se pedía el micrófono abría igual una conexión), los envíos protegidos, las interrupciones solo con audio sonando, la respuesta de herramientas a su conexión y el tope de 15 s.
  - Revisión del código nuevo de `main` (rol docente, perfil de errores, topes diarios, estado con eventos, consultas de Convex del panel docente): el docente podía abrir `/consulta` de un estudiante y veía los controles de voz y de cierre (al tocarlos, pedía el micrófono y fallaba con "Sesión no encontrada"). Ahora la vista trae `readOnly` y la pantalla muestra solo la transcripción. El resto (roles, topes, `nudgeState`, `listRecentSessions`, `countSessionsSince`) está acotado y sin problemas.
  - `scripts/probar-api.mjs`: prueba de punta a punta de las 23 rutas contra un servidor corriendo (sin claves alcanza), incluido que otro usuario reciba 404 en cada ruta de una sesión ajena y que cerrar sesión corte el acceso. 52 de 52. Tests de la reconexión automática de la voz (corte, `goAway`, avisos viejos, tope de 3).
  - **Falta desplegar Convex** para la limpieza con presupuesto, desde `main` después de integrar esta rama.
- Validación: prueba de punta a punta por HTTP (24 de 24) y `probar-personaje.mjs` (6 de 6), antes de integrar. Después de integrar: tests, lint, tipos y build pasan.
- Consentimiento de punta a punta: examinar por voz y pedir permiso después sigue siendo error crítico; con permiso antes, no (la regla del extractor de la Persona 2 y la fila de la voz encajan).

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
