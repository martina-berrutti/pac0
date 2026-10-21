# Baja los brazos (como la postura de TalkingHead) y saca una foto del torso.
# Uso: blender --background archivo.blend --python foto_brazos.py -- salida.png
import sys, math, bpy
from mathutils import Matrix, Vector
out = sys.argv[sys.argv.index("--") + 1]
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
for side, sign in (("Left", 1), ("Right", -1)):
    pb = rig.pose.bones[side + "Arm"]
    bpy.context.view_layer.update()
    giro = Matrix.Rotation(math.radians(0), 4, "Y")
    pb.matrix = Matrix.Translation(pb.head) @ giro @ Matrix.Translation(-pb.head) @ pb.matrix
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")
body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
top = max((body.matrix_world @ v.co).z for v in body.data.vertices)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = 50
bpy.context.scene.collection.objects.link(cam)
cam.location = (0, -1.3, top - 0.45); cam.rotation_euler = (1.5708, 0, 0)
sc = bpy.context.scene; sc.camera = cam
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = 500; sc.render.resolution_y = 420; sc.render.filepath = out
bpy.ops.render.render(write_still=True)
