import { expect, test } from "vitest";

import { cutText } from "@/lib/cut-text";

test("cortar no deja medio emoji", () => {
	const text = `${"a".repeat(9)}😀`;
	expect(cutText(text, 10)).toBe("a".repeat(9));
	expect(cutText(text, 11)).toBe(text);
	expect(cutText("hola", 10)).toBe("hola");
});
