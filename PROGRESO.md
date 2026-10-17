# Paciente 0 — Progreso

Registro de avances. Lo más nuevo arriba. Cada entrada dice quién, qué se hizo, cómo se validó y qué quedó pendiente. Las tareas están en [`TODO.md`](TODO.md).

## 17/10 · Persona 1 · Dos pacientes con tres problemas cada uno, y todos los exámenes en cualquier caso

- **Banco:** quedan Lucía (garganta) y Diego (oído). Se elige el paciente y después el problema (o «Al azar»). Los problemas se llaman «Problema 1, 2, 3» para no decir el diagnóstico (AGENTS.md: el diagnóstico vive en el servidor).
  - Lucía: faringoamigdalitis (`garganta-01`), faringitis viral (`garganta-02`, lo clínico del caso de Jorge) y mononucleosis (`garganta-03`: cansancio, ganglios y manchas en la piel después de amoxicilina).
  - Diego: otitis externa (`oido-01`), otitis media aguda después de un resfrío (`oido-02`, tímpano abombado) y dolor que viene de la mandíbula (`oido-03`, oídos normales: la otoscopia sirve para descartar).
  - Se sacaron Rosa y Jorge del banco. `hipertension-01.json` queda para el generador de pacientes de presión.
- **Todos los exámenes en cualquier caso:** garganta, oído y presión. Diego ahora tiene garganta (normal o con leve eritema). Lo que no tiene que ver con el problema (`relevantExams` del caso) resta 1 punto de examen por tipo, con su tarjeta en el informe («Mediste la presión, que no tenía que ver con el problema del paciente»). Los casos generados no restan.
- Esquema del caso: `group`, `problem` y `relevantExams`. La pantalla de casos agrupa por paciente.
- Si el estudiante le tira de la oreja, el paciente se queja solo si en su historia le duele (antes lo decía siempre).
- **Para la Persona 2:** los tests de técnica de presión y otoscopio usan a Lucía con todos los exámenes indicados, para que el punto nuevo no les cambie la cuenta.
- **Para la Persona 3:** los seis problemas son borrador y hay que revisarlos con un médico.
- Validación: 158 tests en web; lint, tipos y build pasan.
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
  - Revisión de cada `await` del cliente (voz, pantallas, tensiómetro y otoscopio) por si puede quedar colgado: tope de 15 s para que Google abra la conexión (antes la pantalla podía quedar "conectando" para siempre); `resume()` del audio en el mismo clic y con espera máxima de 1 s (en Safari quedaba pendiente fuera del gesto); un 200 con el cuerpo cortado ahora es un error (antes llegaba `{}` como respuesta y la pantalla se rompía con un turno vacío). Los demás `await` ya tenían tope o esperan una acción del usuario que se puede cancelar. El perfil que inventa la IA en el generador quedó acotado (6 datos cortos).
  - Servidor: los pedidos a Convex (10 s) y la creación del token de Gemini (6 s) tienen tope; antes una caída de Convex o de Google dejaba la ruta esperando hasta que Vercel la cortara. El resto de las llamadas externas ya lo tenían (texto de Gemini 10 s, OpenAI 20 s, OAuth de Google 10 s).
  - Lista de tipos de bug revisados en todo lo de la Persona 1 (`server/`, `app/api/`, `lib/patient/`, `lib/voice/`, `proxy.ts`, `convex/`):
    - Acceso: cada ruta de sesión exige ser el dueño (o docente, solo para leer); otro usuario recibe 404 en las 13 rutas (`scripts/probar-api.mjs`). Revisado.
    - Datos que no tienen que salir del servidor: diagnóstico, historia oculta y lo inventado no llegan al navegador ni al modelo. Revisado, con tests.
    - Entradas: tamaño del cuerpo, esquemas tolerantes en las herramientas, límites de largo y cantidad, perfil del generador. Revisado.
    - Esperas sin tope: cada `await` del navegador y cada llamada externa del servidor tiene tope o espera una acción cancelable del usuario. Revisado.
    - Orden y carreras: fila de escrituras, cancelación por intento, mensajes y conexiones viejas, respuesta de herramientas a su conexión. Revisado, con tests.
    - Promesas sin manejar: ninguna suelta en el servidor; en el cliente, todas atrapadas (red de seguridad en la reconexión). Revisado.
    - Estados a medias: cierre de la consulta, tiempo de margen para terminar exámenes, limpieza de Convex con presupuesto. Revisado, con tests.
    - Respuestas malformadas: un 200 con el cuerpo cortado es error; JSON de la IA entre ``` o inválido cae al plan B. Revisado.
    - Navegadores: Safari (audio en el gesto), Firefox (frecuencias), socket cerrado. Revisado con el navegador simulado; el micrófono real ya se probó en la computadora (17/10), **falta el celular**.
  - Tercera integración con `main` (clasificador de turnos, voces al azar, tres casos nuevos): la nota de estado del clasificador va dentro de la fila y con envío protegido. Bug en la regla de pregunta sugestiva, que estaba en el clasificador y en el evaluador: "¿todo bueno?" y "¿fumás o no?" contaban como sugestivas (bajaban la confianza y restaban un punto). Ahora hay una sola función, `isLeadingQuestion`, que usan los dos (cambio de una línea en `lib/scoring/evaluate.ts`, de la Persona 2).
  - Pregunta repetida: si el paciente pidió que le repitan ("¿cómo? no le escuché", como hace el paciente mayor), repetir la pregunta ya no cuenta como repetida, ni en el clasificador (bajaba la paciencia) ni en el evaluador (restaba un punto con "Repetiste una pregunta ya respondida"). Una sola función, `askedToRepeat`, que usan los dos (cambio chico en `lib/scoring/evaluate.ts`, de la Persona 2).
  - Cuarta integración con `main` (voz durante el examen): `sendNote` (nota silenciosa al cerrar un examen) quedó protegida como los demás envíos al socket; ningún envío del hook queda sin proteger. La consulta de solo lectura del docente sigue sin controles.
  - Consentimiento: "hola, con permiso" (saludo al entrar) contaba como permiso para examinar, y el paciente hostil después abría la boca sin que se lo pidieran. Ahora "permiso" vale solo pedido o nombrado ("me das permiso", "con tu permiso", "permiso para…") o junto con un pedido de examen.
  - Batería de 33 frases de entrevista contra todos los detectores (pedido de examen, apertura, permiso, sugestiva, clasificador): "¿querés que te revise?" y "me dejás revisarte" (sin signos, como transcribe la voz) no contaban como permiso; "¿abriste la ventana?" contaba como pedido de examen; "¿hay algo más que te preocupe?" no contaba como pregunta abierta. Arreglados, con test. El resto dio bien.
  - Quinta integración con `main` (plan B por texto, `openSession`): cada envío al socket combina `openSession` (no manda a un socket que se cierra) y `safeSend` (atrapa si igual falla); la nota de los eventos va en la fila. Plan B por texto: el reloj "quedan X min" estaba congelado (solo lo movía la voz) y al vencer los 8 minutos cada mensaje daba 409 sin pasar a la hipótesis. Ahora hay reloj local y, al llegar a cero o con un 409, se pasa a la hipótesis. El modo texto se oculta en la vista de solo lectura del docente.
  - Revisión independiente (un agente que no había visto el código) de todo lo de la Persona 1. Arreglado:
    - El id de los casos generados llevaba el nombre de la plantilla, que es el diagnóstico (`gen-faringitis-viral-…`), y llegaba al navegador. Ahora es neutro; la plantilla va en `templateId`, solo en el servidor (el otoscopio la usa).
    - Convex solo acepta claves ASCII: si la IA inventaba "año de nacimiento" en `anotar_dato` o "con quién vive" en el perfil del generador, fallaba solo en producción. Las claves pasan por `asciiKey`.
    - El "silencio largo" se disparaba mientras el estudiante examinaba callado y hacía hablar al paciente en medio de la toma de presión. Con un examen abierto ya no cuenta.
    - `AbortSignal.timeout` no existe en Safari 15 (iOS 15): ningún pedido funcionaba. Reemplazo en `lib/timeout-signal.ts`.
    - Cortar la voz mientras cargaba el procesador de audio la dejaba en "En línea" sin conexión.
    - Si fallaba sumar los errores al perfil después de guardar el informe, no se sumaban nunca; ahora el reintento lo completa (una sola vez).
    - El permiso por voz para el oído no subía la confianza como el de la garganta.
    - Llamadas a herramientas canceladas por Gemini (el estudiante interrumpió) se ejecutaban igual.
    - En Safari el audio puede quedar "interrupted" (no solo "suspended") al volver de segundo plano.
  - Sexta integración con `main`, que trajo cambios atómicos de sesión (`records.changeSession`): resuelven lo que había quedado pendiente (escrituras que se pisaban entre pestañas y el tope de conexiones de voz en paralelo). Se combinó con lo de esta rama:
    - Cierre de la consulta: el de `main` marcaba "evaluada" antes de evaluar; si el evaluador con IA fallaba, cada reintento daba "ya se está cerrando" para siempre. Ahora reclama el cierre de forma atómica pasando a "finalizada", vuelve a "activa" si la evaluación falla, y queda "evaluada" recién con el informe guardado y los errores sumados una vez. Un cierre cortado por Vercel se retoma pasados 2 minutos.
    - Pregunta sugestiva: la regla de `main` arreglaba "hermano" pero seguía contando "¿fumás o no?"; quedó `isLeadingQuestion`.
    - `anotar_dato`: escritura atómica de `main` más la clave en ASCII y la protección del perfil y lo sorteado.
    - Pedido de examen: patrones de `main` ("nombrar la garganta no abre el examen") más el subjuntivo ("¿querés que te revise?").
    - Token de voz: se mantiene el mínimo de 60 s (con el de `main`, cerca del final podía vencer antes que el plazo para abrir la sesión).
    - Cliente de voz: sobre los arreglos de `main` (guardar al cortar, sin silencio en el examen, avatar) se mantienen la fila, la cancelación por intento, las herramientas canceladas y los envíos protegidos.
  - Segunda revisión independiente, sobre el código integrado. Arreglado:
    - Si la estudiante cortaba la voz mientras se reconectaba, se volvía a conectar sola: gastaba un token y el paciente quedaba "en vivo" sin micrófono (y a los 20 s hablaba solo).
    - Errores del informe contados dos veces (dos cierres o reintentos a la vez) o nunca (si fallaba el último paso, la sesión quedaba "finalizada"). Ahora el paso finalizada → evaluada es atómico y solo quien lo gana suma los errores; leer el informe completa un cierre pendiente.
    - Doble clic en "Acepto" abría dos conexiones; el reloj mostraba el valor viejo de la voz mientras reconectaba; el reloj del docente quedaba congelado; el 409 del cierre decía "unos segundos" cuando hay que esperar 2 minutos.
    - Palabras clave: "no entiendo" y "¿dormís tranquilo?" contaban como empatía; "¿por qué no?" como sugestiva; "¿podés abrir la ventana?" como examen; faltaba "esta bien si" sin tilde.
  - Pedidos simultáneos a la misma consulta (dos pestañas o un script): `changeSession` acepta `ifEquals`, que aplica el cambio solo si el campo sigue valiendo lo esperado. El consentimiento se da una sola vez y hay un solo cambio de ánimo del modelo por turno, con el valor actual. La nota de ánimo del clasificador compara con el estado nuevo. Un Convex sin desplegar ignora `ifEquals` (el cambio llega como `v.any()`), así que el orden de despliegue no importa; con `npx convex deploy` queda activo en producción.
  - Séptima integración con `main` (límite por IP; se descarta la prueba en celular): en `/api/sessions` el cupo por IP se contaba antes de validar el caso y el tope diario del usuario, así que pedidos que iban a fallar gastaban el cupo compartido de todo el salón (100 por hora con la IP de la facultad). Ahora se cuenta justo antes de crear la sesión.
  - Revisión exhaustiva archivo por archivo, con tres revisores independientes que leyeron entero cada archivo de la Persona 1:

    | Parte | Archivos | Sin problemas | Con hallazgos |
    |---|---|---|---|
    | `server/` y `app/api/` | 38 | 30 | 8 |
    | `lib/patient/`, `lib/voice/`, cliente, `proxy.ts`, consulta | 16 | 9 | 7 |
    | `packages/backend/convex/` y contratos | 17 | 11 | 6 |

    Arreglado:
    - Servidor: las cuentas de Google quedaban sin poder generar pacientes para siempre (el tope de 15 ahora es por día, con `createdAt`); el generador tiene límite por IP; `saveExamTimes` exige consulta activa y no toca otoscopias (podía dejarlas sin evaluar); si Google no da el token se devuelve la conexión reservada; un cierre con informe y estado "activa" se completa; los tokens de uso solo se suman con la consulta activa; el otoscopio tiene el mismo margen que la voz.
    - Cliente de voz: las notas internas cortaban al paciente mientras hablaba (y eso contaba como interrupción del estudiante): ahora esperan a que termine; la transcripción tardía partía el turno del estudiante en dos; en Safari el micrófono se reanuda y, si se corta, se avisa; el procesador del micrófono va a una salida en silencio (Safari puede no correrlo sin salida); "Reconectando" no se pisa con "En línea".
    - Pantalla: sin voz conectada, a los 8 minutos pasa a la hipótesis (antes solo en modo texto).
    - Paciente simulado: "¿qué?", "¿eh?", "¿perdón?" cuentan como pedido de repetir; negaciones en el generador ("poco colaborador", "que no hable mucho"); "una abuela ansiosa" sale mayor y ansiosa; "hace cuánto que tenés fiebre" ya no es pedir el diagnóstico; "¿algún médico llegó a revisarte?" no abre el examen; "permiso para faltar" y "con tu permiso" al saludar no dan consentimiento, "me permitís" y "le parece si" sí; empatía solo fuera de preguntas; "¿de verdad?" no es sugestiva; preguntas sin "?" (voz) cuentan como preguntas; "humedad" no responde la edad y "¿tomás mate?" no es alcohol.
    - Convex: Convex Auth quedaba abierto (cualquiera podía crear usuarios anónimos sin límite): sin proveedores; los registros anteriores al campo `guest` se completan solos y se borran a tiempo; una ventana nueva del límite por IP es un documento nuevo (la limpieza la cortaba a mitad de hora).

    **No arreglado, a propósito:**
    - Con pedidos simultáneos de un mismo usuario, el tope diario de consultas, el perfil de errores entre dos consultas distintas y los cambios de manguito u otoscopia leen antes de escribir. El límite por IP (atómico) y la fila del cliente lo acotan; arreglarlo del todo pide mutaciones nuevas en Convex.
    - La otoscopia muestra sus errores de técnica antes del informe: es una decisión de la Persona 2.
    - El procesador del micrófono en Safari y si `expireTime` corta una voz ya abierta solo se pueden confirmar en un dispositivo o con Google.
  - **Falta desplegar Convex** para la limpieza con presupuesto, desde `main` después de integrar esta rama.
- Validación: prueba de punta a punta por HTTP (24 de 24) y `probar-personaje.mjs` (6 de 6), antes de integrar. Después de integrar: tests, lint, tipos y build pasan.
- Consentimiento de punta a punta: examinar por voz y pedir permiso después sigue siendo error crítico; con permiso antes, no (la regla del extractor de la Persona 2 y la fila de la voz encajan).

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
