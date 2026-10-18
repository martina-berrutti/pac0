// El modelo a veces sale del papel y contesta como médico o como asistente
// ("la faringitis es una inflamación… consultá con un especialista"). Un
// paciente nunca habla así: por texto, esa respuesta se descarta y contesta
// el paciente por reglas (Persona 3).
const OUT_OF_ROLE = [
	// Consejos de salud y derivaciones. "El especialista me dijo…" es lo que
	// le pasó al paciente, no un consejo.
	/\b(consult\w*|anda|vaya|ir|ver) (a|al|con) (un |una |el |la )?especialista\b/,
	/\bte derivo\b/,
	/\bprofesional de (la )?salud\b/,
	/\b(te|le|les) (recomiendo|aconsejo|sugiero)\b/,
	// En segunda persona: "mi jefe me dijo que tiene que ver a alguien" no.
	/\b(deberias|deberia|tendrias que|tenes que) (consultar|ver a|ir al medico|acudir)/,
	/\bconsult(a|e|es|ar)? (con|a) (un|una|tu|su) (medico|doctor|profesional)/,
	/\bbusca(r)? atencion medica\b/,
	// Explicar una enfermedad.
	/\b(faringitis|amigdalitis|angina|otitis|meniscopatia|esguince|infeccion|inflamacion)\b[^.?!]{0,20}\b(es|son) (una|un|la|el) (inflamacion|infeccion|enfermedad|afeccion|condicion|lesion)/,
	/\bse (trata|cura|contagia) (con|por|mediante)\b/,
	// Hablar como asistente.
	/\b(como|soy (un|una)) (modelo de lenguaje|asistente|inteligencia artificial|ia)\b/,
	/\bno puedo (dar|brindar|ofrecer) (consejos|diagnosticos|asesoramiento)/,
];

// Frase por frase y sin las preguntas: el paciente sí pregunta "¿se cura con
// antibióticos?" o "¿me vas a mandar a un especialista?" (se lo pide el
// prompt cuando le dicen qué tiene).
export function soundsLikeDoctor(text: string): boolean {
	const t = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
	return t
		.split(/(?<=[.!?\n])\s*/)
		.filter((s) => !s.includes("?") && !s.includes("¿"))
		.some((s) => OUT_OF_ROLE.some((re) => re.test(s)));
}
