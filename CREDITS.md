# Créditos y licencias

Todo recurso de terceros que entra al producto se registra acá: fuente, licencia, atribución y quién lo validó.

## Avatar

| Archivo | Fuente | Licencia | Atribución | Notas |
|---|---|---|---|---|
| `apps/web/public/avatar/mpfb.glb` | [TalkingHead](https://github.com/met4citizen/TalkingHead/blob/2afe6d79779313db8909badebf46f9805a6c7b70/avatars/mpfb.glb), creado con MPFB (MakeHuman para Blender) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Avatar de ejemplo de TalkingHead, Mika Suominen | Persona sintética. Comprimido por nosotros de 37 a 4 MB (geometría con meshopt, texturas a WebP). Provisorio hasta tener el personaje de cada caso |
| `apps/web/public/avatar/headworklet.min.mjs`, `apps/web/public/avatar/model-en-mixed.bin` | [HeadAudio](https://github.com/met4citizen/HeadAudio) 0.1.0 (`dist/` del paquete npm `@met4citizen/headaudio`) | MIT | Copyright (c) Mika Suominen | Copiados del paquete porque el navegador los pide por URL. Si se actualiza el paquete, volver a copiarlos |

Librerías (por npm, con su propia licencia): `@met4citizen/talkinghead` 1.7.0 (MIT) y `three` 0.180.0 (MIT).

## Imágenes clínicas

Fotos reales (no generadas con IA), sin cara reconocible. Recortadas a 4:3 y achicadas a 1200×900, sin metadatos y **sin tocar el color**, porque el color es el hallazgo. Las zonas de cada foto están en `apps/web/src/lib/exam/oropharynx.ts`.

| Archivo | Muestra | Fuente | Licencia | Atribución | Validó |
|---|---|---|---|---|---|
| `apps/web/public/exam/throat-exudate-01.jpg` | Amígdalas aumentadas con exudado blanquecino, úvula central (caso `garganta-01`) | [Wikimedia Commons: Tonsillitis.jpg](https://commons.wikimedia.org/wiki/File:Tonsillitis.jpg) | Dominio público | Michaelbladon (en.wikipedia) | Pendiente |
| `apps/web/public/exam/throat-erythema-01.jpg` | Pared posterior eritematosa con folículos, sin exudado (caso `garganta-02`) | [Wikimedia Commons: Pharyngitis, COVID-19.jpg](https://commons.wikimedia.org/wiki/File:Pharyngitis,_COVID-19.jpg) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | FreeMediaKid! | Pendiente |
| `apps/web/public/exam/throat-normal-01.jpg` | Orofaringe normal: paladar blando, úvula y pilares sin eritema (para casos futuros) | [Wikimedia Commons: Detailed view of the palatine tonsil of an adult.jpg](https://commons.wikimedia.org/wiki/File:Detailed_view_of_the_palatine_tonsil_of_an_adult.jpg) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | JonaLane | Pendiente |

Falta: foto de apertura parcial (`mouth-partial-01`, labios y dientes de una persona sana). Mientras tanto se muestra el esquema.
