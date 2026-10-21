#!/usr/bin/env bash
# Genera los pacientes con Blender + MPFB y los deja listos para la web en
# visor/modelos. Uso: ./generar.sh [nombre ...] (sin nombres, todos).
set -euo pipefail
cd "$(dirname "$0")"
BLENDER="${BLENDER:-/c/Users/Usuario/tools/blender-4.5.14-windows-x64/blender.exe}"
TODOS="senor-mayor senora-mayor hombre-adulto mujer-adulta hombre-joven mujer-joven nino nina"
for n in ${@:-$TODOS}; do
	"$BLENDER" --background --python scripts/crear_avatar.py -- "$n" "$(pwd -W 2>/dev/null || pwd)/salida" \
		| grep -E "^(MALLAS|LISTO)|Traceback|Error" || true
	canas=$(python -I -c "import sys; sys.path.insert(0,'scripts'); from personajes import PERSONAJES as P; print(P['$n'].get('canas', 0))")
	cejas=$(python -I -c "import sys; sys.path.insert(0,'scripts'); from personajes import PERSONAJES as P; print(P['$n'].get('cejas', 1))")
	pelo=$(python -I -c "import sys; sys.path.insert(0,'scripts'); from personajes import PERSONAJES as P; print(P['$n']['hair'])")
	ropa=$(python -I -c "import sys; sys.path.insert(0,'scripts'); from personajes import PERSONAJES as P; print(','.join(P['$n']['clothes']))")
	(cd herramientas && node optimizar.mjs "../salida/$n.glb" "../visor/modelos/$n.glb" --canas="$canas" --ropa="$ropa" --pelo="$pelo" --cejas="$cejas" | grep -iE "error|material" || true)
	rm -f "salida/$n.blend1"
done
ls -la visor/modelos
