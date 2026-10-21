# Créditos y licencias de los avatares

Todos los pacientes se hicieron con **MPFB 2.0.18** (MakeHuman para Blender,
Blender 4.5 LTS). Lo que exporta MPFB es CC0: el programa es GPL, pero los
personajes que crea no heredan esa licencia.

Solo se usaron paquetes de recursos de MakeHuman con licencia **CC0**
(dominio público, sin obligación de atribución), bajados de
static.makehumancommunity.org:

- makehuman_system_assets (cuerpo, ojos, dientes, lengua, pestañas, cejas,
  peinados y ropa base)
- skins01, skins02, skins03 (pieles por edad)
- hair01, shirts01, pants01, dress01, shoes01, eyebrows01, eyelashes01
- faceunits01 (las 52 caras de ARKit) y visemes02 (los 15 visemas de Oculus)

No se usaron los paquetes CC-BY (hair02, hair03, shirts02). No hay fotos ni
rasgos de personas reales: los cuerpos salen de los controles de edad, sexo y
peso de MakeHuman.

| Paciente | Piel | Pelo | Ropa |
|---|---|---|---|
| senor-mayor | old_caucasian_male | short04 (con canas) | male_casualsuit03, shoes02 |
| senora-mayor | old_caucasian_female | rehmanpolanski_hair_bun_brown (con canas) | toigo_wool_pants, toigo_fisherman_sweater, toigo_ballet_flats |
| hombre-adulto | middleage_caucasian_male | short01 | male_casualsuit01, shoes01 |
| mujer-adulta | middleage_caucasian_female | long01 | female_elegantsuit01, toigo_flats |
| hombre-joven | young_caucasian_male | short02 | male_casualsuit05, shoes03 |
| mujer-joven | young_caucasian_female | ponytail01 | toigo_basic_tucked_t-shirt, toigo_wool_pants, toigo_ballet_flats |
| nino | young_caucasian_male | short02 | male_casualsuit06, shoes01 |
| nina | young_caucasian_female | toigo_blunt_bob_with_bangs | toigo_dress_with_tiered_skirt, toigo_ballet_flats |

El visor usa TalkingHead 1.7.0 (MIT) y three.js 0.180 (MIT) desde jsDelivr.
El estudio de gestos usa MediaPipe Tasks Vision 0.10.22 y su modelo Face
Landmarker (Apache 2.0), de Google: lee la cara en el navegador y no manda
imágenes a ningún lado. De los gestos se guardan solo los números de las
expresiones, y los graba gente del equipo que acepta hacerlo.
