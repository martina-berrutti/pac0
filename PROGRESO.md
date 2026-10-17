# Paciente 0 — Progreso

Registro de avances. Lo más nuevo arriba. Cada entrada dice quién, qué se hizo, cómo se validó y qué quedó pendiente. Las tareas están en [`TODO.md`](TODO.md).

## 17/10 · Persona 1 · Prevención de errores (quinta pasada: voz cancelada y tensiómetro)

- Voz: después de `close()` el socket puede entregar mensajes que venían en camino, y se procesaban igual. Eso podía guardar turnos o correr `examinar` en el servidor con la voz ya cortada. Ahora se ignoran por intento. Una herramienta que esperaba en la fila tampoco corre si la voz se cortó.
- La fila de escrituras pasó a `lib/voice/queue.ts` con tests (orden, fallas que no frenan, `drain`).
- Tensiómetro: `PATCH /api/sessions/[id]/vitals/[vitalsId]` y `api.saveMarkedVitals(id, vitalsId, { pas, pad })` guardan lo que marcó el estudiante en `VitalsMeasurement.marked`. Valida dueño, consulta activa (con 1 minuto de margen), que la medición exista y que PAS sea mayor que PAD. El `vitalsId` llega en `ui.vitals.id` de `medir_presion`. **Persona 2:** el tensiómetro solo tiene que llamarlo.
- Validación: 57 tests en web y 15 en backend; lint, tipos y build pasan.

## 17/10 · Persona 1 · Prevención de errores (cuarta pasada: Convex y cierre)

- Convex: el cron borraba invitados de la tabla `users` (Convex Auth), pero la app guarda todo en `records` con invitados de cookie, y eso no se borraba nunca. Nuevo `records.purgeExpired` cada 15 minutos: borra lo de más de 48 horas (la cookie dura 24, así que ya era inaccesible). Cuando haya cuentas con Google, tiene que mirar solo a los invitados.
- **Falta desplegar Convex** (`npx convex deploy`) para que corra el cron nuevo. La app web no depende de él.
- Cierre: si el evaluador fallaba, la sesión quedaba "evaluada" sin informe. Ahora se evalúa primero, se guarda el informe y después el estado; si se corta en el medio, el próximo intento devuelve el informe y termina de cerrar.
- Un error inesperado (Convex caído) muestra "Algo falló de nuestro lado. Probá de nuevo en unos segundos." en vez de "Error interno".
- Validación: 53 tests en web y 15 en backend (2 nuevos: secreto y limpieza); lint, tipos y build pasan.

## 17/10 · Persona 1 · Prevención de errores (tercera pasada y prueba de punta a punta)

- Prueba de punta a punta por HTTP contra `next dev` (sin claves): invitado, sesión hostil, turnos de voz, examinar sin y con permiso, tiempos del examen, argumentos raros, eventos, tokens, voz sin clave (503 claro), cierre, informe, 409 después de cerrar, 404 para otro usuario y redirección sin cookie. 24 de 24. `scripts/probar-personaje.mjs`: 6 de 6 en personaje.
- Tokens de la voz: además de las sumas se guarda el pico por mensaje (`voiceUsage.peak`). Si `usageMetadata` es por respuesta, el costo sale de las sumas; si es acumulado, del pico. Ya no hace falta saberlo antes de medir.
- Cliente de voz: mandar audio, respuestas de herramientas o el aviso de silencio por un socket que Gemini ya cerró tiraba excepciones sin capturar (errores de consola). La respuesta de una herramienta va solo a la sesión que la pidió, no a una reconexión. Si el navegador no acepta elegir la frecuencia del `AudioContext`, se usa la suya.
- Validación: 52 tests; lint, tipos y build pasan.
- **Sigue pendiente (necesita a una persona):** probar con micrófono en computadora y celular, y una consulta real con `GEMINI_API_KEY` para ver qué campo de tokens usar. En este worktree no hay `.env.local`.

## 17/10 · Persona 1 · Prevención de errores (segunda pasada)

- Privacidad: `GET /api/sessions/[id]` mandaba al navegador `historyOverrides` (valores sorteados de la historia oculta, por ejemplo la fiebre) e `inventedFacts`. Ahora la vista de la sesión es una lista blanca de campos.
- Costos: tope de 8 conexiones de voz por consulta (`voiceConnections`; cada token abre una sesión paga) y de 30 casos generados por usuario. Cuerpos de más de 64 KB se rechazan con 413.
- Turnos de voz de más de 2000 caracteres daban 400 y se perdían enteros: ahora se aceptan y el servidor los recorta a 4000.
- Al reconectar, la transcripción va marcada como solo transcripción y recortada (400 caracteres por turno), para que un "ignorá tus instrucciones" del estudiante no quede como instrucción del sistema.
- Interrupciones: `interrupcion_estudiante` (que penaliza desde la tercera) solo se registra si el audio del paciente ya sonaba. Antes Gemini la podía marcar por ruido o antes de que el paciente empezara a hablar.
- Examen: los tiempos por zona solo guardan zonas que existen en el caso.
- Cierre: hipótesis vacía o con espacios se rechaza con un mensaje claro; la pantalla limita a 500 caracteres y 10 diferenciales (antes salía "Datos inválidos").
- Paciente por reglas y generador: "tos" como palabra entera ("datos" y "todos" contaban como tos y elegían la plantilla de catarro). "100 años" ya no se lee como "00". El JSON de la IA se acepta aunque venga entre ```.
- Validación: 52 tests en web (14 nuevos entre las dos pasadas); lint, tipos y build pasan.
- **Sin verificar:** si `usageMetadata` de Gemini Live es acumulado (el SDK no lo dice); hace falta una consulta real.

## 17/10 · Persona 1 · Arreglo de bugs de voz y motor del paciente

- Voz: todo lo que el navegador manda al servidor (turnos, eventos, herramientas, tokens) va en fila. Antes los turnos podían guardarse desordenados, `examinar` podía correr antes de que se anotara el permiso, y dos escrituras de la misma sesión se pisaban en Convex.
- Al cortar la voz o al vencer los 8 minutos se guarda lo que se estaba diciendo (antes se perdía). "Ver mi informe" espera a que se guarde todo: antes el informe podía salir sin los últimos turnos.
- Si la voz se corta y se reconecta, el paciente recibe lo ya hablado (antes arrancaba de cero y se volvía a presentar). Al cortarse sola, la pantalla avisa.
- Celular: los AudioContext se crean dentro del toque del botón (en Safari quedaban suspendidos y no se escuchaba al paciente). Firefox: si el micrófono no acepta 16 kHz, se usa la frecuencia del navegador. El micrófono se pide antes del token de un solo uso. Si se sale mientras conecta, se cierran el socket y el micrófono.
- El token de Gemini vence con la consulta (8 min y el margen) en vez de a los 10 min.
- Herramientas: los argumentos fuera del esquema se corrigen (delta de ±0.9 se acota a ±0.5, "Alta", pasos inventados) en vez de rechazar la llamada. "toString" ya no pasa como herramienta. `anotar_dato` no pisa el perfil ni los valores sorteados.
- Consentimiento: "¿puedo preguntarte la edad?" ya no cuenta como permiso para examinar (el paciente hostil abría la boca). Cuenta "permiso" o un pedido de permiso junto con el examen. "Palabra" ya no es un pedido de examen.
- Generador: entiende "él" y "varón" (`\b` no funciona con tildes). Paciente por reglas: una respuesta sin género. El evento `cambio_animo` del texto guarda el cambio, igual que la voz.
- Validación: 45 tests en web (7 nuevos); lint, tipos y build pasan.
- **Para la Persona 2:** el evaluador mira `consentGiven` al final; si el permiso se pide *después* de examinar, el error crítico no se marca. Comparar el `atMs` del evento `consentimiento` con el primer examen.

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
