// Orienta los huesos como los de Lucía (mpfb.glb) sin mover la malla.
//
// TalkingHead pone cada hueso con un ángulo fijo pensado para la orientación
// de reposo de Lucía. Si un hueso viene girado distinto (el rig "mixamo" de
// MPFB), ese mismo ángulo lo deja en otro lugar: los hombros se suben y se
// inflan. Acá cada hueso toma la rotación local de Lucía, conserva su
// posición, y la matriz de enlace (inverseBindMatrices) se corrige para que
// en reposo la malla quede exactamente igual.
import { Matrix4, Quaternion, Vector3 } from "three";

function localMatrix(node) {
	const [tx, ty, tz] = node.getTranslation();
	const [rx, ry, rz, rw] = node.getRotation();
	const [sx, sy, sz] = node.getScale();
	return new Matrix4().compose(
		new Vector3(tx, ty, tz),
		new Quaternion(rx, ry, rz, rw),
		new Vector3(sx, sy, sz),
	);
}

function worldMatrices(doc) {
	const world = new Map();
	const visit = (node, parent) => {
		const m = parent.clone().multiply(localMatrix(node));
		world.set(node, m);
		for (const child of node.listChildren()) visit(child, m);
	};
	for (const scene of doc.getRoot().listScenes())
		for (const node of scene.listChildren()) visit(node, new Matrix4());
	return world;
}

export function orientarComoLucia(doc, ref) {
	const refRot = new Map(
		ref.getRoot().listNodes().map((n) => [n.getName(), n.getRotation()]),
	);
	const joints = new Set(
		doc.getRoot().listSkins().flatMap((s) => s.listJoints()),
	);
	const oldWorld = worldMatrices(doc);
	const newWorld = new Map(oldWorld);
	let changed = 0;

	// De la raíz hacia afuera: cada hueso necesita la orientación nueva de su
	// padre para calcular la suya.
	const visit = (node) => {
		if (joints.has(node)) {
			const parent = node.getParentNode();
			const parentWorld = parent ? newWorld.get(parent) : new Matrix4();
			const pos = new Vector3();
			const worldRot = new Quaternion();
			oldWorld.get(node).decompose(pos, worldRot, new Vector3());
			const parentRot = new Quaternion();
			parentWorld.decompose(new Vector3(), parentRot, new Vector3());
			const target = refRot.get(node.getName());
			const local = target
				? new Quaternion(...target)
				: parentRot.clone().invert().multiply(worldRot);
			const t = pos.clone().applyMatrix4(parentWorld.clone().invert());
			node.setTranslation([t.x, t.y, t.z]);
			node.setRotation([local.x, local.y, local.z, local.w]);
			node.setScale([1, 1, 1]);
			newWorld.set(node, parentWorld.clone().multiply(localMatrix(node)));
			if (target) changed++;
		}
		for (const child of node.listChildren()) visit(child);
	};
	for (const scene of doc.getRoot().listScenes())
		for (const node of scene.listChildren()) visit(node);

	// Enlace nuevo = inverso(mundo nuevo) · mundo viejo · enlace viejo: en
	// reposo, cada vértice termina en el mismo lugar que antes.
	for (const skin of doc.getRoot().listSkins()) {
		const ibm = skin.getInverseBindMatrices();
		if (!ibm) continue;
		const out = new Float32Array(ibm.getArray().length);
		skin.listJoints().forEach((joint, i) => {
			const old = new Matrix4().fromArray(ibm.getArray(), i * 16);
			const fixed = newWorld
				.get(joint)
				.clone()
				.invert()
				.multiply(oldWorld.get(joint))
				.multiply(old);
			fixed.toArray(out, i * 16);
		});
		ibm.setArray(out);
	}
	return changed;
}
