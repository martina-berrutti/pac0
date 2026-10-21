# Instala los paquetes CC0 de MakeHuman en la carpeta de datos de MPFB.
# Uso: blender --background --python instalar_paquetes.py -- <carpeta con zips>
import sys, os, zipfile, glob
from bl_ext.user_default.mpfb.services import LocationService

folder = sys.argv[sys.argv.index("--") + 1]
data = LocationService.get_user_data()
print("DATOS MPFB:", data)
for z in sorted(glob.glob(os.path.join(folder, "*.zip"))):
    with zipfile.ZipFile(z) as f:
        f.extractall(data)
    print("instalado", os.path.basename(z))
