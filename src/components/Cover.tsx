import clsx from "clsx";
import type { LibraryBook } from "@/lib/types";

// Covers for books without artwork: a palette and a pattern picked from the title,
// so every book looks different but the whole shelf feels like one collection.

const PALETTES = [
  { bg: "#233a4a", fg: "#f3e9d2", ac: "#e2a756" },
  { bg: "#6a2c2c", fg: "#f6e7d3", ac: "#dcaa4a" },
  { bg: "#1f3d2d", fg: "#eee7d6", ac: "#cda434" },
  { bg: "#3b2d5c", fg: "#efe6f7", ac: "#e8b862" },
  { bg: "#8a3a1d", fg: "#fcecdd", ac: "#f4c653" },
  { bg: "#1d3a48", fg: "#e5f0ee", ac: "#ec9a7c" },
  { bg: "#4b3a28", fg: "#f4ecdd", ac: "#c99a2e" },
  { bg: "#5b2949", fg: "#f8e8f0", ac: "#f0b56a" },
  { bg: "#e8ddc7", fg: "#2a2320", ac: "#b4482a" },
  { bg: "#d6e1da", fg: "#1d2c23", ac: "#9b4a2d" },
  { bg: "#efd6b0", fg: "#3a2617", ac: "#7b3c1b" },
  { bg: "#c8d5de", fg: "#1f2a33", ac: "#a2512c" },
];

// Server and browser can disagree on the last decimal of Math.cos/Math.sin, which breaks hydration.
const r2 = (n: number) => Math.round(n * 100) / 100;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const PATTERN_OF: Record<string, string> = {
  "Osho’s Favorites": "Mystics & Scriptures",
  "Wisdom for Everyday Life": "Philosophy",
  "Speaking & Communication": "Mind & Society",
  "Great Novels & Plays": "Novels & Plays",
  "Short Stories": "Novels & Plays",
  Adventure: "Novels & Plays",
  "Love Stories": "Poetry",
};

function Pattern({ kind: category, color, seed }: { kind: string; color: string; seed: number }) {
  const kind = PATTERN_OF[category] ?? category;
  const common = { stroke: color, fill: "none", strokeWidth: 1.2, opacity: 0.55 };
  switch (kind) {
    case "Mystics & Scriptures": // a sun / mandala
      return (
        <g {...common}>
          {Array.from({ length: 36 }, (_, i) => {
            const a = (i / 36) * Math.PI * 2;
            return <line key={i} x1={r2(100 + Math.cos(a) * 34)} y1={r2(118 + Math.sin(a) * 34)} x2={r2(100 + Math.cos(a) * (58 + (i % 2) * 14))} y2={r2(118 + Math.sin(a) * (58 + (i % 2) * 14))} />;
          })}
          <circle cx={100} cy={118} r={26} />
          <circle cx={100} cy={118} r={18} />
          <circle cx={100} cy={118} r={88} opacity={0.4} />
        </g>
      );
    case "Poetry": // waves
      return (
        <g {...common}>
          {Array.from({ length: 11 }, (_, i) => (
            <path key={i} d={`M-10 ${70 + i * 10} Q 25 ${60 + i * 10 + (seed % 7)} 55 ${70 + i * 10} T 120 ${70 + i * 10} T 185 ${70 + i * 10} T 250 ${70 + i * 10}`} />
          ))}
        </g>
      );
    case "Philosophy": // nested geometry
      return (
        <g {...common}>
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={100 - (12 + i * 11)} y={118 - (12 + i * 11)} width={(12 + i * 11) * 2} height={(12 + i * 11) * 2} transform={`rotate(${(seed % 4) * 7 + i * 7.5} 100 118)`} />
          ))}
        </g>
      );
    case "Novels & Plays": // arches
      return (
        <g {...common}>
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M${40 + i * 0} 190 V 120 A ${60 - i * 9} ${60 - i * 9} 0 0 1 ${160 - i * 0} 120 V 190`} transform={`translate(${i * 9} 0) scale(${1 - i * 0.09} 1)`} style={{ transformOrigin: "100px 190px" }} />
          ))}
        </g>
      );
    case "Mind & Society": // overlapping circles
      return (
        <g {...common}>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2 + (seed % 10) / 10;
            return <circle key={i} cx={r2(100 + Math.cos(a) * 28)} cy={r2(118 + Math.sin(a) * 28)} r={40} />;
          })}
        </g>
      );
    default: // lines
      return (
        <g {...common}>
          {Array.from({ length: 16 }, (_, i) => (
            <line key={i} x1={20} y1={60 + i * 9} x2={180 - ((seed >> i) % 5) * 18} y2={60 + i * 9} />
          ))}
        </g>
      );
  }
}

export function Cover({ book, className, sizes = "compact" }: { book: LibraryBook; className?: string; sizes?: "compact" | "large" }) {
  const seed = hash(book.slug);
  const p = PALETTES[seed % PALETTES.length];
  const large = sizes === "large";
  const author = book.author.replace(/^Translated by /, "");

  return (
    <div
      className={clsx("relative aspect-[2/3] w-full select-none overflow-hidden rounded-l-[3px] rounded-r-[7px]", className)}
      style={{ background: p.bg, color: p.fg }}
    >
      {book.cover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={book.cover} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
          <div className={clsx("absolute inset-x-0 bottom-0 text-white", large ? "p-5" : "p-[9%]")}>
            <div className={clsx("font-display leading-[1.05] tracking-[-0.01em] [text-wrap:balance]", large ? "text-3xl" : "text-[clamp(0.8rem,4.6cqw,1.15rem)]")} style={{ fontVariationSettings: '"SOFT" 60, "opsz" 72' }}>
              {book.title}
            </div>
            <div className={clsx("mt-1.5 font-sans uppercase tracking-[0.14em] text-white/75", large ? "text-xs" : "text-[clamp(0.45rem,2.4cqw,0.62rem)]")}>{author}</div>
          </div>
        </>
      ) : (
        <>
          <svg viewBox="0 0 200 300" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <Pattern kind={book.category} color={p.ac} seed={seed} />
            <line x1={24} y1={214} x2={176} y2={214} stroke={p.ac} strokeWidth={1} opacity={0.7} />
          </svg>
          <div className={clsx("absolute inset-x-0 bottom-0 flex h-[33%] flex-col justify-start", large ? "px-6" : "px-[10%]")}>
            <div className={clsx("font-display leading-[1.04] [text-wrap:balance]", large ? "text-3xl" : "text-[clamp(0.78rem,4.4cqw,1.1rem)]")} style={{ fontVariationSettings: '"SOFT" 100, "opsz" 72' }}>
              {book.title}
            </div>
            <div className={clsx("mt-1.5 font-sans uppercase tracking-[0.14em] opacity-70", large ? "text-xs" : "text-[clamp(0.45rem,2.3cqw,0.6rem)]")}>{author}</div>
          </div>
        </>
      )}
      {/* spine shadow and a soft gloss, so it reads as a physical book */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/30 via-black/10 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-[7%] w-px bg-white/15" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/12 via-transparent to-black/10" />
    </div>
  );
}
