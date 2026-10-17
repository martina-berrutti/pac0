# Paciente 0 — Progreso

Registro de avances. Lo más nuevo arriba. Cada entrada dice quién, qué se hizo, cómo se validó y qué quedó pendiente. Las tareas están en [`TODO.md`](TODO.md).

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
