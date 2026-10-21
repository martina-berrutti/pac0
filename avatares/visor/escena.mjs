// Luz de estudio para que los avatares no se vean pálidos ni planos.
// TalkingHead trae una luz azulada fuerte y un ambiente blanco parejo. Acá:
// luz principal cálida de frente y arriba, relleno suave y una luz de
// contorno fría por detrás que separa la cabeza del fondo, como en una foto.
// También bordes suaves en el pelo y las pestañas (en vez de recortes duros).
import * as THREE from "three";

export const LUZ_ORIGINAL = {
	lightAmbientColor: 0xffffff, lightAmbientIntensity: 2,
	lightDirectColor: 0x8888aa, lightDirectIntensity: 30, lightDirectPhi: 1, lightDirectTheta: 2,
	lightSpotIntensity: 0,
};

export const LUZ_ESTUDIO = {
	lightAmbientColor: 0xffeee2, lightAmbientIntensity: 0.55,
	lightDirectColor: 0xfff1e2, lightDirectIntensity: 9, lightDirectPhi: 0.95, lightDirectTheta: 1.85,
	lightSpotIntensity: 10, lightSpotColor: 0xdbe6ff, lightSpotPhi: 0.35, lightSpotTheta: 4.4, lightSpotDispersion: 1,
};

export function luzDeEstudio(head, prendida = true) {
	head.setLighting(prendida ? LUZ_ESTUDIO : LUZ_ORIGINAL);
	head.scene.environmentIntensity = prendida ? 0.55 : 1;
	head.renderer.toneMappingExposure = prendida ? 1.05 : 1;
	// Relleno desde el otro lado (más suave que la principal).
	if (!head._relleno) {
		head._relleno = new THREE.DirectionalLight(0xffe6d6, 0);
		head._relleno.position.set(-2, 1.5, 2.5);
		head.scene.add(head._relleno);
	}
	head._relleno.intensity = prendida ? 1.4 : 0;
	// Pelo, cejas y pestañas: borde suave con el antialias de la tarjeta.
	head.armature?.traverse((o) => {
		if (!o.isMesh) return;
		for (const m of [o.material].flat()) {
			if (m.alphaTest > 0) {
				m.alphaToCoverage = prendida;
				m.needsUpdate = true;
			}
		}
	});
}
