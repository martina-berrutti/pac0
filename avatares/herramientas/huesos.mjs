import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const f of process.argv.slice(2)) {
	const doc = await io.read(f);
	console.log("==", f);
	for (const n of doc.getRoot().listNodes())
		if (["Armature", "Hips", "Spine", "Neck", "Head", "LeftArm", "LeftForeArm", "LeftEye", "LeftUpLeg"].includes(n.getName()))
			console.log(n.getName().padEnd(12), "t", n.getTranslation().map((x) => x.toFixed(3)).join(","), "r", n.getRotation().map((x) => x.toFixed(3)).join(","), "s", n.getScale().map((x) => x.toFixed(2)).join(","));
}
