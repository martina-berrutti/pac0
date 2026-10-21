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
