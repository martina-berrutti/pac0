# Hoja de pruebas: un personaje con varios peinados o ropas, una foto por
# opción (Workbench, rápido). Uso:
# blender --background --python muestrario.py -- <personaje> <hair|clothes> <carpeta> <opción> [opción ...]
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from personajes import PERSONAJES  # noqa: E402

from bl_ext.user_default.mpfb.services import (  # noqa: E402
    AssetService,
    HumanService,
    TargetService,
)

nombre, tipo, carpeta, *opciones = sys.argv[sys.argv.index("--") + 1:]
p = PERSONAJES[nombre]
AssetService.update_all_asset_lists()
os.makedirs(carpeta, exist_ok=True)

for opcion in opciones:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    info = HumanService._create_default_human_info_dict()
    info["phenotype"].update(p["phenotype"])
    ropa = [opcion] if tipo == "clothes" else p["clothes"][:1]
    info.update({
        "eyes": "high-poly.mhclo",
        "eyebrows": (opcion if tipo == "eyebrows" else p["eyebrows"]) + ".mhclo",
        "eyelashes": (opcion if tipo == "eyelashes" else p.get("eyelashes", "eyelashes01")) + ".mhclo",
        "hair": (opcion if tipo == "hair" else p["hair"]) + ".mhclo",
        "skin_mhmat": p["skin"] + ".mhmat",
        "skin_material_type": "GAMEENGINE",
        "eyes_material_type": "GAMEENGINE",
        "clothes_material_type": "GAMEENGINE",
        "clothes": [c + ".mhclo" for c in ropa],
    })
    settings = HumanService.get_default_deserialization_settings()
    settings.update({"subdiv_levels": 0})
    body = HumanService.deserialize_from_dict(info, settings)
    TargetService.bake_targets(body)  # la edad y el sexo son formas: sin esto mide un adulto
    # Solo la piel: la geometría auxiliar de MakeHuman puede quedar más alta.
    piel = body.vertex_groups["body"].index
    top = max((body.matrix_world @ v.co).z for v in body.data.vertices
              if any(g.group == piel and g.weight > 0.5 for g in v.groups))
    cam_data = bpy.data.cameras.new("cam")
    cerca = tipo in ("eyebrows", "eyelashes")
    cam_data.lens = 120 if cerca else 60 if tipo == "hair" else 35
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    if cerca:
        cam.location = (0, -0.9, top - 0.1)
        cam.rotation_euler = (1.5708, 0, 0)
    else:
        cam.location = (0.35, -1.0, top - 0.12) if tipo == "hair" else (0, -2.2, top - 0.45)
        cam.rotation_euler = (1.5708, 0, 0.33 if tipo == "hair" else 0)
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x = 360
    sc.render.resolution_y = 360
    sc.render.filepath = os.path.join(carpeta, f"{nombre}-{opcion}.png")
    bpy.ops.render.render(write_still=True)
    print("FOTO", opcion)
