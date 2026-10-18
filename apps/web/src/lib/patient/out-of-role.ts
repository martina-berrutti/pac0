// El modelo a veces sale del papel y contesta como médico o como asistente
// ("la faringitis es una inflamación… consultá con un especialista"). Un
// paciente nunca habla así: por texto, esa respuesta se descarta y contesta
// el paciente por reglas (Persona 3).
const OUT_OF_ROLE = [
	// Consejos de salud y derivaciones, dichos al estudiante: "consultá con un
	// especialista", "tenés que ir a un especialista". "El médico me mandó a
	// ver a un especialista" o "consulté con uno" es lo que le pasó.
	/\b(consulta|consultes|anda|andes|vayas)\b[^.!]{0,25}\bespecialista\b/,
	/\b(tenes que|tendrias que|deberias|te conviene|lo mejor es que) (ir|ver|consult\w*) (a|al|con) (un |una |el |la )?especialista\b/,
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

// Sin las preguntas: el paciente sí pregunta "¿se cura con antibióticos?" o
// "¿me vas a mandar a un especialista?" (se lo pide el prompt cuando le dicen
// qué tiene). Se saca solo la pregunta: "te recomiendo ibuprofeno, ¿dale?"
// sigue siendo un consejo.
export function soundsLikeDoctor(text: string): boolean {
	const t = text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		// "¿…?" entero, y una pregunta sin "¿" desde el último punto.
		.replace(/¿[^?]*\?/g, " ")
		.replace(/(^|[.!])[^.!?]*\?/g, "$1 ");
	return OUT_OF_ROLE.some((re) => re.test(t));
}
