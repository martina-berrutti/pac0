import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Matrix4, Quaternion, Vector3 } from "three";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const f of process.argv.slice(2)) {
	const doc = await io.read(f);
	const pos = new Map();
	const visit = (n, p) => { const m = p.clone().multiply(new Matrix4().compose(new Vector3(...n.getTranslation()), new Quaternion(...n.getRotation()), new Vector3(...n.getScale()))); pos.set(n.getName(), new Vector3().setFromMatrixPosition(m)); for (const c of n.listChildren()) visit(c, m); };
	for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) visit(n, new Matrix4());
	const y = (k) => pos.get(k).y.toFixed(3);
	console.log(f.split("/").pop(), "Hips", y("Hips"), "Spine2", y("Spine2"), "Neck", y("Neck"), "Head", y("Head"), "LeftShoulder", y("LeftShoulder"), "LeftArm", y("LeftArm"), "LeftEye", y("LeftEye"), "Head-LeftArm", (pos.get("Head").y - pos.get("LeftArm").y).toFixed(3));
}
