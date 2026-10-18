// Lo que usan las poses de examen del avatar (lib/avatar/exam-poses.ts) y que
// no está en talkinghead.d.ts: los gestos propios y la vista. Los huesos
// (armature) los declara ese archivo; acá se los trata como ThreeObject.
// Se suma a esas declaraciones sin cambiarlas.

declare module "@met4citizen/talkinghead" {
	interface TalkingHead {
		gestureTemplates: Record<string, Record<string, unknown>>;
		viewName: string;
		lookAtCamera(ms: number): void;
	}
}

// Lo mínimo de three para armar el manguito y el termómetro.
interface ThreeObject {
	name: string;
	visible: boolean;
	position: { set(x: number, y: number, z: number): void };
	rotation: { set(x: number, y: number, z: number): void };
	scale: { set(x: number, y: number, z: number): void };
	add(...objects: ThreeObject[]): void;
	remove(...objects: ThreeObject[]): void;
	getObjectByName(name: string): ThreeObject | undefined;
}

declare module "three" {
	export class Group implements ThreeObject {
		name: string;
		visible: boolean;
		position: ThreeObject["position"];
		rotation: ThreeObject["rotation"];
		scale: ThreeObject["scale"];
		add(...objects: ThreeObject[]): void;
		remove(...objects: ThreeObject[]): void;
		getObjectByName(name: string): ThreeObject | undefined;
	}
	export class Mesh extends Group {
		constructor(geometry: unknown, material: unknown);
	}
	export class Vector3 {
		constructor(x?: number, y?: number, z?: number);
		x: number;
		y: number;
		z: number;
		clone(): Vector3;
		add(v: Vector3): Vector3;
		sub(v: Vector3): Vector3;
		multiplyScalar(s: number): Vector3;
		set(x: number, y: number, z: number): Vector3;
		normalize(): Vector3;
		copy(v: Vector3): Vector3;
		project(camera: unknown): Vector3;
	}
	export class CylinderGeometry {
		constructor(
			radiusTop: number,
			radiusBottom: number,
			height: number,
			radialSegments?: number,
		);
	}
	export class SphereGeometry {
		constructor(
			radius: number,
			widthSegments?: number,
			heightSegments?: number,
		);
	}
	export class MeshStandardMaterial {
		constructor(params: {
			color: number;
			roughness?: number;
			metalness?: number;
		});
	}
}
