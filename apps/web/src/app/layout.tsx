import type { Metadata } from "next";
import { Caveat, Figtree, Fraunces, Geist_Mono } from "next/font/google";

import "../index.css";
import Header from "@/components/header";
import Providers from "@/components/providers";

// Tipografías del cuaderno (frontend/theme.css): texto, títulos y letra a mano.
const body = Figtree({
	variable: "--font-body-face",
	subsets: ["latin"],
});

const display = Fraunces({
	variable: "--font-display-face",
	subsets: ["latin"],
	axes: ["SOFT", "opsz"],
});

const hand = Caveat({
	variable: "--font-hand-face",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Pac0 · Paciente 0",
	description:
		"Práctica de entrevista clínica con un paciente simulado. Herramienta educativa.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="es" suppressHydrationWarning>
			<body
				className={`${body.variable} ${display.variable} ${hand.variable} ${geistMono.variable} antialiased`}
			>
				<Providers>
					<div className="grid min-h-svh grid-rows-[auto_1fr]">
						<Header />
						{children}
					</div>
				</Providers>
			</body>
		</html>
	);
}
