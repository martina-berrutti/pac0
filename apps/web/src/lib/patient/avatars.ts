// Quién viene a la consulta (Persona 3): el avatar 3D, el nombre, la edad y
// el sexo se sortean al empezar, dentro de lo que el caso permite (campo
// patients). Lo clínico no cambia: solo la persona. Los nombres son de pila
// comunes en Uruguay, inventados; no son de nadie.
import type { ClinicalCase } from "@/cases/schema";

export type AvatarInfo = {
	id: string;
	sex: "f" | "m";
	// Edades que aparenta el modelo.
	ages: [number, number];
};

// Los modelos están en public/avatar/personas (avatares/ en el repo).
export const AVATARS: AvatarInfo[] = [
	{ id: "nina", sex: "f", ages: [5, 12] },
	{ id: "nino", sex: "m", ages: [5, 12] },
	{ id: "mujer-joven", sex: "f", ages: [13, 29] },
	{ id: "hombre-joven", sex: "m", ages: [13, 29] },
	{ id: "mujer-adulta", sex: "f", ages: [30, 59] },
	{ id: "hombre-adulto", sex: "m", ages: [30, 59] },
	{ id: "senora-mayor", sex: "f", ages: [60, 99] },
	{ id: "senor-mayor", sex: "m", ages: [60, 99] },
];

export function avatarUrl(id: string | undefined) {
	return AVATARS.some((a) => a.id === id)
		? `/avatar/personas/${id}.glb`
		: "/avatar/mpfb.glb";
}

const NAMES = {
	f: {
		joven: [
			"Valentina",
			"Camila",
			"Sofía",
			"Martina",
			"Agustina",
			"Micaela",
			"Julieta",
			"Florencia",
			"Lucía",
		],
		adulta: [
			"Carolina",
			"Natalia",
			"Paula",
			"Lorena",
			"Marina",
			"Romina",
			"Valeria",
			"Andrea",
			"Verónica",
		],
		mayor: ["Graciela", "Rosa", "Carmen", "Mirta", "Elena", "Beatriz", "Nelly"],
		nina: ["Emma", "Isabella", "Olivia", "Zoe", "Catalina"],
	},
	m: {
		joven: [
			"Mateo",
			"Joaquín",
			"Santiago",
			"Bruno",
			"Facundo",
			"Nicolás",
			"Agustín",
			"Thiago",
		],
		adulta: [
			"Martín",
			"Federico",
			"Diego",
			"Gonzalo",
			"Pablo",
			"Andrés",
			"Marcelo",
			"Fernando",
		],
		mayor: ["Jorge", "Raúl", "Héctor", "Alberto", "Walter", "Óscar", "Rubén"],
		nina: ["Benjamín", "Lorenzo", "Felipe", "Bautista", "Juan"],
	},
} as const;

function nameBand(age: number) {
	if (age < 13) return "nina";
	if (age < 30) return "joven";
	if (age < 60) return "adulta";
	return "mayor";
}

export type SessionPatient = {
	avatar: string;
	name: string;
	age: number;
	sex: "f" | "m";
};

function pick<T>(items: readonly T[], rand: () => number): T {
	return items[Math.floor(rand() * items.length)] as T;
}

// El avatar que mejor le queda a una edad y un sexo.
function avatarFor(sex: "f" | "m" | undefined, age: number) {
	return (
		AVATARS.find(
			(a) => (!sex || a.sex === sex) && age >= a.ages[0] && age <= a.ages[1],
		) ??
		AVATARS.find(
			(a) => a.id === (sex === "m" ? "hombre-adulto" : "mujer-adulta"),
		)
	);
}

export function pickPatient(
	c: ClinicalCase,
	rand: () => number = Math.random,
): SessionPatient {
	const options = c.patients;
	if (!options) {
		// Casos generados: la persona del caso, con el avatar que le queda.
		const a = avatarFor(c.patient.sex, c.patient.age);
		return {
			avatar: a?.id ?? "mujer-adulta",
			name: c.patient.name,
			age: c.patient.age,
			sex: c.patient.sex ?? a?.sex ?? "f",
		};
	}
	const chosen = pick(options.avatars, rand);
	const avatar =
		AVATARS.find((a) => a.id === chosen) ??
		avatarFor(c.patient.sex, options.age[0]) ??
		(AVATARS[0] as AvatarInfo);
	// La edad, dentro del rango del caso y de lo que aparenta el avatar.
	const lo = Math.max(options.age[0], avatar.ages[0]);
	const hi = Math.max(lo, Math.min(options.age[1], avatar.ages[1]));
	const age = lo + Math.floor(rand() * (hi - lo + 1));
	const name = pick(NAMES[avatar.sex][nameBand(age)], rand);
	return { avatar: avatar.id, name, age, sex: avatar.sex };
}

// El caso con la persona que vino: nombre, edad, sexo y los textos que
// cambian con el sexo. El diagnóstico y el examen quedan iguales.
export function withPatient(
	c: ClinicalCase,
	p: SessionPatient | undefined,
): ClinicalCase {
	if (!p) return c;
	const other = c.patients?.otroSexo;
	const swap =
		c.patient.sex !== undefined && p.sex !== c.patient.sex ? other : undefined;
	return {
		...c,
		patient: {
			...c.patient,
			name: p.name,
			age: p.age,
			sex: p.sex,
			occupation: swap?.occupation ?? c.patient.occupation,
		},
		chiefComplaint: swap?.chiefComplaint ?? c.chiefComplaint,
		profile: {
			...c.profile,
			...swap?.profile,
			...(c.profile.edad ? { edad: `${p.age} años` } : {}),
		},
		hiddenHistory: { ...c.hiddenHistory, ...swap?.hiddenHistory },
		variations: { ...c.variations, ...swap?.variations },
	};
}
