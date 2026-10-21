// Hacia dónde apunta cada hueso de brazos y piernas de Lucía en reposo, en
// coordenadas de Blender (Z hacia arriba). crear_avatar.py pone a cada
// paciente en esa misma postura antes de exportar.
// Uso: node direcciones.mjs lucia.glb salida.json
import { writeFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Matrix4, Quaternion, Vector3 } from "three";

const CADENAS = [];
for (const lado of ["Left", "Right"])
	CADENAS.push(
		[`${lado}Shoulder`, `${lado}Arm`],
		[`${lado}Arm`, `${lado}ForeArm`],
		[`${lado}ForeArm`, `${lado}Hand`],
		[`${lado}Hand`, `${lado}HandMiddle1`],
		[`${lado}UpLeg`, `${lado}Leg`],
		[`${lado}Leg`, `${lado}Foot`],
		[`${lado}Foot`, `${lado}ToeBase`],
	);

const [input, output] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(input);
const pos = new Map();
const visit = (node, parent) => {
	const m = parent.clone().multiply(new Matrix4().compose(
		new Vector3(...node.getTranslation()), new Quaternion(...node.getRotation()), new Vector3(...node.getScale())));
	pos.set(node.getName(), new Vector3().setFromMatrixPosition(m));
	for (const c of node.listChildren()) visit(c, m);
};
for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) visit(n, new Matrix4());
const out = {};
for (const [bone, child] of CADENAS) {
	const d = pos.get(child).clone().sub(pos.get(bone)).normalize();
	out[bone] = { hacia: child, dir: [d.x, -d.z, d.y] };
}
writeFileSync(output, JSON.stringify(out, null, 2));
console.log(Object.keys(out).length, "direcciones");
