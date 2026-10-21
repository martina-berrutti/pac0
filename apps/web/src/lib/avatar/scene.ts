// Luz de estudio para los avatares nuevos (avatares/visor/escena.mjs):
// TalkingHead trae una luz azulada fuerte y un ambiente blanco parejo que
// los deja pálidos. Acá: principal cálida de frente y arriba, relleno suave
// del otro lado y contorno frío por detrás, como en una foto. Además, bordes
// suaves en el pelo y las pestañas.
import type { TalkingHead } from "@met4citizen/talkinghead";

const STUDIO = {
	lightAmbientColor: 0xffeee2,
	lightAmbientIntensity: 0.55,
	lightDirectColor: 0xfff1e2,
	lightDirectIntensity: 9,
	lightDirectPhi: 0.95,
	lightDirectTheta: 1.85,
	lightSpotIntensity: 10,
	lightSpotColor: 0xdbe6ff,
	lightSpotPhi: 0.35,
	lightSpotTheta: 4.4,
	lightSpotDispersion: 1,
};

type Material = {
	alphaTest: number;
	alphaToCoverage: boolean;
	needsUpdate: boolean;
};
type Node = { isMesh?: boolean; material?: Material | Material[] };
// Lo que TalkingHead tiene y talkinghead.d.ts no declara.
type Lit = {
	setLighting(opt: Record<string, unknown>): void;
	scene: { environmentIntensity: number; add(o: unknown): void };
	renderer: { toneMappingExposure: number };
	armature: { traverse(fn: (o: Node) => void): void } | null;
};

export async function studioLight(h: TalkingHead) {
	const head = h as unknown as Lit;
	const { DirectionalLight } = (await import("three")) as unknown as {
		DirectionalLight: new (
			color: number,
			intensity: number,
		) => { position: { set(x: number, y: number, z: number): void } };
	};
	head.setLighting(STUDIO);
	head.scene.environmentIntensity = 0.55;
	head.renderer.toneMappingExposure = 1.05;
	const fill = new DirectionalLight(0xffe6d6, 1.4);
	fill.position.set(-2, 1.5, 2.5);
	head.scene.add(fill);
	head.armature?.traverse((o) => {
		if (!o.isMesh || !o.material) return;
		for (const m of [o.material].flat()) {
			if (m.alphaTest > 0) {
				m.alphaToCoverage = true;
				m.needsUpdate = true;
			}
		}
	});
}
