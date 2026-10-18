// Poses de examen del avatar (Persona 2, sobre el avatar de la Persona 3):
// para la presión el paciente extiende el brazo izquierdo y aparece un
// manguito que se infla con los mmHg del tensiómetro; para la temperatura
// levanta el brazo y después lo baja con el termómetro en la axila. Las
// rotaciones salen de probar con el modelo mpfb.glb; si cambia el modelo,
// hay que volver a calibrarlas.
import type { TalkingHead } from "@met4citizen/talkinghead";

export type ExamPose =
	| { kind: "presion"; mmHg: number }
	| { kind: "temperatura"; step: "levantar" | "midiendo" };

const GESTURES = {
	// Brazo extendido al costado, apenas hacia abajo, con el codo derecho.
	"pac0-presion": {
		"LeftArm.rotation": { x: 0.65, y: 0, z: -0.3 },
		"LeftForeArm.rotation": { x: -0.5, y: 0, z: 0.25 },
	},
	// Brazo pegado al cuerpo, sosteniendo el termómetro (si se suelta, el
	// avatar puede apoyar la mano en la cadera y el termómetro se pierde).
	"pac0-sostener": {
		"LeftArm.rotation": { x: 1.36, y: 0.05, z: -0.04 },
		"LeftForeArm.rotation": { x: 0, y: 0, z: 0.33 },
	},
	// Brazo separado del cuerpo, para poner el termómetro en la axila.
	"pac0-axila": {
		"LeftArm.rotation": { x: 0.85, y: 0.1, z: -0.15 },
		"LeftForeArm.rotation": { x: 0, y: 0, z: 0.3 },
	},
} as const;

const CUFF = "pac0-manguito";
const THERMOMETER = "pac0-termometro";
const MOVE_MS = 700;
// TalkingHead suelta el gesto cuando termina una cara animada o cambia de
// postura en reposo: mientras dura el examen, la pose se vuelve a aplicar.
const REASSERT_MS = 1200;

type Three = typeof import("three");
type State = {
	pose: string | null;
	previousView: string | null;
	timer: ReturnType<typeof setInterval> | null;
};
const states = new WeakMap<TalkingHead, State>();

// three se carga una sola vez (lo usan las poses y examPoint).
let threeModule: Three | null = null;
export async function loadThree() {
	threeModule ??= await import("three");
	return threeModule;
}

export type ExamPoint = "axila" | "brazo";

// Dónde cae en pantalla la axila o la mitad del brazo izquierdo, en píxeles
// dentro del lienzo del avatar. Sirve para soltar el termómetro o el
// manguito "sobre" el paciente aunque se mueva.
export function examPoint(
	h: TalkingHead,
	part: ExamPoint,
	width: number,
	height: number,
) {
	const three = threeModule;
	const arm = h.armature?.getObjectByName("LeftArm");
	const other = h.armature?.getObjectByName(
		part === "brazo" ? "LeftForeArm" : "Spine2",
	);
	if (!three || !arm || !other) return null;
	const a = arm.getWorldPosition(
		new three.Vector3(),
	) as unknown as InstanceType<Three["Vector3"]>;
	const b = other.getWorldPosition(
		new three.Vector3(),
	) as unknown as InstanceType<Three["Vector3"]>;
	// Brazo: casi la mitad entre el hombro y el codo. Axila: un poco hacia
	// el pecho y por debajo del hombro.
	const p = a
		.clone()
		.add(b.sub(a).multiplyScalar(part === "brazo" ? 0.45 : 0.3));
	if (part === "axila") p.y -= 0.09;
	p.project(h.camera);
	return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
}

export type KneeSide = "izquierda" | "derecha";
export type KneeSpot = "interna" | "externa" | "anterior";

// Dónde cae en pantalla un punto de la rodilla de la paciente (px). El hueso
// LeftLeg está en la rodilla; la izquierda de la paciente se ve a la derecha
// de la pantalla (x mundo positivo). Interna: hacia la línea media; externa:
// hacia afuera; anterior: arriba y al frente, donde está la rótula (se
// separa en pantalla de los otros dos).
export function kneePoint(
	h: TalkingHead,
	side: KneeSide,
	spot: KneeSpot,
	width: number,
	height: number,
) {
	const three = threeModule;
	const bone = h.armature?.getObjectByName(
		side === "izquierda" ? "LeftLeg" : "RightLeg",
	);
	if (!three || !bone) return null;
	const p = bone.getWorldPosition(
		new three.Vector3(),
	) as unknown as InstanceType<Three["Vector3"]>;
	// Hacia afuera del cuerpo: +x en la rodilla izquierda, -x en la derecha.
	const out = side === "izquierda" ? 1 : -1;
	if (spot === "interna") p.x -= out * KNEE_SPREAD;
	else if (spot === "externa") p.x += out * KNEE_SPREAD;
	else {
		p.y += KNEE_SPREAD * 0.9;
		p.z += 0.06;
	}
	p.project(h.camera);
	return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
}

const KNEE_SPREAD = 0.06;

// Los huesos del avatar, como objetos de three (talkinghead.d.ts los tipa
// solo para la cámara).
function bones(h: TalkingHead) {
	return h.armature as unknown as ThreeObject | null;
}

function stateOf(h: TalkingHead): State {
	let s = states.get(h);
	if (!s) {
		s = { pose: null, previousView: null, timer: null };
		states.set(h, s);
	}
	return s;
}

function hold(h: TalkingHead, pose: keyof typeof GESTURES) {
	const s = stateOf(h);
	if (s.pose === pose) return;
	h.gestureTemplates[pose] = GESTURES[pose];
	h.playGesture(pose, Number.POSITIVE_INFINITY, false, MOVE_MS);
	s.pose = pose;
	if (s.timer) clearInterval(s.timer);
	s.timer = setInterval(() => {
		if (s.pose === pose)
			h.playGesture(pose, Number.POSITIVE_INFINITY, false, MOVE_MS / 2);
	}, REASSERT_MS);
}

function release(h: TalkingHead) {
	const s = stateOf(h);
	if (s.timer) clearInterval(s.timer);
	s.timer = null;
	if (s.pose) h.stopGesture(MOVE_MS);
	s.pose = null;
}

// El manguito: un cilindro de tela en la mitad del brazo (el eje del hueso es
// su Y), con el tubo hacia el pecho.
function cuff(three: Three, h: TalkingHead) {
	const arm = bones(h)?.getObjectByName("LeftArm");
	if (!arm) return null;
	let c = arm.getObjectByName(CUFF);
	if (!c) {
		const g = new three.Group();
		g.name = CUFF;
		const fabric = new three.MeshStandardMaterial({
			color: 0x4f6f7a,
			roughness: 0.95,
		});
		g.add(
			new three.Mesh(new three.CylinderGeometry(0.052, 0.05, 0.12, 24), fabric),
		);
		const tube = new three.Mesh(
			new three.CylinderGeometry(0.004, 0.004, 0.1, 8),
			new three.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6 }),
		);
		tube.position.set(0.05, 0.02, 0.03);
		tube.rotation.set(0, 0, 1.2);
		g.add(tube);
		g.position.set(0, 0.13, 0);
		arm.add(g);
		c = g;
	}
	return c;
}

// El termómetro digital: un bastoncito blanco con la punta metálica, entre el
// brazo y el pecho.
function thermometer(three: Three, h: TalkingHead) {
	const arm = bones(h)?.getObjectByName("LeftArm");
	if (!arm) return null;
	let t = arm.getObjectByName(THERMOMETER);
	if (!t) {
		const g = new three.Group();
		g.name = THERMOMETER;
		g.add(
			new three.Mesh(
				new three.CylinderGeometry(0.008, 0.009, 0.12, 12),
				new three.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
			),
		);
		const tip = new three.Mesh(
			new three.CylinderGeometry(0.004, 0.004, 0.025, 8),
			new three.MeshStandardMaterial({
				color: 0xb8bcc0,
				roughness: 0.3,
				metalness: 0.8,
			}),
		);
		tip.position.set(0, -0.07, 0);
		g.add(tip);
		// Pantallita gris oscura cerca del extremo visible.
		const screen = new three.Mesh(
			new three.CylinderGeometry(0.0095, 0.0095, 0.03, 12),
			new three.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.4 }),
		);
		screen.position.set(0, 0.02, 0);
		g.add(screen);
		// Entre el brazo y el pecho, asomando hacia adelante (el eje Y del
		// hueso va a lo largo del brazo y el Z hacia el cuerpo).
		g.position.set(-0.09, 0.12, 0.02);
		g.rotation.set(0, 0, -1.1);
		g.scale.set(3, 3, 3);
		arm.add(g);
		t = g;
	}
	return t;
}

function remove(h: TalkingHead, name: string) {
	const arm = bones(h)?.getObjectByName("LeftArm");
	const o = arm?.getObjectByName(name);
	if (arm && o) arm.remove(o);
}

// Aplica la pose del examen; null vuelve a la consulta normal.
export async function applyExamPose(h: TalkingHead, pose: ExamPose | null) {
	const s = stateOf(h);
	if (!pose) {
		release(h);
		remove(h, CUFF);
		remove(h, THERMOMETER);
		if (s.previousView) h.setView(s.previousView);
		s.previousView = null;
		return;
	}
	const three = await loadThree();
	if (s.previousView === null) s.previousView = h.viewName;
	// Plano medio: entran la cara y el brazo extendido o levantado.
	if (h.viewName !== "mid") h.setView("mid");
	if (pose.kind === "presion") {
		remove(h, THERMOMETER);
		hold(h, "pac0-presion");
		const c = cuff(three, h);
		// Se hincha hasta un 30% más a 300 mmHg.
		const swell = 1 + (Math.min(300, Math.max(0, pose.mmHg)) / 300) * 0.3;
		c?.scale.set(swell, 1, swell);
		return;
	}
	remove(h, CUFF);
	if (pose.step === "levantar") {
		hold(h, "pac0-axila");
		remove(h, THERMOMETER);
	} else {
		hold(h, "pac0-sostener");
		thermometer(three, h);
	}
}
