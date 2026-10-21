# Crea un paciente con MPFB y lo exporta como GLB listo para TalkingHead:
# esqueleto con nombres de Mixamo (sin "mixamorig:"), huesos de los ojos, las
# 52 caras de ARKit y los 15 visemas de Oculus.
# Uso: blender --background --factory-startup --python crear_avatar.py -- <nombre> <carpeta de salida>
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from personajes import PERSONAJES  # noqa: E402

from bl_ext.user_default.mpfb.services import (  # noqa: E402
    AssetService,
    FaceService,
    HumanService,
    TargetService,
)

nombre, salida = sys.argv[sys.argv.index("--") + 1:][:2]
p = PERSONAJES[nombre]
AssetService.update_all_asset_lists()

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)

info = HumanService._create_default_human_info_dict()
info["phenotype"].update(p["phenotype"])
info.update({
    "name": nombre,
    "rig": "mixamo",
    "eyes": "high-poly.mhclo",
    "eyebrows": p["eyebrows"] + ".mhclo",
    "eyelashes": "eyelashes01.mhclo",
    "teeth": "teeth_base.mhclo",
    "tongue": "tongue01.mhclo",
    "hair": p["hair"] + ".mhclo",
    "skin_mhmat": p["skin"] + ".mhmat",
    "skin_material_type": "GAMEENGINE",
    "eyes_material_type": "GAMEENGINE",
    "clothes_material_type": "GAMEENGINE",
    "clothes": [c + ".mhclo" for c in p["clothes"]],
})
settings = HumanService.get_default_deserialization_settings()
settings.update({"subdiv_levels": 0, "mask_helpers": True})
body = HumanService.deserialize_from_dict(info, settings)

# La forma del cuerpo (edad, sexo, peso) queda fija en la malla: si no, viaja
# como 9 formas de modelado más.
TargetService.bake_targets(body)

# Caras para hablar y gesticular, pasadas también a dientes, lengua, cejas...
FaceService.load_targets(body, load_microsoft_visemes=False,
                         load_meta_visemes=True, load_arkit_faceunits=True)
FaceService.interpolate_targets(body)

rig = body.parent
meshes = [o for o in bpy.data.objects if o.type == "MESH"]


def in_group(v, index):
    return any(g.group == index and g.weight > 0.5 for g in v.groups)


# Sin lo que ocultaban los modificadores: la geometría auxiliar de MakeHuman
# y el cuerpo que queda debajo de la ropa (así no atraviesa la tela).
bpy.context.view_layer.objects.active = body
for o in bpy.data.objects:
    o.select_set(o == body)
masks = [(body.vertex_groups[m.vertex_group].index, m.invert_vertex_group)
         for m in body.modifiers
         if m.type == "MASK" and m.vertex_group in body.vertex_groups]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="DESELECT")
bpy.ops.object.mode_set(mode="OBJECT")
for v in body.data.vertices:
    v.select = any(in_group(v, i) == invert for i, invert in masks)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.delete(type="VERT")
bpy.ops.object.mode_set(mode="OBJECT")
for m in list(body.modifiers):
    if m.type == "MASK":
        body.modifiers.remove(m)

# Nombres de huesos como los de Lucía (TalkingHead busca Hips, Head, LeftEye...).
for b in rig.data.bones:
    b.name = b.name.replace("mixamorig:", "")
for o in meshes:
    for g in o.vertex_groups:
        g.name = g.name.replace("mixamorig:", "")

# Huesos de los ojos: en el centro de cada globo ocular, colgando de Head.
eyes = next(o for o in meshes if "high-poly" in o.name)
mw = eyes.matrix_world
left = [mw @ v.co for v in eyes.data.vertices if (mw @ v.co).x > 0]
right = [mw @ v.co for v in eyes.data.vertices if (mw @ v.co).x <= 0]
center = {
    "LeftEye": sum(left, Vector()) / len(left),
    "RightEye": sum(right, Vector()) / len(right),
}
bpy.context.view_layer.objects.active = rig
for o in bpy.data.objects:
    o.select_set(o == rig)
bpy.ops.object.mode_set(mode="EDIT")
inv = rig.matrix_world.inverted()
for name, c in center.items():
    bone = rig.data.edit_bones.new(name)
    bone.head = inv @ c
    bone.tail = inv @ (c + Vector((0, -0.03, 0)))
    bone.parent = rig.data.edit_bones["Head"]
bpy.ops.object.mode_set(mode="OBJECT")
for g in list(eyes.vertex_groups):
    eyes.vertex_groups.remove(g)
for name, side in (("LeftEye", 1), ("RightEye", -1)):
    g = eyes.vertex_groups.new(name=name)
    g.add([v.index for v in eyes.data.vertices
           if ((mw @ v.co).x > 0) == (side > 0)], 1.0, "REPLACE")


print("MALLAS", [(o.name, len(o.data.vertices),
                  len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0)
                 for o in meshes])
print("HUESOS", len(rig.data.bones))

os.makedirs(salida, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(salida, nombre + ".blend"))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(salida, nombre + ".glb"),
    export_format="GLB",
    export_morph=True,
    export_morph_normal=False,
    export_skins=True,
    export_animations=False,
    export_apply=False,
    export_yup=True,
    export_image_format="JPEG",
    export_jpeg_quality=85,
)
print("LISTO", nombre)
