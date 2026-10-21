// Junta fotos en una grilla con el nombre debajo. Uso: node hoja.mjs salida.png a.png b.png ...
import sharp from "sharp";
const [out, ...files] = process.argv.slice(2);
const W = 240, H = 270, cols = 4;
const rows = Math.ceil(files.length / cols);
const tiles = await Promise.all(files.map(async (f, i) => {
	const label = f.split(/[\/]/).pop().replace(/\.png$/, "");
	const img = await sharp(f).resize(W, W).toBuffer();
	const svg = Buffer.from(`<svg width="${W}" height="${H - W}"><rect width="100%" height="100%" fill="#fff"/><text x="6" y="20" font-size="13" font-family="sans-serif">${label}</text></svg>`);
	return [{ input: img, left: (i % cols) * W, top: Math.floor(i / cols) * H }, { input: svg, left: (i % cols) * W, top: Math.floor(i / cols) * H + W }];
}));
await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: "#ddd" } }).composite(tiles.flat()).png().toFile(out);
