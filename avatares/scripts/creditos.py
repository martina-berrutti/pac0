# Rehace la tabla de CREDITOS.md a partir de personajes.py.
import re
import sys

sys.path.insert(0, "scripts")
from personajes import PERSONAJES  # noqa: E402

filas = "\n".join(
    f"| {n} | {x['skin']} | {x['hair']}{' (con canas)' if x.get('canas') else ''} | {', '.join(x['clothes'])} |"
    for n, x in PERSONAJES.items())
texto = open("CREDITOS.md", encoding="utf-8").read()
cabecera = "| Paciente | Piel | Pelo | Ropa |\n|---|---|---|---|\n"
inicio = texto.index(cabecera) + len(cabecera)
fin = inicio
for linea in texto[inicio:].splitlines(keepends=True):
    if not linea.startswith("|"):
        break
    fin += len(linea)
open("CREDITOS.md", "w", encoding="utf-8", newline="").write(texto[:inicio] + filas + "\n" + texto[fin:])
print("tabla actualizada")
