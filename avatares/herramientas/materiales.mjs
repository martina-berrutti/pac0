import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const f of process.argv.slice(2)) {
	const doc = await io.read(f);
	console.log("==", f);
	for (const m of doc.getRoot().listMaterials())
		console.log(m.getName().padEnd(34), m.getAlphaMode(), m.getAlphaCutoff(), "base", m.getBaseColorFactor().map((x) => x.toFixed(2)).join(","), "tex", m.getBaseColorTexture()?.getName() ?? "-", "normal", m.getNormalTexture()?.getName() ?? "-", "ds", m.getDoubleSided());
}
