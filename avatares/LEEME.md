# Avatares de Paco (prueba, fuera de pac0)

Ocho pacientes hechos con MPFB, listos para TalkingHead: esqueleto con los
nombres de Mixamo, huesos de los ojos, 52 caras de ARKit y 15 visemas.

- `scripts/personajes.py`: edad, sexo, piel, pelo y ropa de cada uno.
- `scripts/crear_avatar.py`: arma uno en Blender y lo exporta a GLB.
- `herramientas/optimizar.mjs`: lo achica para la web (meshopt, WebP,
  materiales opacos o con máscara, canas).
- `generar.sh`: hace todo (`./generar.sh` o `./generar.sh nina nino`).
- `scripts/muestrario.py` + `herramientas/hoja.mjs`: hoja de pruebas de
  peinados o ropa.
- `visor/`: página para verlos (`python -m http.server 8770 -d visor`).
- `visor/estudio.html`: el avatar copia una cara real (cámara o video) con
  MediaPipe, y se graban gestos (`gestos.mjs`). Se prueba el habla con
  labios en español (`labios-es.mjs`).

## Movimiento aprendido

- `visor/entrenar.html`: una persona del equipo actúa de paciente frente a
  la cámara (escuchando, contando lo que le pasa, pensando, con dolor...).
  `captura.mjs` guarda, cuadro a cuadro, las 52 expresiones, la cabeza, el
  torso, los hombros y el volumen de la voz (con filtro One Euro, calibración
  y ganancia por gesto). Nunca la imagen ni el audio.
- `visor/movimiento.mjs`: el avatar se mueve solo con esas tomas (motion
  matching): toma pedazos de la situación del momento y los encadena por
  continuidad de postura; hablando, elige pedazos con un volumen de voz
  parecido y deja la boca a `labios-es.mjs`.
- La biblioteca se descarga como `biblioteca.json`; va en
  `visor/movimientos/` para que la usen el visor y, después, Paco.

## Realismo

- `herramientas/materiales.mjs`: relieve de la piel sacado de su textura de
  color (poros, líneas y arrugas con volumen), brillo de piel con terciopelo
  en los bordes, ojos húmedos, brillo de pelo y ropa mate.
- `visor/escena.mjs`: luz de estudio (principal cálida, relleno y contorno
  frío) y bordes suaves en pelo y pestañas. Hay que usarla también en Paco.

## Cuidados (lo que ya salió mal una vez)

- **Hombros inflados:** TalkingHead mueve los huesos con los ángulos de
  Lucía. Por eso: pesos de la piel del rig "default" de MPFB sumados en los
  huesos de Mixamo, clavícula a la altura del hombro, brazos y piernas en la
  postura de reposo de Lucía (`referencia/direcciones-lucia.json`) y huesos
  orientados como los suyos (`herramientas/orientar.mjs`). Para revisarlo:
  `node herramientas/alturas.mjs visor/modelos/*.glb` (cabeza-hombro de
  13 a 16 cm en adultos, como Lucía).
- **Ropa atravesada:** el cuerpo y las prendas de abajo se meten unos
  milímetros donde los tapa la prenda de arriba. La ropa va en
  `personajes.py` de adentro hacia afuera. Para revisarlo:
  `blender --background salida/<nombre>.blend --python scripts/foto_torso.py -- foto.png`.
- **Cara transparente o agujeros:** la ropa y la piel van opacas; solo pelo,
  cejas, pestañas, ojos y dientes usan recorte.
