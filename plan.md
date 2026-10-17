# Paciente 0 — Plan completo y reparto del equipo

17 oct 2026 · @Rosario

> Transcripción en Markdown del PDF "Paciente 0 — Plan completo y reparto del equipo", para que cualquier sesión (persona o agente) lo pueda leer desde el repo.

---

## 1. Visión y alcance

Paciente 0 es una app web donde un estudiante de medicina entrevista por voz a un paciente simulado con IA, lo examina con herramientas virtuales y recibe un puntaje con feedback antes de ver pacientes reales.

**Para quién.** Estudiantes de 2º y 3º que todavía no vieron pacientes (les da confianza), estudiantes de 4º en adelante que repasan o se preparan para exámenes prácticos, y docentes que quieran ver el desempeño (opcional).

**Cómo lo usa una persona:**

1. Entra con su cuenta o como invitado, con un alias.
2. Elige un caso y un tipo de paciente.
3. Entrevista al paciente por voz: se presenta, pregunta, escucha. Puede interrumpir y ser interrumpido.
4. Examina: pide abrir la boca y usa la linterna, mide la presión, y más adelante usa el otoscopio u otras regiones.
5. Plantea su hipótesis y sus diferenciales.
6. Recibe el informe: puntaje por dimensión, errores con la cita exacta de la conversación y qué practicar. Con 85% o más y sin errores críticos, el mensaje es "Lo hiciste bien".

**Alcance por prioridad.** Es mucho para 48 horas y 3 personas. Si algo se retrasa, se corta de abajo hacia arriba.

| Nivel | Qué incluye |
|---|---|
| 1. Imprescindible (sin esto no hay demo) | Login simple o invitado; un caso (dolor de garganta) con paciente por voz en rioplatense; examen de orofaringe con linterna y variantes de apertura de boca; informe con puntaje, umbral de 85% y citas por turno; URL pública |
| 2. Importante (lo que nos hace distintos) | Personalidades (directo, ansioso, hostil) que reaccionan al trato; interrupciones en ambos sentidos; tensiómetro virtual con técnica; feedback por errores con repaso sugerido; banco de imágenes con 3 patologías y una normal |
| 3. Si sobra tiempo | Avatar con labios sincronizados; otoscopio; otras regiones del cuerpo (rodilla); segundo y tercer caso; historial para docentes; consulta a la bibliografía de la facultad (RAG) |
| 4. Fuera de alcance | Datos de pacientes reales; uso clínico real; app nativa; paciente en 3D |

El repo es [martina-berrutti/pac0](https://github.com/martina-berrutti/pac0).

## 2. Reglas legales y de datos

Paciente 0 no usa datos de pacientes reales ni accede a sistemas de instituciones de salud. Eso se escribe en `AGENTS.md` y se hace cumplir con permisos del agente, no solo con texto.

| Regla | Cómo se cumple |
|---|---|
| Sin datos de pacientes reales | Todos los casos son sintéticos o escritos por el equipo, y los revisa un estudiante avanzado o un médico |
| Sin acceso a sistemas de salud (CASMU, ASSE, historia clínica electrónica) | Nadie le da credenciales ni conexiones al agente; `AGENTS.md` lo prohíbe; solo se instalan los 2 o 3 MCP acordados |
| Datos mínimos del estudiante | Alias, año de carrera y rol; sin cédula, nombre real ni teléfono |
| Voz | Se guarda la transcripción, no el audio; aviso de consentimiento antes de la primera consulta; pedir que no digan datos personales reales |
| Imágenes clínicas | Solo con licencia registrada en `assets` y `CREDITS.md`; ninguna generada con IA; validadas por un médico |
| Material de la facultad (afiches del Centro de Simulación, PDFs de semiología, capítulo de Bates) | Sirve de referencia para escribir rúbricas y casos con palabras propias; no se copian textos ni imágenes al producto sin permiso escrito. Bates es un libro con derechos de autor |
| Claves de API | Solo en variables de entorno; `.env` bloqueado para los agentes |
| Diagnóstico del caso | Vive solo en el servidor; el agente de voz no lo recibe |
| Uso educativo | Leyenda visible: herramienta de práctica, no reemplaza a pacientes reales ni a docentes |

A confirmar con la facultad: si la ley uruguaya de protección de datos personales (18.331) exige consentimiento o registro por guardar alias y año de carrera, y por cuánto tiempo se guardan las transcripciones.

**Para copiar al repo.** `AGENTS.md` en la raíz (lo leen Claude Code y Kiro) y `.claude/settings.json` para que se cumpla con permisos:

```json
{
  "permissions": {
    "deny": ["Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)"]
  }
}
```

## 3. Por qué la IA es indispensable y qué nos distingue a 5 años

Sin IA, Paciente 0 pierde su función central: conversar libremente como un paciente coherente con el caso y evaluar una entrevista abierta con evidencia. Lo que lo mantiene vivo a 5 años no es el chat, sino todo lo que lo rodea.

### El test de la consigna

La consigna pregunta: si le sacás la IA, ¿sigue cumpliendo su función principal?

| Función | Con IA | Sin IA |
|---|---|---|
| Paciente | Responde cualquier pregunta en lenguaje natural, coherente con el caso y su personalidad | Menú de preguntas fijas: el estudiante elige en vez de preguntar |
| Voz | Interrupciones, dudas y tono según el ánimo | Audios grabados |
| Examen por instrucción hablada | Interpreta "abrí más, decí aaa" y decide qué se ve | Botón "abrir boca" |
| Evaluación | Lee la conversación libre y cita el turno donde falta o sobra algo | Casillas marcadas a mano |
| Feedback | Explica el error en el contexto de esta consulta y propone qué repetir | Texto genérico |

Tampoco cae en la regla 01 de "qué no califica" (chat genérico): tiene contexto propio (caso y estado oculto), acciones propias (herramientas de examen) y datos propios (rúbrica de la facultad).

### Qué ya existe

Hay que decirlo nosotros antes que el jurado.

| Sistema | Qué hace | Nuestro hueco |
|---|---|---|
| René Medici | Pacientes simulados por voz o texto; informe contra checklists (1691 criterios en siete dominios) con errores críticos; cita testimonios de estudiantes de la Udelar y vende a facultades | El examen físico no lo hace el estudiante: recibe los hallazgos escritos. No menciona avatar |
| MedSimAI, SOPHIE, Clinical Mind, CyberPatient | Pacientes simulados con feedback; SOPHIE con avatar; Clinical Mind por voz; CyberPatient con más de 130 casos (según nuestro plan, verificar cada uno) | Examen físico interactivo con registro de lo que se inspecciona, pacientes con personalidad que reaccionan al trato, rioplatense |
| PsyChat | Sistema de diálogo para apoyo en salud mental, código MIT; hace de consejero, no de paciente | Sirve solo como referencia de estructura de diálogo por roles; no es un competidor ni algo para copiar |

### A 5 años: dónde está el foso

Un modelo genérico va a poder "darte un paciente" cada vez mejor. Lo que un modelo genérico no trae:

1. **Contenido local validado**: casos y hallazgos revisados por docentes de la Udelar, con licencias claras.
2. **Rúbrica de la facultad**: las listas de cotejo reales del curso, para que Paciente 0 sea la práctica previa al examen, no una alternativa externa.
3. **Datos longitudinales**: perfil de errores de cada estudiante a lo largo de la carrera ("tu punto débil este mes son las alergias").
4. **Motor de simulación y herramientas de examen**: linterna, tensiómetro, otoscopio con hallazgos curados. Es trabajo de curaduría e interfaz, no un prompt.
5. **Canal institucional**: panel docente y licencias a facultades. René Medici ya llega a la Udelar, así que competimos por la relación con la facultad y el contenido local.

Honestamente, a 5 años el foso es contenido validado, relación con la facultad y datos de desempeño, más que tecnología. En el pitch se muestra la capa técnica (real y demostrable) y se nombra lo demás como el camino.

## 4. Arquitectura y stack

Una app web en Next.js que habla por voz con el paciente en tiempo real, guarda todo en Convex y genera el informe con un modelo de lenguaje. El estado del paciente y la evaluación viven en el servidor.

Cambio respecto del plan inicial: ahora hay login, con modo invitado para el jurado (sección 10).

Decisión del 17/10: para trabajar en paralelo sin cuentas ni claves, **Convex queda para el final**. Mientras tanto la API de Next.js (`apps/web/src/app/api/`) guarda todo en memoria detrás de la interfaz `Store` (`apps/web/src/server/store.ts`), y el invitado usa una cookie firmada. El esquema de Convex ya está escrito en `packages/backend/convex/`. El avance se sigue en `TODO.md` y `PROGRESO.md`.

**Todo pasa por Convex; la voz y el evaluador nunca hablan entre sí.**

```
                 ┌──────────────────────────────────┐
                 │   Navegador del estudiante       │
                 │ Next.js + shadcn/ui en Vercel    │
                 │ Consulta, avatar, examen, informe│
                 └──────────────────────────────────┘
          1 audio y          │ 2 casos y        │ ingreso
          herramientas       │   turnos         │
  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
  │ Voz del paciente │  │    Convex    │  │      Acceso      │
  │ OpenAI Realtime  │  │ Casos, ses., │  │ Convex Auth o    │
  │ (WebRTC). No     │  │ informes,    │  │ Clerk. Google e  │
  │ conoce el diag.  │  │ herramientas │  │ invitado         │
  └──────────────────┘  └──────────────┘  └──────────────────┘
               3 transcripción │   ▲ 4 informe en
                 y acciones    ▼   │   JSON validado
                        ┌──────────────────┐
                        │    Evaluador     │
                        │ Puntaje en código│
                        │ Juez LLM por API │
                        └──────────────────┘

Cómo se construye:  Orca (agentes en worktrees) → GitHub (push a main) → Vercel y Convex (URL pública en cada push)
```

Referencias: 1 audio y herramientas entre el navegador y la voz; 2 casos y turnos entre el navegador y Convex; 3 la transcripción y las acciones van al evaluador; 4 el informe vuelve a Convex.

| Capa | Elección | Por qué |
|---|---|---|
| Web | Next.js + shadcn/ui + Tailwind, creado con Better-T-Stack | Es la plantilla de la charla y los agentes la conocen |
| Backend y datos | Convex (tablas, funciones, archivos, búsqueda vectorial incluida) | Todo en un servicio, en tiempo real |
| Autenticación | Clerk o Convex Auth (sección 10) | Login con Google y modo invitado |
| Voz del paciente | OpenAI Realtime (gpt-realtime-2.1) por WebRTC; alternativa ElevenAgents | Voz en tiempo real, con herramientas e interrupciones |
| Evaluador | Modelo de lenguaje por API (Claude u OpenAI, según las claves), salida JSON validada con zod | Informe estructurado |
| Motor de puntaje | Código TypeScript determinista | El porcentaje y las penalizaciones no los inventa el modelo |
| Avatar | Retrato animado por audio; API de avatar si sobra tiempo | Sección 9 |
| Imágenes y audios clínicos | Convex storage + tabla `assets` | Licencia y atribución en cada archivo |
| Despliegue | Vercel + Convex Cloud | URL pública en cada push a `main` |
| Construcción | Orca + Claude Code + Kiro | Agentes en paralelo |

### Cómo viaja la información

1. El estudiante elige caso y personalidad; una función de Convex arma las instrucciones del paciente con historia, personalidad y estilo de habla, sin el diagnóstico.
2. El servidor pide una clave efímera a OpenAI y el navegador abre la sesión de voz por WebRTC. La clave real nunca sale del servidor.
3. El paciente conversa. Cuando el estudiante lo pide, llama a herramientas (`examinar`, `medir_presion`, `mostrar_region`, `actualizar_estado`, `terminar_consulta`) que ejecuta Convex y que devuelven el hallazgo del caso.
4. Cada turno, acción de examen y evento (interrupción, silencio) se guarda en Convex.
5. Al cerrar, el motor de puntaje y el evaluador leen todo y generan el informe (sección 8).
6. El informe se guarda, se muestra al estudiante y actualiza su perfil de errores.

### Datos en Convex

| Tabla | Qué guarda | Campos clave |
|---|---|---|
| `users` | Perfil | alias, año de carrera, rol (estudiante o docente) |
| `cases` | Caso clínico completo | título, paciente, historia oculta, hallazgos por zona con variantes, signos vitales verdaderos, lista de cotejo esperada con pesos, errores críticos, verdad (diagnóstico y diferenciales) |
| `sessions` | Un intento | usuario, caso, personalidad usada, inicio y fin, estado |
| `turns` | Cada intervención | sesión, quién habla, texto, inicio y fin en ms, si hubo solapamiento |
| `examActions` | Cada acción de examen | sesión, zona, maniobra, claridad de la instrucción, variante mostrada, tiempo sobre cada zona |
| `vitals` | Mediciones de presión | sesión, pasos de técnica cumplidos, valores marcados, error contra el valor verdadero |
| `events` | Eventos de conducta | sesión, tipo (interrupción del estudiante, interrupción del paciente, silencio largo, cambio de ánimo), marca de tiempo |
| `reports` | Informe final | sesión, puntaje por dimensión y total, veredicto, ítems con evidencia, errores, resumen |
| `assets` | Imágenes y audios | archivo, fuente, licencia, atribución, quién lo validó |
| `mistakeProfile` | Errores acumulados | usuario, etiqueta de error, cantidad, última vez |

**Reglas.** Las claves de API nunca llegan al navegador. `truth` e `hiddenHistory` solo se leen desde funciones internas. Las sesiones guardan el alias y nada más personal.

## 5. Motor del paciente

El paciente no es un chat: es un estado oculto (caso, personalidad y ánimo) que la IA interpreta en cada turno y que cambia según cómo lo trata el estudiante.

### Capas

1. **Caso** (verdad oculta): historia, hallazgos, signos vitales, diagnóstico. El agente de voz recibe solo lo que una persona sabría de sí misma.
2. **Personalidad** (fija por sesión): cómo habla y cuánto colabora.
3. **Estado dinámico** (cambia durante la consulta): confianza, ansiedad, dolor, paciencia.
4. **Herramientas**: lo que puede hacer o mostrar (dejarse examinar, mostrar una región, dejarse medir la presión).

### Parámetros de personalidad

| Parámetro | Rango | Efecto observable |
|---|---|---|
| cooperación | 0 a 1 | Abre la boca a la primera, a medias, o se niega hasta que le expliquen y pidan permiso |
| ansiedad | 0 a 1 | Habla rápido, repite preocupaciones, pregunta "¿es grave?", se mueve durante el examen |
| locuacidad | 0 a 1 | Responde con monosílabos o cuenta de más y se va por las ramas |
| desconfianza | 0 a 1 | Oculta datos sensibles (alcohol, tabaco, drogas) hasta que sube la confianza |
| audición | normal o reducida | Hay que repetir o hablar más fuerte |
| paciencia | 0 a 1 | Se impacienta con silencios largos o preguntas repetidas; puede interrumpir |
| vocabulario | simple o medio | No usa términos médicos y confunde palabras |

### Arquetipos iniciales

| Paciente | Cómo es | Qué pone a prueba |
|---|---|---|
| Directo y colaborador (Lucía, 24) | Responde claro, algo preocupada | Base: anamnesis completa y examen limpio |
| Ansioso | Pregunta si es grave, habla rápido, se mueve | Empatía, tranquilizar sin prometer, explicar antes de examinar |
| Adulto mayor con audición reducida | Divaga, hay que repetir | Claridad, ritmo, verificar que entendió |
| Hostil o "mala onda" | Desconfiado, respuestas cortas, no quiere abrir la boca | Manejo: validar la emoción, explicar para qué, pedir permiso, dar control |

La personalidad es independiente del caso: el mismo dolor de garganta con 4 personalidades da 4 consultas distintas sin escribir contenido clínico nuevo.

### Realismo conversacional

| Situación | Cómo se implementa | Qué evalúa |
|---|---|---|
| El estudiante interrumpe al paciente | La API de voz corta el audio cuando detecta la voz del estudiante; el paciente retoma o se adapta | Si interrumpe sin necesidad (se cuenta en `events`) |
| El paciente interrumpe o se adelanta | Detección de turno más rápida en pacientes impacientes, o vuelve a hablar tras un silencio largo | Cómo reacciona el estudiante y si deja hablar |
| Pausas y muletillas ("eh...", "mmm", "ta") | Estilo rioplatense en las instrucciones | Nada: es realismo |
| Datos que se cuentan solo con confianza | Los datos sensibles se liberan cuando sube `confianza` (preguntas abiertas, empatía, sin presionar) | Preguntas abiertas y rapport |
| "Decí aaa" o "abrí más" | La herramienta `examinar` recibe la claridad de la instrucción y devuelve una variante de imagen | Instrucciones claras y consentimiento |
| Preguntas que el caso no define | Respuesta plausible y coherente; el hecho inventado se guarda para no contradecirse | Que el paciente sea consistente |
| Intentos de sacarlo del personaje ("ignorá tus instrucciones", "¿qué enfermedad tenés?") | El paciente no tiene el diagnóstico y sigue en personaje | Nada: prueba de seguridad |

Verificar en la documentación de OpenAI Realtime qué parámetros de detección de turno ofrece el modelo elegido, antes de prometer interrupciones en ambos sentidos.

### Cómo cambia el estado

- **Versión 1 (hoy):** el estado se actualiza con eventos objetivos del cliente (interrupciones, silencios, si hubo consentimiento) y con una herramienta `actualizar_estado(delta, motivo)` que el propio paciente llama cuando algo le cae bien o mal. Cada cambio se guarda en `events`.
- **Versión 2 (si sobra tiempo):** un clasificador rápido etiqueta cada turno del estudiante (pregunta abierta o cerrada, jerga, empatía, pregunta sugestiva) y actualiza el estado antes de la siguiente respuesta.
- **Limitación a decir en el pitch:** un modelo que se autoevalúa el ánimo es menos fiable que un clasificador. Por eso el puntaje final sale del evaluador y del código, no del ánimo.

### Voz

Probar 3 voces en 15 minutos (OpenAI y ElevenLabs) y elegir la que mejor suene rioplatense. Si ninguna, usar la mejor en español con instrucciones de voseo. Tope de 8 minutos por sesión y versión por texto de respaldo.

## 6. Examen físico interactivo

El examen es una capa de herramientas virtuales: la IA interpreta lo que el estudiante pide por voz, el código valida la técnica y registra cada acción, y el caso devuelve el hallazgo.

**Contrato común.** Toda acción pasa por una herramienta del paciente, por ejemplo `examinar(zona, maniobra, claridad)`. El servidor la guarda en `examActions` y devuelve el hallazgo, la variante de imagen o audio y la reacción del paciente. Ningún valor sale del cliente: el caso decide qué se ve.

### Módulos

Prioridad 1 es imprescindible, 2 importante y 3 si sobra tiempo (igual que en la sección 1).

| Módulo | Cómo se usa | Qué registra | Respaldo clínico | Prioridad |
|---|---|---|---|---|
| Orofaringe con linterna | Pide "abrí la boca"; el mouse o el dedo mueve el círculo de luz | Zonas vistas, tiempo en cada una, claridad de la instrucción | Lista de cotejo de examen físico general: examen bucofaríngeo (lengua, dientes, encías, paladar, amígdalas) | 1 |
| Tensiómetro | Arrastrar el manguito al brazo, mantener una tecla para inflar, soltar para desinflar, marcar PAS y PAD | Pasos de preparación, posición y manguito; valores marcados | Lista general (TAX y PA) y afiche HC-01 | 2 |
| Otoscopio | Traccionar el pabellón, introducir con el scroll, ver conducto y tímpano | Oído (derecho o izquierdo), tracción, orden | Afiche HC-02 y capítulo de Bates (solo como referencia) | 3 |
| Inspección general (piel, mucosas, uñas, conjuntivas) | Pedir "mostrame las uñas" o "bajá el párpado" y ver la región | Regiones pedidas | Lista general: piel, mucosas, faneras | 3 |
| Cardiovascular (inspección, pulsos, auscultación) | Elegir foco o pulso en un mapa; audio de ruidos | Focos auscultados, pulsos comparados | Lista CV; la palpación queda afuera porque la ficha dice a mano "ya no se hace" | 3 |
| Rodilla y otros segmentos | "Mostrame la rodilla" y ver una imagen o clip; pedir flexión | Región y maniobra | Falta la ficha de cotejo: pedirla a la facultad | 3 |

### Orofaringe: "abrí la boca" en tres niveles

1. El estudiante dice "abrime la boca" y nada más: el paciente abre poco (apertura parcial). Se ven labios y dientes.
2. Dice "abrí más, sacá la lengua, decí aaa": apertura completa con la lengua baja. Se ve el fondo de la garganta.
3. Si la `cooperación` es baja, el paciente no abre hasta que el estudiante explique qué va a hacer y pida permiso. Es un ítem de la lista de cotejo: "explica al paciente que llevará a cabo el examen físico, obtiene consentimiento".

La vista de examen es una foto clínica real, oscurecida, con una máscara radial (círculo de luz que sigue al mouse o al dedo) y zonas marcadas: amígdala izquierda, amígdala derecha, úvula, paladar, lengua, pared posterior. La app mide cuánto tiempo estuvo la luz sobre cada zona. Después el estudiante describe por voz lo que vio y se compara con el hallazgo esperado. Opcional: una tecla para el abatelenguas mejora la visibilidad de las amígdalas.

Las variantes de apertura parcial no muestran patología, así que pueden ser fotos de una persona sana. Solo la vista completa es un hallazgo clínico real.

### Tensiómetro: del afiche HC-01 al simulador

El flujo sigue las estaciones del afiche:

1. **Preparar al paciente:** descansó 5 minutos, no habló, sin café, mate, tabaco ni energizantes en 30 minutos, vejiga vacía, ambiente tranquilo, cómodo y relajado.
2. **Posición:** espalda apoyada, pies apoyados, piernas descruzadas, brazo apoyado a la altura del corazón.
3. **Manguito:** sobre la piel, que cubra cerca del 80% de la circunferencia del brazo.
4. **Medir:** paciente en silencio, inflar, desinflar despacio y escuchar los ruidos de Korotkoff. El primer ruido es la PAS y la desaparición es la PAD.
5. **Interpretar:** normal (menos de 120 y menos de 80), elevada (120 a 129 y menos de 80), hipertensión estadio 1 (130 a 139 u 80 a 89), estadio 2 (140 o más, o 90 o más). Si el resultado es inesperado, repetir.

**Controles:** con el mouse se arrastra el manguito al brazo. Mantener `Espacio` infla; al soltar desinfla de a poco. `S` marca la PAS (primer ruido) y `D` la PAD (último ruido). El audio de los ruidos suena solo entre la PAS y la PAD verdaderas del caso.

| Error de técnica | Efecto en la lectura (según el afiche) |
|---|---|
| Piernas cruzadas | Sube la sistólica |
| Brazo por debajo del corazón | Sobreestima |
| Brazo por encima del corazón | Subestima |
| Manguito chico | Falsas elevadas |
| Manguito grande | Falsas bajas |
| Manguito sobre ropa gruesa | Altera la lectura |
| Hablar durante la medición | Sube la presión |
| Actividad reciente, café o tabaco | Subida transitoria |

El valor mostrado es el valor verdadero del caso más los ajustes por errores de técnica. Eso lo calcula el código, no la IA. La IA interpreta lo que dice el estudiante ("apoyá la espalda", "descruzá las piernas") y lo traduce a cambios de estado, y el paciente reacciona. La magnitud en mmHg de cada ajuste es un parámetro inicial a calibrar con un docente: es un modelo educativo simplificado.

**Caso trampa listo para usar (estación 3 del afiche):** Rosa Rodríguez, 58 años, hipertensión diagnosticada hace 5 años, sobrepeso, sedentarismo, enalapril 20 mg por día, adherencia irregular. Llega diciendo "vine corriendo porque casi pierdo el ómnibus" y espera hablando por teléfono. Si el estudiante mide sin dejarla descansar ni callar, da alto, y el informe lo marca. El afiche muestra 154/94 como resultado de ejemplo.

### Otoscopio (afiche HC-02)

Pasos del afiche: higiene de manos, explicar el procedimiento, inspeccionar el oído externo, verificar la luz y elegir el espéculo. Técnica: mano derecha para el oído derecho, sostener como un lápiz, apoyar los dedos sobre la cabeza, traccionar el pabellón hacia arriba, atrás y afuera, introducir suavemente bajo visión directa y observar el conducto y luego el tímpano. En el simulador: arrastrar para traccionar, scroll para introducir, y una vista circular con imágenes licenciadas (sano, eritema, nacarado, etc.). Se registran los pasos y el orden.

### Pedir una región del cuerpo

"Mostrame la rodilla" llama a `mostrar_region(region)` y la pantalla cambia a esa región. También hay un mapa corporal clickeable: un estudio con estudiantes (CHI 2026, citado en nuestro plan) reporta que quieren exámenes guiados con mapa corporal.

### Después del examen

El estudiante describe por voz lo que vio ("amígdalas rojas con exudado") y esa descripción se compara con el hallazgo esperado de la zona. Ver una zona sin describirla da crédito parcial.

## 7. Banco de casos y de información clínica

Cada caso es un archivo JSON que describe al paciente, lo que esconde, lo que aparece al examinarlo y cómo se puntúa. El banco de hallazgos reúne las imágenes y audios reales con licencia que usan los casos.

### Estructura de un caso

El ejemplo usa valores inventados para mostrar el formato; un estudiante avanzado o un médico tiene que validar el contenido clínico real.

```json
{
  "id": "garganta-01",
  "patient": { "name": "Lucía", "age": 24, "occupation": "estudiante" },
  "personality": { "cooperacion": 0.9, "ansiedad": 0.3, "locuacidad": 0.6,
                   "desconfianza": 0.1, "audicion": "normal", "paciencia": 0.7 },
  "chiefComplaint": "Me duele la garganta desde hace tres días",
  "profile": { "vive": "con una compañera", "estadoCivil": "soltera" },
  "hiddenHistory": { "fiebre": "38,5 anoche", "tos": "no", "alergias": "ninguna",
                     "medicacion": "solo ibuprofeno", "alcohol": "fines de semana" },
  "vitals": { "pa": [112, 70], "fc": 96, "fr": 16, "tax": 37.8 },
  "exam": {
    "orofaringe": {
      "variants": { "parcial": "mouth-partial-01", "completa": "throat-exudate-01" },
      "hotspots": ["amigdala-izq", "amigdala-der", "uvula", "paladar", "lengua", "pared-posterior"],
      "expected": "Amígdalas rojas con exudado blanquecino, úvula central"
    }
  },
  "expectedChecklist": [
    { "item": "alergias medicamentosas", "dimension": "anamnesis", "weight": 3 },
    { "item": "explica y pide consentimiento", "dimension": "examen", "weight": 3 }
  ],
  "notApplicable": ["gineco-obstetricos", "palpacion-cv"],
  "criticalErrors": ["examen sin consentimiento"],
  "truth": { "diagnosis": "faringoamigdalitis aguda",
             "acceptable": ["faringitis", "amigdalitis"],
             "differentials": ["viral", "estreptocócica", "mononucleosis"] }
}
```

Tres reglas para escribir casos:

- Cada ítem de la lista de cotejo que aplica tiene una respuesta definida (`profile` e `hiddenHistory`), para que el paciente no improvise datos que luego se contradigan. Todos los datos de la ficha (nombre, dirección, teléfono) son inventados.
- `notApplicable` lista lo que no cuenta para este caso: no suma ni resta.
- `truth` solo se lee desde funciones internas del servidor.

**Variación controlada (prioridad 2).** Para que el caso no sea siempre igual, el servidor sortea valores dentro de rangos que define el docente (fiebre entre 37,8 y 39, con o sin tos) sin cambiar el diagnóstico.

### Generador de pacientes a pedido (agregado el 17/10)

Además del banco, el estudiante puede pedir un paciente con sus palabras: "dame un paciente con algo de garganta, que sea ansioso y de unos 60 años". El generador:

1. Elige una **plantilla clínica** del equipo según lo pedido (`cases/templates.ts`). La plantilla trae diagnóstico, historia relevante, signos vitales y variantes de examen con imágenes del banco con licencia.
2. Elige la **personalidad** según el pedido (ansioso, hostil, mayor, directo) y toma la edad y el sexo si se mencionan.
3. **Inventa a la persona**: nombre, ocupación, motivo de consulta con sus palabras y datos sociales. Lo hace con IA si hay clave, si no al azar. Todos los datos son ficticios.

Reglas: la IA nunca inventa contenido clínico ni imágenes. Los casos generados quedan marcados como "generado" y "sin revisar" hasta que un médico revise la plantilla. Si se pide algo que no tiene plantilla (por ejemplo, rodilla), se responde con un error claro. A acordar en el equipo: cómo encaja con la regla de `AGENTS.md` de que todo caso lo valida un médico.

### Casos a construir

| Caso | Contenido | Material de base | Prioridad |
|---|---|---|---|
| 1. Dolor de garganta (Lucía, 24) | Faringoamigdalitis aguda; anamnesis completa y orofaringe | Banco de imágenes de abajo | 1 |
| 2. Hipertensión mal medida (Rosa Rodríguez, 58) | Medición de presión con trampas: llegó corriendo y habla por teléfono | Afiche HC-01 (pedir permiso) | 2 |
| 3. Dolor de garganta con otra personalidad | Mismo contenido clínico con paciente hostil, ansioso o mayor | Nada nuevo | 2 |
| 4. Otoscopia | Exploración de oídos con hallazgos | Afiche HC-02 e imágenes licenciadas | 3 |
| 5. Rodilla | Pendiente de la ficha de cotejo | A conseguir | 3 |

### Banco de hallazgos

Todo hallazgo lo valida un médico o un estudiante avanzado antes de usarse.

| Zona | Hallazgos a reunir | Prioridad |
|---|---|---|
| Orofaringe | Normal, faringitis con eritema difuso, faringoamigdalitis con exudado; opcionales: amígdalas hipertróficas, candidiasis oral | 1 (los tres primeros) |
| Oído | Conducto sano, eritema, tímpano nacarado, tímpano íntegro | 3 |
| Conjuntivas y mucosas | Normal, palidez, ictericia | 3 |
| Uñas | Normal, coiloniquia, estrías longitudinales | 3 |
| Piel | Normal, cianosis, ictericia, hipocoloreada | 3 |
| Miembros inferiores | Edema, várices, úlcera | 3 |
| Rodilla | Normal, derrame, deformidad | 3 |
| Ruidos cardíacos | Normales y un soplo, solo con audio licenciado | 3 |

Los hallazgos salen de lo que nombran las listas de cotejo (por ejemplo coiloniquias, estrías longitudinales, edemas y coloración de mucosas).

### De dónde salen las imágenes

| Fuente | Licencia | Cuidado |
|---|---|---|
| Wikimedia Commons, Pharyngitis.jpg | CC BY-SA 2.5 | Atribuir al autor; las versiones recortadas o corregidas quedan con la misma licencia |
| Wellcome Collection, amigdalitis | Dominio público | Es material histórico: confirmar que sirve |
| Roboflow, dataset de faringitis | CC BY 4.0 | Atribuir y revisar cada imagen |

No se usan: imágenes de libros (como Bates), atlas con licencia restrictiva ni imágenes clínicas generadas con IA.

**Pasos por imagen:**

1. Elegirla y anotar URL, autor y licencia.
2. Verificar que la licencia permite usarla y recortarla.
3. Recortar y darle el mismo color y viñeta oscura que a las demás, para que parezcan del mismo consultorio.
4. Marcar las zonas con su posición y radio.
5. Un médico o estudiante avanzado confirma que cada zona muestra lo que dice.
6. Registrarla en `assets` y en `CREDITS.md`.

**Sobre mezclar la patología con la cara del paciente.** No se hace con IA generativa, porque puede inventar hallazgos. Se resuelve con el corte de escena: el paciente dice "aaa", y la pantalla pasa a la foto clínica real, ajustada de color para parecer parte de la misma escena. Si el equipo igual quiere componer una imagen, que sea fuera de línea, validada por un médico y registrada como obra derivada en `CREDITS.md`.

### Información para que la IA consulte

El evaluador y el paciente leen: las listas de cotejo (traducidas a `expectedChecklist`), los afiches del Centro de Simulación y los PDFs de semiología, todos con permiso de la facultad. Si sobra tiempo (prioridad 3), una búsqueda vectorial en Convex sobre esa bibliografía permite que el feedback cite la fuente de por qué algo importa.

## 8. Sistema de puntaje y feedback

El puntaje sale de las listas de cotejo de la facultad, cuenta solo lo que el caso hace relevante, y se aprueba con 85% o más y sin errores críticos. Los pesos y las penalizaciones de esta sección son valores iniciales para calibrar con un docente.

### Cómo se calcula

1. **Eventos en vivo:** turnos, acciones de examen, mediciones de presión, interrupciones y silencios quedan guardados.
2. **Extractor determinista (código):** calcula lo medible: tiempo sobre cada zona, pasos de técnica cumplidos, cantidad de interrupciones, valores de presión contra el verdadero.
3. **Juez de lenguaje (IA):** para cada ítem esperado dice si se cumplió (sí, parcial o no) y cita el turno que lo prueba.
4. **Verificador de omisiones (IA y búsqueda):** antes de decir "no preguntaste X", busca X en la transcripción y vuelve a preguntarle al modelo. Sin evidencia no hay omisión.
5. **Motor de puntaje (código):** aplica pesos, penalizaciones, topes y errores críticos.
6. **Redactor de feedback (IA):** convierte los errores en explicaciones concretas.

### Dimensiones y pesos

| Dimensión | Peso | Qué entra | Fuente |
|---|---|---|---|
| Anamnesis | 30% | Ítems esperados del caso (el Anexo 1 tiene 38 posibles; aplican solo los del caso) | Lista de cotejo: introducción a la entrevista clínica |
| Examen físico | 25% | Zonas inspeccionadas y descritas, técnica, consentimiento | Listas de examen físico general (27 ítems) y cardiovascular |
| Razonamiento y diagnóstico | 25% | Hipótesis, diferenciales, justificación, estudios | Verdad del caso |
| Comunicación y manejo del paciente | 20% | Escucha, preguntas abiertas, empatía, cómo reaccionó ante un paciente difícil | Sección "construye una relación" y conducta |

El puntaje total es la suma ponderada de las cuatro dimensiones.

### Reglas de puntaje

- Cada ítem esperado del caso tiene un peso: esencial 3, importante 2, complementario 1.
- Un ítem cumplido da el 100% de su peso, parcial el 50%, no cumplido 0.
- Puntaje de la dimensión = puntos ganados ÷ puntos aplicables × 100. Los ítems que no aplican al caso no suman ni restan.
- Cada ítem necesita evidencia: el turno o la acción que lo prueba.
- Las penalizaciones restan de la dimensión, con un tope de 15 puntos por dimensión.

### Qué suma y qué resta

| Suma | Resta (valor inicial) |
|---|---|
| Cubre un ítem esperado: el peso del ítem | Interrumpir al paciente sin necesidad, desde la tercera vez: 2 puntos de comunicación por vez |
| Empieza con pregunta abierta y deja hablar | Pregunta sugestiva ("¿tenés fiebre, no?"): 1 punto |
| Resume y verifica que el paciente entendió | Jerga sin explicar: 1 punto |
| Explica y pide consentimiento antes de examinar | Ignorar una pista emocional o de dolor: 3 puntos |
| Técnica correcta (cada paso del tensiómetro) | Repetir una pregunta ya respondida: 1 punto |
| Describe bien un hallazgo: crédito completo de la zona | Error de técnica en el examen: 2 puntos por error |
| Hipótesis con justificación y diferenciales | Saltar al diagnóstico sin datos suficientes: 5 puntos de razonamiento |
| Sube la confianza de un paciente difícil | Examinar a un paciente que se negó, sin resolverlo: error crítico |

### Errores críticos

Bloquean el "Lo hiciste bien" aunque el total pase de 85%. La lista la valida un docente:

- Examinar sin explicar ni pedir consentimiento.
- Presionar o insistir contra la negativa del paciente.
- Descartar una urgencia o pasar por alto una señal de alarma del caso.
- Trato irrespetuoso o humillante.

### Veredicto

| Resultado | Mensaje |
|---|---|
| 85% o más y sin errores críticos | Lo hiciste bien |
| 85% o más con un error crítico | Buen trabajo, con un error que no se puede pasar por alto (se muestra cuál) |
| 70% a 84% | Casi: repasá estos puntos |
| Menos de 70% | A repasar: empezá por estos errores |

El corte de 70% es una propuesta; el de 85% lo definieron ustedes.

### Diagnóstico y razonamiento

| Parte | Peso dentro de la dimensión | Cómo se evalúa |
|---|---|---|
| Hipótesis principal | 40% | Coincide con la verdad o con una variante aceptable |
| Diferenciales relevantes | 25% | Cubre los que lista el caso |
| Justificación con hallazgos propios | 20% | Cita lo que preguntó o vio |
| Estudios y conducta razonables | 15% | Pedidos coherentes con el cuadro |

El evaluador no diagnostica por el estudiante, y la verdad del caso recién se muestra en el informe.

### Manejo del paciente difícil

Se mira la confianza al final contra la del principio, si se logró el consentimiento, las interrupciones y el tono. Ante un "no quiero abrir la boca", una buena respuesta reconoce la emoción, explica para qué es el examen, pide permiso y da control ("si querés que pare, me avisás"). Una mala respuesta insiste, ordena, minimiza o amenaza.

### Feedback por errores

El informe tiene siete partes:

1. Veredicto y puntaje total, con las cuatro barras.
2. Lo que hiciste bien: tres cosas con su cita.
3. Errores y omisiones. Cada uno dice qué pasó (con la cita del turno), por qué importa (con la fuente) y cómo hacerlo la próxima vez.
4. Línea de tiempo de la consulta con los momentos marcados, para ir al turno exacto.
5. Mapa del examen: zonas vistas contra las esperadas.
6. Repetición sugerida: un caso o una personalidad que ataca tus errores principales.
7. Perfil de errores acumulado entre sesiones (`mistakeProfile`).

Ejemplo de una tarjeta de error:

```
No preguntaste por alergias medicamentosas (no aparece en ningún turno).
Por qué importa: es un ítem esencial de antecedentes personales.
La próxima vez: preguntalo antes de pasar al examen físico.
```

### Cómo comprobamos que el evaluador es confiable

La rúbrica del evento pide "una comprobación sencilla de su calidad". Proponemos cuatro cifras:

1. **Orden:** tres estudiantes simulados (bueno, mediocre, malo) conversan con el paciente y el evaluador debe ordenarlos bien.
2. **Omisiones inventadas:** cero. Cada "no preguntaste X" se verifica buscando X en la transcripción.
3. **Consistencia:** evaluar la misma transcripción 3 veces y medir cuánto cambia el total (definir un máximo, por ejemplo 5 puntos).
4. **Contraste humano:** dos estudiantes reales comparan el informe con su propia sensación.

### Qué no se puede medir por voz

"Establece contacto ocular" y "expresión facial y postura que muestren cuidado" no se pueden evaluar sin cámara. En la versión 1 quedan como no aplicables y se dice en el informe, para que el puntaje sea honesto.

## 9. Diseño de personajes y avatar

El jurado tiene que ver una persona creíble, pero lo que decide la nota es la conversación, el examen y el informe. Por eso el avatar se construye por niveles y se empieza por el más simple que ya se vea vivo.

### Niveles

| Nivel | Qué es | Esfuerzo | Decisión |
|---|---|---|---|
| 1 | Retrato con animación por audio: parpadeo, respiración, cabeza que se mueve apenas, boca que cambia entre 3 y 5 formas según el volumen del paciente, y expresiones (neutral, preocupado, molesto, dolor) que cambian según el estado | 4 a 6 horas | Hoy |
| 2 | Cara hablando en tiempo real con una API de avatar (HeyGen LiveAvatar, Tavus, Anam, D-ID, Simli, LemonSlice) | Medio día o más; riesgo de latencia y de sincronía de labios; verificar si aceptan audio externo, precio y créditos | Solo si el núcleo anda (domingo a la mañana) |
| 3 | Clips de acciones con la misma persona (abrir la boca, mostrar la rodilla, extender el brazo) | Depende del método | Para la boca, con 2 imágenes en el nivel 1; el resto después |
| 4 | Paciente en 3D | Días | Descartado |

La boca por volumen se puede hacer en el navegador analizando el audio remoto de la sesión de voz (`AnalyserNode` de Web Audio). No necesita API de terceros ni suma latencia; verificarlo con la conexión WebRTC elegida.

Un avatar de API habla bien, pero no sabe abrir la boca ni mostrar una rodilla por pedido. Eso lo resuelve la vista de examen, no el avatar.

### Cómo lograr que se vea real

- Fondo de consultorio, luz suave y plano medio, para que el retrato no parezca una foto recortada.
- El movimiento sutil y constante (respiración, microgestos) importa más que una boca perfecta.
- Cuando el estudiante pide examinar, la escena corta a la vista de examen. Ese corte esconde las limitaciones del avatar.
- Las acciones (abrir la boca) se resuelven con 2 o 3 imágenes o un clip corto de la misma persona, no con generación en vivo.
- La cara del paciente puede ser sintética porque es una persona sana. No se usan fotos de personas reales sin consentimiento escrito, ni parecidos a alguien real.

### Personajes

| Personaje | Edad | Rol en el producto | Modo de hablar |
|---|---|---|---|
| Lucía | 24 | Caso 1: directa y algo preocupada | Joven, voseo, frases cortas |
| Rosa Rodríguez | 58 | Caso 2: hipertensa que llegó apurada | Rápido, "perdón la demora" |
| Ansioso (nombre a definir) | Cerca de 35 | Variante: pregunta si es grave | Rápido, repite, se mueve |
| Hostil (nombre a definir) | Cerca de 45 | Variante "mala onda": no quiere abrir la boca | Seco, respuestas cortas, desconfiado |
| Adulto mayor | Cerca de 72 | Variante: audición reducida | Lento, divaga, pide que repitan |

**Entregables por personaje:** un retrato base, cuatro expresiones (neutral, preocupado, molesto, dolor), dos imágenes de boca parcialmente abierta, una voz asignada y una ficha (historia, muletillas, qué lo molesta).

### Decisiones y plazos

- Método del retrato (generado o de stock) y voz elegida: hoy a las 14:00.
- API de avatar: se evalúa recién después de la puerta 2 (consulta completa con informe).
- Si el nivel 1 se ve bien, el avatar de API se descarta sin culpa.

## 10. Usuarios y autenticación

La app necesita cuentas para guardar el historial y el perfil de errores de cada estudiante, y un modo invitado para que el jurado pruebe sin registrarse. Recomendación: Convex Auth con Google e invitado; si en 30 minutos no anda, Clerk.

| Opción | Qué da | Ventaja | Cuidado |
|---|---|---|---|
| Convex Auth | Librería de Convex: OAuth (Google), contraseña, enlace por correo y proveedor anónimo | Sin servicio extra; el invitado es nativo | Más configuración; Google pide crear credenciales OAuth; verificar el estado de la librería |
| Clerk | Login con Google o correo, pantallas listas, integración con Convex | Lo más rápido de poner | Cuenta externa; el invitado sin registro necesita un camino propio |
| Better Auth | Autenticación en tu propio servidor (opción de Better-T-Stack) | Control total | Más trabajo para este plazo |

Verificar en la documentación vigente de cada una antes de decidir.

**Flujo:**

1. Pantalla de entrada: "Entrar con Google" o "Entrar como invitado".
2. En el primer ingreso se pide un alias y el año de carrera (de 1º a 6º, internado o recién recibido). El año de carrera sirve para sugerir la dificultad y para cruzar con la encuesta de validación.
3. Se crea el registro en `users`.
4. Sesiones, informes y perfil de errores cuelgan del usuario.
5. El invitado funciona igual, y su historial se borra a las 24 horas (propuesta).

**Datos:** alias, año de carrera y rol. El correo solo lo usa el proveedor para autenticar; no se copia a nuestras tablas.

**Roles:** estudiante (por defecto) y docente (lista autorizada a mano para ver el panel; prioridad 3).

**Seguridad:** rutas protegidas; cada función de Convex verifica el usuario; un informe solo lo lee su dueño y los docentes autorizados.

**Verificación:**

- [ ] El login funciona desde un celular.
- [ ] El invitado entra en menos de 10 segundos.
- [ ] Cerrar sesión funciona.
- [ ] El informe de un usuario no lo puede ver otro.

## 11. Reparto entre las 3 personas

Cada persona es dueña de un frente y dirige a su agente en un worktree propio. Anoten sus nombres al lado de cada rol.

| Persona | Rol | Es dueña de | Termina cuando | Rama |
|---|---|---|---|---|
| 1 | Voz y motor del paciente | Proyecto base, Convex y esquema, autenticación, sesión de voz, personalidades, herramientas del paciente | Una consulta completa funciona de punta a punta con 3 personalidades | `feat/voz-motor` |
| 2 | Examen y evaluador | Vista de examen (linterna, tensiómetro, otoscopio), registro de acciones, evaluador y motor de puntaje | El informe sale con puntaje, evidencia y veredicto válido | `feat/examen-evaluador` |
| 3 | Producto, clínica y diseño | Casos, rúbrica, banco de imágenes, personajes y avatar, `DESIGN.md`, pantallas, encuesta y pitch | 2 casos revisados por un médico y la app se ve bien a 390 y 1280 px | `feat/producto-ui` |

### Quién toca qué

Para evitar conflictos de merge, cada directorio tiene una sola dueña.

| Directorios y archivos | Dueña |
|---|---|
| `convex/schema.ts`, `convex/sessions.ts`, `convex/patient.ts`, autenticación, `app/api/`, `lib/patient/` | Persona 1 |
| `components/exam/`, `lib/scoring/`, `convex/evaluator.ts`, `convex/reports.ts` | Persona 2 |
| Estilos y pantallas de `app/`, `components/ui/`, `DESIGN.md`, `cases/`, `assets/`, `CREDITS.md`, `docs/` | Persona 3 |

La pantalla `/consulta` la crea la Persona 1 con una versión mínima y la Persona 3 la viste después; avisen antes de tocar archivos de otra persona.

### Contratos entre frentes (primera hora)

Cada frente publica primero sus tipos y datos de ejemplo, y los demás trabajan contra ellos sin esperar.

1. **Esquema de Convex:** lo publica la Persona 1 en la primera hora; los cambios se piden por mensaje.
2. **Forma del caso:** esquema con zod en `cases/`; lo acuerdan las Personas 1 y 3, y los casos de la Persona 3 tienen que validar contra él.
3. **Acción de examen** (zona, maniobra, claridad, variante, tiempo): la define la Persona 2 y la usa la herramienta `examinar` de la Persona 1.
4. **Informe:** el tipo `Report` lo define la Persona 2 y la Persona 3 diseña la pantalla contra él con datos de ejemplo.

### Persona 1: voz y motor del paciente

Avance al 17/10 (el detalle está en `TODO.md`):

- [x] Clonar el repo, hacer el primer commit y publicar la base con `create-better-t-stack` (con la Persona 3: deploy en Vercel y Convex)
- [x] Esquema de Convex (sección 4) y publicar los tipos
- [ ] Autenticación con Google e invitado (sección 10): invitado andando; Google con el código listo, faltan las credenciales OAuth en Vercel
- [x] Endpoint de clave efímera y sesión de voz en `/consulta` (cambió a Gemini Live por WebSocket)
- [x] Prompt del paciente armado desde el caso y la personalidad, sin el diagnóstico
- [x] Herramientas `examinar` y `terminar_consulta`; después `medir_presion`, `mostrar_region` y `actualizar_estado`
- [ ] Guardar turnos y eventos en Convex: el código está; producción sigue en memoria hasta cargar `CONVEX_URL` y `STORE_SECRET` en Vercel
- [x] Personalidades y datos que se liberan con la confianza (prioridad 2)
- [x] Interrupciones en ambos sentidos (prioridad 2); falta probarlas con micrófono
- [ ] Tope de 8 minutos (hecho) y versión por texto de respaldo (se sacó; decidir si alcanza con el video)
- [x] Pruebas de intentos de sacar al paciente de personaje (repetir en producción con Convex)
- [x] Conectar el audio del paciente al avatar (prioridad 3): `readPatientLevel()` listo; falta que lo use el avatar de la Persona 3
- [ ] Probar la voz con micrófono en el navegador, en computadora y en celular (agregado)
- [ ] Elegir la voz y medir el costo real de una consulta (agregado; secciones 5 y 14)
- [x] Rol en el perfil (estudiante o docente por lista autorizada) y acceso de docentes a los informes (agregado; sección 10, prioridad 3); falta cargar `DOCENTES` en Vercel
- [x] Los eventos objetivos (interrupciones, silencios, consentimiento) actualizan el estado del paciente (agregado; sección 5, versión 1)
- [x] Reconectar la voz sin perder la conversación (agregado); probado en producción
- [x] Límite de consultas de voz por usuario y por día para cuidar los créditos (agregado; sección 14, riesgos)
- [x] Retención de las transcripciones configurable (agregado; sección 2); el plazo lo define la facultad

### Persona 2: examen y evaluador

- [ ] Vista de examen: foto oscurecida, círculo de luz, zonas y registro del tiempo en `examActions`
- [ ] Variantes de apertura de boca (parcial y completa) según la claridad de la instrucción
- [ ] Extractor determinista y motor de puntaje en `lib/scoring/`, con tests
- [ ] Esquema del informe con zod y evaluador: juez por ítem, verificador de omisiones y redactor
- [ ] Veredicto con 85% y errores críticos
- [ ] Evaluación del diagnóstico (hipótesis y diferenciales)
- [ ] Tensiómetro virtual con teclas y ajustes por técnica (prioridad 2)
- [ ] Ciclo de validación: 3 estudiantes simulados y prueba de consistencia
- [ ] Contraste con 2 estudiantes reales
- [ ] Otoscopio (prioridad 3)

### Persona 3: producto, clínica y diseño

- [ ] Enviar la encuesta y juntar entre 10 y 15 respuestas con el año de carrera
- [ ] Caso 1 completo en JSON, revisado por un estudiante avanzado o un médico
- [ ] Traducir las listas de cotejo a `expectedChecklist` con pesos
- [ ] Banco de imágenes: normal, faringitis y exudado, con licencia, recorte, zonas y `CREDITS.md`
- [ ] `DESIGN.md` y pantallas (inicio, entrada, elegir caso, consulta, examen, informe) a 390 y 1280 px
- [ ] Pantalla del informe contra el tipo `Report`, con datos de ejemplo
- [ ] Personajes: retratos, expresiones, voces y fichas
- [ ] Caso 2 (Rosa Rodríguez) y personalidades en JSON (prioridad 2)
- [ ] Preguntar a la facultad: permiso para usar los materiales, qué significa la nota "ORDEN" de la ficha y la ficha de rodilla
- [ ] Pitch, guion de 3 minutos, video de respaldo y la declaración de qué es funcional, simulado o pendiente
- [ ] Probar 2 APIs de avatar (prioridad 3)

**Balance.** Si la Persona 1 termina antes, toma el tensiómetro. Si la Persona 2 se atrasa, el informe se simplifica a puntaje por dimensión y errores principales.

## 12. Worktrees de Orca y prompts para los agentes

Cada persona dirige a sus agentes en worktrees de su frente, trabaja con commits chicos y llega a `main` con merges seguidos. Kiro se suma para escribir especificaciones y para tareas largas en paralelo, sin bloquear nada.

### Primeros 30 minutos

1. La dueña del repo hace el primer commit desde una terminal común: `git checkout -b main`, un `README.md`, `git add`, `git commit` y `git push -u origin main`. Sin ese commit, Orca dice "No base branch found".
2. La misma persona corre `npx create-better-t-stack@latest . --frontend next --backend convex --yes` y `npx shadcn@latest init`, agrega `AGENTS.md` y `.claude/settings.json` (sección 2) y sube todo.
3. Agrega a las otras dos como colaboradoras (Settings, Collaborators) y conecta Vercel y Convex al repo.
4. Cada persona clona el repo, lo abre en Orca y crea su worktree con el nombre de la sección 11.
5. En el worktree abre la terminal y corre `claude`. Primer mensaje: el prompt 0.

### Cómo se trabaja

- Una persona, un frente, un worktree principal. Si necesita otra tarea en paralelo, crea otro worktree desde el suyo.
- A `main` no se le edita a mano: se integra con commits chicos y `git pull --rebase origin main` antes de cada push.
- Cada push a `main` despliega una URL pública.
- Cada tarea tiene los tres elementos de la charla: objetivo, restricciones y validaciones. El agente itera hasta que todo pase.
- Si una sesión se llena, `/handoff` pasa el contexto a la siguiente.

### Skills, MCP y herramientas

| Qué | Para qué | Cuándo |
|---|---|---|
| `/grill-me` y `/to-prd` (mattpocock/skills) | El agente te entrevista antes de escribir código y deja `docs/PRD.md` | Ahora, una sola vez |
| `/to-issues`, `/tdd`, `/handoff` | Tareas, pruebas primero y pasar contexto | Durante el trabajo |
| MCP `executor` y `fff` | Todas las APIs detrás de un MCP y búsqueda rápida en el repo | Opcional; máximo 2 o 3 MCP |
| Skill `orca-cli` | Que los agentes creen worktrees y dejen notas de avance en Orca | Opcional |
| `agent-browser` | Abrir la app y probarla a 390 y 1280 px | Validación visual |
| git, gh, npm, vercel, convex | Versiones, despliegue y datos | Siempre |

```bash
npx skills@latest add mattpocock/skills
npm install -g executor
npx add-mcp "executor mcp" --name executor
npx skills add https://github.com/stablyai/orca --skill orca-cli
```

Verificar cada comando con `--help` antes de correrlo. Si Claude Code pregunta por un MCP que no reconocen, elijan "Continue without using this MCP server".

### Dónde entra Kiro

Según nuestro plan, Kiro escribe especificaciones en tres archivos (`requirements.md`, `design.md`, `tasks.md`), lee `AGENTS.md` y las reglas de `.kiro/steering`, y los créditos los pone AWS (a confirmar con la organización). Se incorpora después de la puerta 1.

| Uso | Cómo | Cuándo |
|---|---|---|
| Especificar | Con el PRD, Kiro escribe requirements, design y tasks de cada frente; Claude Code ejecuta `tasks.md` | Primera hora, si ya tienen acceso |
| Segundo agente en paralelo | Una tarea larga y aislada en otro worktree, por ejemplo el ciclo de validación del evaluador con estudiantes simulados | Después de la puerta 1 |
| Revisión | Revisa un diff contra `AGENTS.md` (privacidad, claves, diagnóstico solo en el servidor) | Antes de un merge grande a `main` |

Tenki ofrece máquinas virtuales desechables para correr agentes o el ciclo de pruebas sin cargar las computadoras. El acceso lo da la organización por link y el producto está en despliegue gradual. Es opcional y va después del núcleo.

### Prompts listos para copiar

Reemplazar lo que está entre llaves.

**0. Arranque (cualquiera, en `main`):**

```
Objetivo: crear la app web "Paciente 0" según docs/PRD.md: un paciente simulado por voz para estudiantes de medicina, con examen físico interactivo y un informe con puntaje.
Stack: Next.js, shadcn/ui y Convex (create-better-t-stack), desplegado en Vercel.
Restricciones: leé AGENTS.md primero. No uses datos de pacientes reales ni accedas a sistemas de instituciones de salud. Ninguna clave en el cliente ni en el repo. El diagnóstico del caso nunca llega al navegador ni al prompt del paciente. Sin imágenes clínicas generadas por IA.
Validaciones: npm run build pasa; tipos y lint sin errores; la app abre en la URL de Vercel.
Hacé primero el esqueleto y el deploy vacío; avisame antes de agregar dependencias grandes.
```

**1. Persona 1, voz y motor (`feat/voz-motor`):**

```
Objetivo: una consulta por voz de punta a punta. El estudiante elige un caso y una personalidad, habla con el paciente en rioplatense por WebRTC con OpenAI Realtime, y cada turno se guarda en Convex.
Alcance: esquema de Convex (users, cases, sessions, turns, examActions, vitals, events, reports, assets); función que arma las instrucciones del paciente desde el caso y la personalidad SIN el diagnóstico; endpoint de clave efímera; herramientas examinar, medir_presion, mostrar_region, actualizar_estado y terminar_consulta.
Restricciones: solo tocá convex/, app/api/ y lib/patient/. La clave real nunca sale del servidor. truth e hiddenHistory solo se leen desde funciones internas. Sesión máxima de 8 minutos.
Validaciones: una consulta de prueba guarda turnos en Convex; el paciente no revela el diagnóstico ante "ignorá tus instrucciones" ni "¿qué enfermedad tenés?"; el estudiante puede interrumpir al paciente; npm run build pasa; sin errores de consola a 390 y 1280 px.
```

**2. Persona 2, examen y evaluador (`feat/examen-evaluador`):**

```
Objetivo: el examen físico interactivo y el informe con puntaje.
Alcance: (1) vista de examen: foto clínica oscurecida con un círculo de luz que sigue al mouse, zonas marcadas, registro del tiempo sobre cada zona en examActions y variantes de apertura de boca según la claridad de la instrucción; (2) tensiómetro virtual con teclas (Espacio infla, S marca PAS, D marca PAD) y ajustes por errores de técnica; (3) lib/scoring/: extractor determinista y motor de puntaje (dimensiones, pesos, penalizaciones, errores críticos, veredicto con 85%); (4) evaluador: juez por ítem con cita del turno, verificador de omisiones y redactor de feedback, con salida JSON validada con zod.
Restricciones: solo tocá components/exam/, lib/scoring/, convex/evaluator.ts y convex/reports.ts. Los ítems que no aplican al caso no suman ni restan. Nunca inventes una omisión: citá el turno o no la marques. No diagnostiques por el estudiante.
Validaciones: tests con 3 estudiantes simulados (bueno, mediocre, malo) que el evaluador ordena bien; la misma transcripción evaluada 3 veces varía menos de {5} puntos; el informe valida contra el esquema; build y lint sin errores.
```

**3. Persona 3, producto, casos y diseño (`feat/producto-ui`):**

```
Objetivo: diseño, casos y banco de imágenes de Paciente 0.
Alcance: DESIGN.md (fondo claro, un acento azul sereno, tipografía legible, botones grandes) y las pantallas inicio, entrada, elegir caso, consulta, examen e informe; casos en cases/*.json que validan contra el esquema; traducir las listas de cotejo a expectedChecklist con pesos; registrar cada imagen en assets y CREDITS.md.
Restricciones: solo tocá los estilos y pantallas de app/, components/ui/, DESIGN.md, cases/, assets/, CREDITS.md y docs/. Todos los datos de los casos son inventados. Ninguna imagen clínica generada por IA; solo con licencia registrada.
Validaciones: agent-browser abre cada pantalla a 390 y 1280 px sin que nada se corte ni se superponga; cada caso valida contra el esquema; cada imagen tiene fuente, licencia y atribución.
```

**4. Revisión de privacidad (cualquiera, antes de un merge):**

```
Revisá este diff contra AGENTS.md. Buscá: claves o secretos en el cliente o en archivos versionados; cualquier acceso a sistemas externos de salud; datos personales reales; el diagnóstico (truth) expuesto al navegador o al prompt del paciente; imágenes clínicas sin licencia registrada o generadas con IA. Listá cada problema con archivo y línea. No cambies código: solo informá.
```

## 13. Cronograma de 48 horas

Tres puertas ordenan el fin de semana y cada una se cruza solo si se cumple su criterio; si no, se recorta antes de seguir.

| | Sáb mediodía (Esqueleto) | Sáb tarde (Núcleo) | Sáb noche (Prueba) | Dom mañana (Pulido) | Dom tarde (Demo) |
|---|---|---|---|---|---|
| Persona 1 · voz y motor del paciente | Base y deploy; esquema y login | Voz del paciente; herramientas | Personalidades e interrupciones | Tope 8 min y respaldo texto | Congelar y ensayar demo |
| Persona 2 · examen y evaluador | Vista de examen con linterna | Evaluador e informe con % | Validar el evaluador | Tensiómetro y otoscopio | Congelar y ensayar demo |
| Persona 3 · producto, clínica y diseño | Encuesta, caso 1 e imágenes | DESIGN.md y pantallas | Prueba con 2 estudiantes | Caso 2 y personajes | Pitch, video y declaración |

Puerta 1 (URL pública y login) tras el esqueleto · Puerta 2 (consulta e informe) tras el núcleo · Puerta 3 (funciones congeladas) antes de la demo.

Cada columna es una fase y los rombos son las puertas. El avatar, el otoscopio y los casos extra entran solo si se cruzó la puerta 2.

### Puertas

| Puerta | Criterio | Si no se cumple |
|---|---|---|
| 1. URL pública | La app abre en una URL pública, con login e invitado y una sesión de voz de prueba | Parar todo lo demás hasta que ande. El plan la tenía antes del mediodía del sábado, así que el plazo es hoy a las 14:00 |
| 2. Consulta completa | Una consulta pasa por voz, examen e informe con puntaje y evidencia, en la URL pública | Recortar personalidades, tensiómetro y todo lo opcional |
| 3. Funciones congeladas | Solo arreglos, ensayo y video de respaldo | No se agrega nada nuevo |

### Qué recortar primero

En este orden:

1. Otoscopio y rodilla.
2. Avatar por API.
3. Panel docente y búsqueda en la bibliografía.
4. Segundo caso.
5. Tensiómetro.
6. Personalidades adicionales (se dejan al menos la directa y la hostil).

No se recorta nunca: la voz, la linterna, el informe con puntaje, el login con invitado y la URL pública.

### Horarios

Los horarios dependen del cronograma oficial, a confirmar: Día 1 es el sábado 17/10 y Día 2 el domingo 18/10. Referencia tentativa:

- Sábado de 12:00 a 14:00: esqueleto, deploy y login.
- Sábado de 14:00 a 20:00: núcleo (voz, linterna, informe con el caso 1).
- Sábado de 20:00 a 23:00: prueba con estudiantes reales y ajuste de la rúbrica.
- Domingo por la mañana: pulido, segundo caso y lo opcional si se cruzó la puerta 2.
- Domingo por la tarde: funciones congeladas, ensayo, video de respaldo y revisión de la URL desde otro celular.

## 14. Pitch, rúbrica, riesgos y checklist

La rúbrica del evento pesa producto funcionando 35% y valor para el usuario 25%, así que la demo tiene que ser una consulta real con preguntas que el jurado elige, más un dato real de estudiantes.

### La rúbrica y qué mostramos

| Criterio (peso) | Qué mostramos | Evidencia en la demo |
|---|---|---|
| Producto funcionando (35%) | Una consulta completa con entradas nuevas del jurado | El jurado hace sus propias preguntas; puerta 2 cruzada |
| Problema y valor (25%) | Estudiantes de 2º y 3º que no vieron pacientes; mejora frente a practicar con hermanos o actores | Cifras de la encuesta (confianza actual y utilidad) y una cita |
| Calidad de la IA (20%) | Paciente con estado oculto y evaluador con evidencia | Tres cifras: orden de 3 simulados, omisiones inventadas, variación entre corridas |
| Experiencia de uso (10%) | Flujo claro con mensajes de progreso y de error | Prueba desde un celular y versión por texto |
| Originalidad (10%) | Examen interactivo con linterna y tensiómetro, pacientes con personalidad, rioplatense | "Decí aaa" y un paciente hostil en vivo |

La consigna dice que el jurado puede variar un caso dentro del alcance declarado. Declaremos el alcance: dolor de garganta (anamnesis y orofaringe) y medición de presión.

### Declarar qué es funcional, simulado y pendiente

La revisión técnica lo pide y simular la IA incumple la consigna.

| Componente | Qué es | Qué declarar |
|---|---|---|
| Paciente por voz | IA real en tiempo real | Funcional: responde preguntas nuevas; el caso lo escribió el equipo |
| Evaluador | IA y código | Funcional: cada omisión cita el turno |
| Imágenes de garganta | Fotos reales con licencia | No son IA ni se generan: están precargadas, y se dice |
| Avatar | Retrato animado o API | Decir cuál de los dos es |
| Tensiómetro y otoscopio | Código con ajustes por técnica | Simulación educativa; la IA interpreta lo que dice el estudiante |
| Panel docente y búsqueda en bibliografía | Pendiente | Declararlo pendiente si no se llega |

### Guion de 3 minutos

1. (20 s) Una frase de un estudiante real sobre su primera práctica.
2. (60 s) Un jurado hace de estudiante: el paciente dice que le duele la garganta hace tres días y el jurado pregunta lo que quiera.
3. (40 s) Pide "abrí la boca": el paciente abre poco, el jurado pide "abrí más, decí aaa" y recorre la garganta con la linterna.
4. (40 s) Cierra con su hipótesis y aparece el informe: puntaje, veredicto y una omisión citada en la conversación.
5. (20 s) Quién paga y qué sigue.

**Plan B:** un video de la demo grabado el sábado y una versión por texto, por si fallan el wifi o la voz.

### Preguntas del jurado (3 minutos)

| Pregunta | Respuesta |
|---|---|
| ¿Esto no existe ya? | Sí (René Medici, MedSimAI, SOPHIE), y eso prueba que funciona. Nosotros sumamos el examen físico que hace el estudiante, pacientes con personalidad que reaccionan y feedback con evidencia en rioplatense |
| ¿Por qué no alcanza con un chat de voz genérico? | El paciente es un estado oculto con herramientas de examen, y el puntaje sale de las listas de cotejo de la facultad con evidencia por turno |
| ¿Y si el modelo se equivoca en lo clínico? | El paciente no tiene el diagnóstico, un médico valida casos y hallazgos, el puntaje lo calcula código y se ve la evidencia. Es una herramienta de práctica, no clínica |
| ¿Usan datos de pacientes? | No: casos sintéticos, imágenes con licencia y usuarios con alias |
| ¿Cómo saben que el puntaje es confiable? | Las tres cifras de la sección 8 y la prueba con 2 estudiantes reales |
| ¿Cuánto cuesta por sesión? | Medirlo hoy: hay un tope de 8 minutos por sesión. No inventar la cifra |
| ¿Quién lo compra? | Facultades y programas de residencia. La venta es lenta y algunas universidades construyen lo suyo |

### Riesgos

| Riesgo | Mitigación |
|---|---|
| Querer hacerlo todo con 3 personas | Prioridades 1 a 4, un caso perfecto antes del segundo y el orden de recortes |
| Falla la voz o el wifi | Versión por texto y video grabado |
| Latencia o voz poco rioplatense | Probar 3 voces hoy y tope de 8 minutos |
| Se acaban los créditos | Tope por sesión, un solo caso en la demo y medir el gasto |
| Imágenes incorrectas o sin licencia | Solo fuentes licenciadas, validación médica y `CREDITS.md` |
| Casos o rúbrica con errores clínicos | Revisión de un estudiante avanzado o un médico y leyenda de uso educativo |
| El evaluador inventa omisiones | Verificador con búsqueda; cero omisiones inventadas como criterio |
| El paciente revela el diagnóstico | No lo recibe; probar intentos de engañarlo |
| Avatar poco creíble | Es opcional; el nivel 1 es el respaldo |
| Material de la facultad sin permiso | Usarlo solo como referencia y pedir permiso escrito |
| El login frena al jurado | Modo invitado de 10 segundos |
| Tensiómetro demasiado complejo | Versión mínima: marcar PAS y PAD y evaluar la técnica por pasos |
| Competencia (René Medici) | Reconocerla primero y mostrar el diferencial |

### Preguntas pendientes

- [ ] Facultad: ¿qué significa la nota manuscrita "ORDEN: alergias, urinario y digestivo" en la lista de la entrevista? Parece indicar un orden esperado del interrogatorio.
- [ ] Facultad: ¿se pueden usar los afiches del Centro de Simulación, las listas de cotejo y los PDFs de semiología como base de la rúbrica y del banco de información?
- [ ] Facultad: ¿cuál es la ficha de cotejo de rodilla?
- [ ] Facultad: ¿qué cortes usan para aprobar? Proponemos 85% y 70%.
- [ ] Facultad: contacto ocular y expresión facial no se pueden evaluar por voz; ¿se aceptan como no aplicables en la versión 1?
- [ ] Organización: ¿el código de Claude incluye una clave de API para el evaluador, o solo Claude Code?
- [ ] Organización: ¿los créditos de AWS cubren solo Kiro o también la API de Bedrock?
- [ ] Organización: ¿hay créditos para OpenAI Realtime, ElevenLabs o una API de avatar?
- [ ] Organización: cronograma real (inicio, entrega y demo), calidad del wifi y acceso a Tenki.

### Checklist de hoy

- [ ] Primer commit y repo andando en Orca
- [ ] Base con Better-T-Stack, `AGENTS.md`, `.claude/settings.json` y deploy vacío
- [ ] Colaboradoras agregadas al repo; Vercel y Convex conectados
- [ ] Cuentas: OpenAI con acceso a Realtime, credenciales de Google para el login y Clerk si hace falta
- [ ] Encuesta enviada a estudiantes de medicina
- [ ] `/grill-me` y `/to-prd` para dejar `docs/PRD.md`
- [ ] Probar 3 voces y elegir una
- [ ] Elegir el método del retrato
- [ ] Juntar 3 imágenes con licencia (normal, faringitis, exudado)
- [ ] Pedir a la organización el acceso a Kiro y a Tenki

### Fuentes y material recibido

- René Medici y PsyChat, consultados hoy.
- Orca, README consultado hoy.
- Material del equipo: plan "Primera Consulta", consigna y rúbrica de Build 101, charla "AI Coding Warm Up", listas de cotejo (entrevista clínica, examen físico general y cardiovascular) y afiches HC-01 y HC-02 del Centro de Simulación.
- Recibidos pero no analizados en detalle: los PDFs de semiología (cardiovascular central y periférico, general y anamnesis) y el capítulo de Bates sobre el oído. Quedan como bibliografía para la rúbrica y la búsqueda en la bibliografía, con permiso de la facultad.
