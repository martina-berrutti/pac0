// Perfil de errores acumulado entre consultas (plan.md, secciones 3 y 8:
// "tu punto débil este mes son las alergias"). Lo arma el servidor al cerrar
// cada consulta; la Persona 3 lo muestra en el informe.
export type MistakeEntry = {
	tag: string;
	// Cómo se describió la última vez (texto del informe).
	label: string;
	// En cuántas consultas apareció.
	count: number;
	critical: boolean;
	lastSeenAt: number;
};
