"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { Toaster } from "@pac0/ui/components/sonner";
import { ConvexReactClient } from "convex/react";

import { ENV } from "../env";
import { ThemeProvider } from "./theme-provider";

const convex = new ConvexReactClient(ENV.NEXT_PUBLIC_CONVEX_URL);

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<ConvexAuthNextjsProvider client={convex}>
				{children}
			</ConvexAuthNextjsProvider>
			<Toaster richColors />
		</ThemeProvider>
	);
}
