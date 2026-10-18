// El modelo a veces sale del papel y contesta como médico o como asistente
// ("la faringitis es una inflamación… consultá con un especialista"). Un
// paciente nunca habla así: por texto, esa respuesta se descarta y contesta
// el paciente por reglas (Persona 3).
const OUT_OF_ROLE = [
	// Consejos de salud y derivaciones.
	/\bespecialista\b/,
	/\bprofesional de (la )?salud\b/,
	/\b(te|le|les) (recomiendo|aconsejo|sugiero)\b/,
	/\b(deberias|deberia|tendrias que|tenes que|tiene que) (consultar|ver a|ir al medico|acudir)/,
	/\bconsult(a|e|es|ar)? (con|a) (un|una|tu|su) (medico|doctor|profesional)/,
	/\bbusca(r)? atencion medica\b/,
	// Explicar una enfermedad.
	/\b(faringitis|amigdalitis|angina|otitis|meniscopatia|esguince|infeccion|inflamacion)\b[^.?!]{0,20}\b(es|son) (una|un|la|el) (inflamacion|infeccion|enfermedad|afeccion|condicion|lesion)/,
	/\bse (trata|cura|contagia) (con|por|mediante)\b/,
	// Hablar como asistente.
	/\b(como|soy (un|una)) (modelo de lenguaje|asistente|inteligencia artificial|ia)\b/,
	/\bno puedo (dar|brindar|ofrecer) (consejos|diagnosticos|asesoramiento)/,
];

export function soundsLikeDoctor(text: string): boolean {
	const t = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
	return OUT_OF_ROLE.some((re) => re.test(t));
}
