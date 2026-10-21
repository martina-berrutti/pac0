// Achica un GLB de MPFB para la web, como mpfb.glb de Lucía: sin lo que no
// se usa, mallas con meshopt y texturas WebP de 1024 (la piel, 2048).
// Uso: node optimizar.mjs entrada.glb salida.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
	"meshopt.decoder": MeshoptDecoder,
	"meshopt.encoder": MeshoptEncoder,
});
const doc = await io.read(input);
// TalkingHead busca el esqueleto por nombre: tiene que llamarse "Armature".
const rig = process.env.RIG ?? input.split(/[\/]/).pop().replace(/\.glb$/, "");
for (const node of doc.getRoot().listNodes())
	if (node.getName() === rig) node.setName("Armature");
await doc.transform(prune(), dedup());
// Blender exporta todo como transparente (BLEND) y el navegador lo dibuja en
// mal orden: se ve a través de la cara. Como en Lucía, opaco salvo lo que
// tiene recortes (pelo, pestañas, cejas, ojos), que va con máscara.
for (const mat of doc.getRoot().listMaterials()) {
	const tex = mat.getBaseColorTexture();
	let cut = false;
	if (tex) {
		const { channels } = await sharp(Buffer.from(tex.getImage())).stats();
		cut = channels.length === 4 && channels[3].min < 200;
	}
	const hair = /hair|ponytail|braid|bob\d|short\d|long\d|afro/i.test(mat.getName());
	mat.setAlphaMode(cut ? "MASK" : "OPAQUE").setAlphaCutoff(hair ? 0.3 : 0.5);
	console.log("material", mat.getName(), mat.getAlphaMode());
}
// --canas=0.8: el pelo pasa a gris (0 nada, 1 blanco). En Blender se hacía
// con nodos que no viajan en el GLB, así que se tiñe la textura.
const canas = Number(process.argv.find((a) => a.startsWith("--canas="))?.slice(8) ?? 0);
const hairTextures = new Set();
for (const mat of doc.getRoot().listMaterials())
	if (/hair|ponytail|braid|bob|short|long|afro/i.test(mat.getName()) && mat.getBaseColorTexture())
		hairTextures.add(mat.getBaseColorTexture());
doc.createExtension(EXTTextureWebP).setRequired(true);
for (const tex of doc.getRoot().listTextures()) {
	const name = `${tex.getName()} ${tex.getURI()}`.toLowerCase();
	const skin = /body|skin|diffuse/.test(name) && !/normal/.test(name);
	const max = skin ? 2048 : 1024;
	// Primero a PNG: algunas texturas de MakeHuman traen un espacio de color
	// que la conversión directa a WebP no acepta.
	let png = await sharp(Buffer.from(tex.getImage())).png().toBuffer();
	if (canas > 0 && hairTextures.has(tex))
		png = await sharp(png)
			.modulate({ saturation: 1 - canas, brightness: 1 + canas * 1.2 })
			.png()
			.toBuffer();
	const img = await sharp(png)
		.resize(max, max, { fit: "inside", withoutEnlargement: true })
		.webp({ quality: 82 })
		.toBuffer();
	tex.setImage(new Uint8Array(img)).setMimeType("image/webp");
}
if (!process.argv.includes("--sin-meshopt"))
	await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(output, doc);
