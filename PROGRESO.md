# Paciente 0 — Progreso

Registro de avances. Lo más nuevo arriba. Cada entrada dice quién, qué se hizo, cómo se validó y qué quedó pendiente. Las tareas están en [`TODO.md`](TODO.md).

## 17/10 · Persona 2 · Evaluador completo, abatelenguas y listo para las fotos

- **Puntaje:** penalizaciones nuevas (jerga sin explicar, ignorar una pista emocional, saltar al diagnóstico), errores críticos nuevos (insistir contra la negativa, omitir una señal de alarma, trato irrespetuoso) y +5 de comunicación por ganar la confianza de un paciente difícil. Todo lo calcula el código, también con el juez con IA.
- **Informe:** cada error nombra su fuente (`source`: lista de cotejo o afiche, sin copiar su texto). Avisos sin puntaje en `notices` (por ejemplo, revisar el oído en un caso de garganta). Los dos campos son opcionales; la Persona 3 tiene que mostrarlos.
- **Describir lo que vio:** se compara con el hallazgo esperado de la garganta o del oído; parcial si miró sin describir; «no veo placas» ya no cuenta como describirlas.
- **Examen:** abatelenguas (tecla A o botón) en la orofaringe. En la otoscopia, con un oído afectado resta examinar uno solo (2) o empezar por el enfermo (1). Registro de fotos de garganta y de oído con sus zonas; un test exige que cada foto esté en `CREDITS.md`. En desarrollo, la tecla Z muestra las zonas para ubicarlas.
- **Evaluador con IA real (Gemini):** bueno 97, mediocre 46, malo 5; tres corridas iguales (46); cero omisiones inventadas. La cuota gratuita es de 15 pedidos por minuto: el test espacia los pedidos. Por eso mismo, en producción el evaluador puede caer al juez por reglas si se cierran varias consultas juntas (lo que vio la Persona 1): conviene una clave con facturación para la demo.
- **Sin docente:** la planilla de calibración (documento aparte) tiene propuestas con fuentes públicas para el tensiómetro (AHA 2019, Handler 2009), los signos de alarma y el otoscopio; el resto son decisiones del equipo. Falta verificarla y pasar los valores al código. El contraste con estudiantes se reduce a una estudiante y 2 casos (guía de prueba aparte).
- **Pendiente:** fotos de la Persona 3, ítems de signos de alarma en garganta y oído, verificar la planilla y la prueba con la estudiante. Lo de comparar la hipótesis en código antes de confiar en la IA (`ai-judge.ts`) queda para después.
- Validación: 185 tests en web y 20 en backend; lint, tipos y build pasan.

## 17/10 · Persona 1 · Límite por IP para invitados y consultas

- **Qué cuida:** sin límite, alguien podía crear invitados sin fin y saltear el tope de 10 consultas por usuario, gastando el tope diario de todos (y los créditos de la voz). Ahora `POST /api/auth/guest` y `POST /api/sessions` pasan por `server/rate-limit.ts`.
- **Topes:** 50 invitados y 100 consultas por hora desde una misma IP. Son altos porque un salón entero sale por la misma IP de la facultad. Se pueden cambiar con `MAX_GUESTS_PER_IP_PER_HOUR` y `MAX_SESSIONS_PER_IP_PER_HOUR` (hay que declararlas en `apps/web/.env.schema`). Al pasarse, responde 429 con un mensaje en castellano.
- **Privacidad:** la IP no se guarda; se guarda un hash con `SESSION_SECRET`. Los contadores se borran con los invitados, a las 24 horas.
- **Convex:** mutación `records.hitRate` (cuenta y decide en una transacción, así dos pedidos a la vez no se pisan). Ya está en producción (`npx convex deploy`). Si la función faltara, deja pasar y siguen los topes por usuario y por día.
- `/api/health` muestra los topes por IP solo a docentes.
- Validación: 149 tests en web (4 nuevos) y 20 en backend (1 nuevo); lint y tipos pasan.

## 17/10 · Persona 1 · Chequeo de la Puerta 2, personaje en los cuatro casos y tests por caso

- **Chequeo de la Puerta 2:** `node apps/web/scripts/probar-consulta.mjs [url]` recorre una consulta completa contra la URL pública (Convex, token de voz, entrevista, examen con permiso, cierre e informe) y verifica puntaje, cuatro dimensiones, veredicto, diagnóstico, que cada ítem cumplido cite un turno o examen real y que otro usuario no vea el informe. En producción: todo en verde, 90%, «Lo hiciste bien». Sirve como chequeo de dos minutos antes de la demo.
- **Error encontrado con el chequeo:** por texto, «¿Desde cuándo te duele la garganta?» se tomaba como pedido de examen: se registraba un examen sin permiso y el informe marcaba un error crítico falso. Ahora hace falta una acción (abrí, decí aaa, te reviso, linterna); «te revisó» o «al abrir la boca» no cuentan. Con test.
- **Personaje en los cuatro casos:** `scripts/probar-personaje.mjs` prueba a Lucía, Rosa, Diego y Jorge, cada uno con sus palabras prohibidas. En producción: 24 de 24 sin fugas; 2 ecos («¿de qué bata blanca me habla?»), que no cuentan.
- **Tests por caso** (`tests/casos-completos.test.ts`): Lucía con orofaringe, Rosa con presión alta sin preparar y real bien preparada, Diego con otoscopio pedido por voz y Jorge que se niega sin permiso y abre al explicarle. El permiso para el oído ahora sube la confianza como en la garganta.
- **Para la Persona 2:** en producción el informe sale con el juez por reglas aunque hay clave de Gemini; el evaluador con IA falla y usa el respaldo. Ver «Evaluador con IA falló» en los logs de Vercel.
- Validación: 145 tests en web y 19 en backend; lint, tipos y build pasan.

## 17/10 · Persona 1 · Revisión de código y arreglos

Dos revisores independientes (errores; privacidad y seguridad) leyeron el código de la Persona 1. Se arreglaron todos los hallazgos que podían afectar la demo:

- **Cambios que se pisaban** (alta): con pedidos simultáneos (turno + herramienta + uso) se perdían ánimo, consentimiento, datos inventados y tokens; con Jorge podía "olvidar" que se le pidió permiso. Ahora cada pedido manda su cambio y Convex lo aplica en una transacción (`records.changeSession`, `lib/contracts/session-change.ts`). `updateSession` también es atómica.
- **Historia oculta en el navegador** (media): `GET /api/sessions/[id]` mandaba los valores sorteados de la historia, los datos inventados y la personalidad. Ahora va una lista explícita de campos (`toPublicSession`).
- **Gasto sin límite** (alta): el tope de conexiones de voz se reserva antes de pedir el token (no se saltea con pedidos en paralelo) y el token dura lo que le queda a la consulta; topes de turnos y eventos por consulta, de contexto para la IA y de pacientes generados por usuario.
- **Trampas desde la API** (media): `actualizar_estado` acepta un cambio por turno del estudiante y de a ±0,3.
- **Cierre doble** (baja): cerrar dos veces a la vez ya no evalúa dos veces ni suma los errores doble.
- **Voz:** al cortar se guarda lo último que se dijo; examinando, el silencio no cuenta ni hace hablar al paciente; la respuesta de una herramienta no va a una conexión nueva tras reconectar; cancelar mientras conecta no muestra error.
- **Preguntas sugestivas:** "¿tenés algún hermano?" ya no cuenta como sugestiva (también en el evaluador de la Persona 2).
- `/api/health` público muestra lo mínimo; el detalle, solo a docentes. Las cuentas de Google duran 7 días.
- **Pendiente:** límite por IP para crear invitados y sesiones; que el evaluador compare la hipótesis en código antes de confiar en la IA (Persona 2, `ai-judge.ts`).
- Validación: 120 tests en web y 19 en backend; Convex de producción actualizado antes de la web.

## 17/10 · Persona 1 · Plan B por texto, personaje en producción e interrupciones

- **Plan B por texto:** si la voz no arranca o se cae (micrófono bloqueado, sin conexión, Gemini caído), aparece «Seguir por texto» y la consulta sigue escribiendo con el mismo paciente. Pedir examinar abre el examen igual que por voz. Probado en Chrome a 390 px: Lucía contesta y «abrí bien grande y decí aaa» abre la orofaringe.
- **Personaje en producción:** `scripts/probar-personaje.mjs` contra https://pac0-l3xi.vercel.app (con Convex y el paciente con IA): 6 de 6 en personaje. Ante «¿Qué enfermedad tenés?»: «Y... para eso vine, doc, no tengo idea qué es lo que tengo».
- **Interrupciones en el momento:** al registrar `interrupcion_estudiante`, el servidor devuelve una nota y el navegador se la pasa al paciente como contexto, sin pedirle que hable (como el clasificador). La primera vez lo deja hablar; desde la segunda, o con poca paciencia, muestra fastidio. Test incluido.
- **Consola limpia al reconectar:** el audio y las notas solo se mandan si el WebSocket sigue abierto.
- Validación: 110 tests en web y 18 en backend; lint, tipos y build pasan.
- **Falta:** probar con una persona que el paciente reacciona a las interrupciones.

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
