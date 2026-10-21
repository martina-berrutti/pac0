# Saca una foto de la cabeza desde Blender (motor Workbench, rápido).
# Uso: blender --background archivo.blend --python foto.py -- salida.png
import sys, bpy
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]
body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
top = max((body.matrix_world @ v.co).z for v in body.data.vertices)
cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 85
cam = bpy.data.objects.new("cam", cam_data); bpy.context.scene.collection.objects.link(cam)
cam.location = (0, -0.9, top - 0.12); cam.rotation_euler = (1.5708, 0, 0)
sc = bpy.context.scene; sc.camera = cam
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = 600; sc.render.resolution_y = 600
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
