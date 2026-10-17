import { LogoMark } from "@/frontend/logo";

export default function Loader() {
	return (
		<div
			className="flex h-full items-center justify-center pt-16"
			role="status"
			aria-label="Cargando"
		>
			<LogoMark className="size-12 animate-float" />
		</div>
	);
}
