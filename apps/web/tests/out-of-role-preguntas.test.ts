// Lo que el paciente sí dice (sobre todo sus preguntas cuando le dicen qué
// tiene) no se descarta como "habla de médico".
import { expect, test } from "vitest";

import { soundsLikeDoctor } from "@/lib/patient/out-of-role";

test.each([
	"¿Y eso se contagia por el mate?",
	"¿Se cura con antibióticos?",
	"¿Esto se trata con pastillas o qué?",
	"¿La angina es una infección? ¿Es grave?",
	"¿Y tengo que consultar con un médico de nuevo?",
	"¿Me vas a mandar a un especialista?",
	"El especialista me dijo que era un esguince.",
	"Mi jefe me dijo que tiene que ver a alguien.",
	"Me recomendaron reposo la otra vez.",
	"La doctora me dijo que tenía que ir a un especialista, pero no fui.",
	"El médico de la mutualista me mandó a ver a un especialista.",
	"Mi mamá quería que consultara con un especialista.",
	"Consulté con un especialista el año pasado.",
])("deja pasar lo que diría un paciente: %s", (text) => {
	expect(soundsLikeDoctor(text)).toBe(false);
});

test.each([
	"Tenés que consultar con un especialista.",
	"Andá a un especialista, yo te derivo.",
	"¿Duele? La otitis es una inflamación del oído, se trata con gotas.",
	"Deberías ver a un especialista.",
	"Te recomiendo que tomes ibuprofeno, ¿dale?",
	"La faringitis es una inflamación de la garganta, ¿sabés?",
	"Lo mejor es que consultes con un médico, ¿te parece?",
	"Se trata con antibióticos si es bacteriana, ¿entendés?",
])("sigue descartando lo que diría un médico: %s", (text) => {
	expect(soundsLikeDoctor(text)).toBe(true);
});
