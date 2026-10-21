// Materiales más reales para la web (MPFB exporta todo igual, sin relieve).
//
// - Piel: relieve sacado de su propia textura de color (los poros, las líneas
//   y las arrugas pintadas pasan a tener volumen con la luz), brillo suave de
//   piel y un leve terciopelo en los bordes (sheen), como el vello fino.
// - Ojos: húmedos (casi espejo, con una capa brillante encima).
// - Pelo: brillo de pelo, menos plástico.
// - Ropa: mate.
import { KHRMaterialsClearcoat, KHRMaterialsSheen } from "@gltf-transform/extensions";
import sharp from "sharp";

// Mapa de relieve (normal map) desde el color: alto pase del brillo de la
// textura (lo fino: poros, arrugas) y pendiente con Sobel.
export async function relieveDesdeColor(imagen, { fuerza = 2.2, tamano = 2048 } = {}) {
	const base = sharp(Buffer.from(imagen)).resize(tamano, tamano, { fit: "inside" }).greyscale();
	const { data: gris, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
	const { data: borroso } = await base.clone().blur(6).raw().toBuffer({ resolveWithObject: true });
	const { width: w, height: h } = info;
	const alto = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) alto[i] = (gris[i] - borroso[i]) / 255;
	const at = (x, y) => alto[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
	const out = Buffer.alloc(w * h * 3);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
			const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
			let nx = -dx * fuerza;
			let ny = dy * fuerza;
			let nz = 1;
			const l = Math.hypot(nx, ny, nz);
			nx /= l; ny /= l; nz /= l;
			const o = (y * w + x) * 3;
			out[o] = Math.round((nx * 0.5 + 0.5) * 255);
			out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
			out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
		}
	}
	return sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

export async function materialesReales(doc, { pelo = [], ropa = [] } = {}) {
	const sheen = doc.createExtension(KHRMaterialsSheen);
	const clearcoat = doc.createExtension(KHRMaterialsClearcoat);
	for (const mat of doc.getRoot().listMaterials()) {
		const n = mat.getName();
		mat.setMetallicFactor(0);
		if (n.endsWith(".body")) {
			const color = mat.getBaseColorTexture();
			if (color && !mat.getNormalTexture()) {
				const png = await relieveDesdeColor(color.getImage());
				const tex = doc.createTexture(`${n}_relieve`).setImage(new Uint8Array(png)).setMimeType("image/png");
				mat.setNormalTexture(tex).setNormalScale(0.55);
			}
			mat.setRoughnessFactor(0.52);
			mat.setExtension("KHR_materials_sheen", sheen.createSheen()
				.setSheenColorFactor([0.32, 0.2, 0.17])
				.setSheenRoughnessFactor(0.6));
		} else if (n.includes("high-poly") || n.includes("low-poly")) {
			mat.setRoughnessFactor(0.08);
			mat.setExtension("KHR_materials_clearcoat", clearcoat.createClearcoat()
				.setClearcoatFactor(1)
				.setClearcoatRoughnessFactor(0.03));
		} else if (pelo.some((p) => n.includes(p))) {
			mat.setRoughnessFactor(0.42);
			mat.setExtension("KHR_materials_sheen", sheen.createSheen()
				.setSheenColorFactor([0.25, 0.22, 0.2])
				.setSheenRoughnessFactor(0.35));
		} else if (ropa.some((r) => n.includes(r))) {
			mat.setRoughnessFactor(0.88);
		} else if (n.includes("teeth")) {
			mat.setRoughnessFactor(0.25);
		} else if (n.includes("tongue")) {
			mat.setRoughnessFactor(0.3);
		} else {
			mat.setRoughnessFactor(0.6); // cejas, pestañas
		}
	}
}
