# Crea un paciente con MPFB y lo exporta como GLB listo para TalkingHead:
# esqueleto con nombres de Mixamo (sin "mixamorig:"), huesos de los ojos, las
# 52 caras de ARKit y los 15 visemas de Oculus.
# Uso: blender --background --factory-startup --python crear_avatar.py -- <nombre> <carpeta de salida>
import json
import os
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(__file__))
from personajes import PERSONAJES  # noqa: E402

from bl_ext.user_default.mpfb.entities.clothes.mhclo import Mhclo  # noqa: E402
from bl_ext.user_default.mpfb.services import (  # noqa: E402
    AssetService,
    ClothesService,
    FaceService,
    HumanService,
    LocationService,
    RigService,
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
    # Las de Lucía: suaves (las eyelashes01 son negras y en punta).
    "eyelashes": p.get("eyelashes", "mindfront_eyelashes_02") + ".mhclo",
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

# Pesos de la piel del rig "default" de MPFB, sumados en los huesos de
# Mixamo: los del rig "mixamo" inflan los hombros al bajar los brazos.
# clavícula + hombro → LeftShoulder, brazo en dos partes → LeftArm, etc.
DEDOS = {"1": "Thumb", "2": "Index", "3": "Middle", "4": "Ring", "5": "Pinky"}


def hueso_mixamo(g):
    nombre, _, lado = g.partition(".")
    s = {"L": "Left", "R": "Right"}.get(lado, "")
    if g in ("root", "pelvis.L", "pelvis.R"):
        return "Hips"
    if g in ("spine05", "spine04"):
        return "Spine"
    if g == "spine03":
        return "Spine1"
    if g in ("spine02", "spine01") or nombre == "breast":
        return "Spine2"
    if g in ("neck01", "neck02"):
        return "Neck"
    if nombre in ("clavicle", "shoulder01"):
        return s + "Shoulder"
    if nombre.startswith("upperarm"):
        return s + "Arm"
    if nombre.startswith("lowerarm"):
        return s + "ForeArm"
    if nombre == "wrist" or nombre.startswith("metacarpal"):
        return s + "Hand"
    if nombre.startswith("finger"):
        dedo, _, falange = nombre[6:].partition("-")
        return f"{s}Hand{DEDOS[dedo]}{falange}"
    if nombre.startswith("upperleg"):
        return s + "UpLeg"
    if nombre.startswith("lowerleg"):
        return s + "Leg"
    if nombre == "foot":
        return s + "Foot"
    if nombre.startswith("toe"):
        return s + "ToeBase"
    return "Head"  # neck03, cabeza, mandíbula, ojos y músculos de la cara


rig = body.parent
for g in [g for g in body.vertex_groups if g.name.startswith("mixamorig:")]:
    body.vertex_groups.remove(g)
default_weights = os.path.join(
    LocationService.get_mpfb_data("rigs"), "standard", "weights.default.json")
with open(default_weights, encoding="utf-8") as f:
    pesos = json.load(f)["weights"]
sumados = {}
for g, lista in pesos.items():
    destino = sumados.setdefault("mixamorig:" + hueso_mixamo(g), {})
    for idx, w in lista:
        destino[idx] = destino.get(idx, 0.0) + w
for nombre_g, verts in sumados.items():
    vg = body.vertex_groups.new(name=nombre_g)
    for idx, w in verts.items():
        if idx < len(body.data.vertices):
            vg.add([idx], min(1.0, w), "REPLACE")
# Ropa, pelo, ojos y dientes toman los pesos nuevos del cuerpo.
for o in [o for o in bpy.data.objects if o.type == "MESH" and o != body]:
    mhclo_path = ClothesService.find_clothes_absolute_path(o)
    if not mhclo_path:
        continue
    for g in [g for g in o.vertex_groups if g.name.startswith("mixamorig:")]:
        o.vertex_groups.remove(g)
    mhclo = Mhclo()
    mhclo.load(mhclo_path)
    ClothesService.interpolate_weights(body, o, rig, mhclo)

# Brazos y piernas en la misma postura de reposo que Lucía: TalkingHead mueve
# los huesos con ángulos pensados para esa postura (si no, los hombros se
# suben y se inflan). Va antes de las caras: fijar la postura borra las formas.
rig = body.parent
REF = os.path.join(os.path.dirname(__file__), "..", "referencia",
                   "direcciones-lucia.json")
with open(REF, encoding="utf-8") as f:
    direcciones = json.load(f)
bpy.context.view_layer.objects.active = rig
for o in bpy.data.objects:
    o.select_set(o == rig)
# La clavícula de MPFB arranca 6 cm por encima del hombro; la de Lucía, a la
# misma altura. TalkingHead la pone horizontal, como la de Lucía: sin esto,
# levanta el hombro y queda encogido e inflado.
bpy.ops.object.mode_set(mode="EDIT")
for lado in ("Left", "Right"):
    clavicula = rig.data.edit_bones[f"mixamorig:{lado}Shoulder"]
    clavicula.head.z = rig.data.edit_bones[f"mixamorig:{lado}Arm"].head.z
bpy.ops.object.mode_set(mode="POSE")
world = rig.matrix_world
for bone, ref in direcciones.items():  # el orden va del hombro a la mano
    pb = rig.pose.bones["mixamorig:" + bone]
    child = rig.pose.bones["mixamorig:" + ref["hacia"]]
    bpy.context.view_layer.update()
    head = world @ pb.head
    actual = (world @ child.head) - head
    giro = actual.normalized().rotation_difference(Vector(ref["dir"]))
    m = pb.matrix.copy()
    pb.matrix = (Matrix.Translation(pb.head) @ giro.to_matrix().to_4x4()
                 @ Matrix.Translation(-pb.head) @ m)
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")
RigService.apply_pose_as_rest_pose(rig)

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

# Que nada atraviese la ropa: lo que va debajo (el cuerpo y las prendas
# anteriores de la lista) se mete unos milímetros donde lo tapa cada prenda.
# Se mueve igual en todas las formas de la cara, para no deformarlas.
MARGEN = 0.004
CERCA = 0.025
depsgraph = bpy.context.evaluated_depsgraph_get()
prendas = [next(o for o in meshes if o.name.endswith("." + c))
           for c in p["clothes"]]


def empujar_adentro(abajo, arriba):
    # Por cada vértice se mira en línea recta desde afuera (por su normal): si
    # la prenda está en esa línea, el vértice tiene que quedar detrás de ella.
    # Lo que la prenda no tapa (el cuello arriba del borde) no se toca.
    bvh = BVHTree.FromObject(arriba, depsgraph)
    a_inv = arriba.matrix_world.inverted()
    b_mw = abajo.matrix_world
    b_inv = b_mw.inverted_safe()
    a_mw = arriba.matrix_world
    keys = abajo.data.shape_keys.key_blocks if abajo.data.shape_keys else []
    movidos = 0
    prenda_abajo = abajo != body
    for v in abajo.data.vertices:
        punto = a_inv @ (b_mw @ v.co)
        # Una prenda de abajo (el pantalón bajo el buzo) también se mete donde
        # queda pegada a la de arriba aunque no la tape de frente.
        if prenda_abajo:
            cerca, normal, _, _ = bvh.find_nearest(punto, CERCA)
            if cerca is not None and (punto - cerca).dot(normal) > -MARGEN:
                d = (punto - cerca).dot(normal)
                delta = b_inv @ (a_mw @ (punto - normal * (d + MARGEN))) - v.co
                v.co += delta
                for k in keys:
                    k.data[v.index].co += delta
                movidos += 1
                continue
        n = (a_inv.to_3x3() @ (b_mw.to_3x3() @ v.normal)).normalized()
        desde = punto + n * CERCA
        hit, _, _, h = bvh.ray_cast(desde, -n, 2 * CERCA)
        if hit is None:
            continue
        # El vértice está a CERCA del origen; tiene que quedar a h + MARGEN.
        if CERCA < h + MARGEN:
            nuevo = b_inv @ (a_mw @ (desde - n * (h + MARGEN)))
            delta = nuevo - v.co
            v.co += delta
            for k in keys:
                k.data[v.index].co += delta
            movidos += 1
    return movidos


for i, prenda in enumerate(prendas):
    if "shoe" in prenda.name or "flats" in prenda.name or "boots" in prenda.name:
        continue
    for abajo in [body, *prendas[:i]]:
        print("ADENTRO", abajo.name, "bajo", prenda.name, empujar_adentro(abajo, prenda))

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
