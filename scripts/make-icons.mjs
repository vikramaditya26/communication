// Draws the app icons (home screen, Android, Apple) from the logo.
//   node scripts/make-icons.mjs
import fs from "node:fs/promises";
import sharp from "sharp";

const logo = (size, { padding = 0, rounded = true } = {}) => {
  const s = 512;
  const inner = s - padding * 2;
  const k = inner / 32;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${rounded ? 112 : 0}" fill="#c4552b"/>
  <g transform="translate(${padding} ${padding}) scale(${k})">
    <path d="M16 7c3.2 3.6 4.6 6.6 4.6 9.3A4.6 4.6 0 0 1 16 21a4.6 4.6 0 0 1-4.6-4.7C11.4 13.6 12.8 10.6 16 7Z" fill="#ffffff" opacity=".96"/>
    <path d="M8.5 19.5c2.2 2.9 4.8 4.4 7.5 4.4s5.3-1.5 7.5-4.4" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".85"/>
  </g>
</svg>`);
};

const out = "public/icons";
await fs.mkdir(out, { recursive: true });
await sharp(logo(192, { padding: 40 })).png().toFile(`${out}/icon-192.png`);
await sharp(logo(512, { padding: 40 })).png().toFile(`${out}/icon-512.png`);
// Android may crop "maskable" icons to a circle, so keep the drawing well inside.
await sharp(logo(512, { padding: 110, rounded: false })).png().toFile(`${out}/maskable-512.png`);
await sharp(logo(180, { padding: 40, rounded: false })).png().toFile(`${out}/apple-touch-icon.png`);
console.log("icons written to", out);
