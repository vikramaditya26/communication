"use client";

import clsx from "clsx";
import { ChartLine, Download, Ear, Layers, Library, Mic, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useStoredList, type SavedItem } from "@/lib/store";
import { useNow } from "@/lib/useNow";
import { useInstallPrompt } from "@/lib/pwa";

const LINKS = [
  { href: "/", label: "Library", icon: Library },
  { href: "/speak", label: "Speak", icon: Mic },
  { href: "/sounds", label: "Sounds", icon: Ear },
  { href: "/review", label: "Review", icon: Layers },
  { href: "/progress", label: "Progress", icon: ChartLine },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <circle cx="16" cy="16" r="15" className="fill-accent" />
        <path d="M16 7c3.2 3.6 4.6 6.6 4.6 9.3A4.6 4.6 0 0 1 16 21a4.6 4.6 0 0 1-4.6-4.7C11.4 13.6 12.8 10.6 16 7Z" className="fill-accent-ink" opacity=".95" />
        <path d="M8.5 19.5c2.2 2.9 4.8 4.4 7.5 4.4s5.3-1.5 7.5-4.4" className="stroke-accent-ink" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".8" />
      </svg>
      <span className="font-display text-[22px] tracking-tight" style={{ fontVariationSettings: '"SOFT" 100, "opsz" 48' }}>
        Vaani
      </span>
    </span>
  );
}

const watchTheme = (cb: () => void) => {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    watchTheme,
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition hover:bg-ink/5 hover:text-ink active:scale-95"
    >
      <motion.span key={dark ? "moon" : "sun"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}>
        {dark ? <Moon size={19} /> : <Sun size={19} />}
      </motion.span>
    </button>
  );
}

function InstallButton() {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={install}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-medium text-accent-ink shadow-soft active:scale-95"
    >
      <Download size={15} /> Install app
    </motion.button>
  );
}

function useDueCount() {
  const [items] = useStoredList<SavedItem>("saved:");
  const now = useNow();
  return now ? items.filter((i) => i.due <= now).length : 0;
}

export function Nav() {
  const path = usePathname();
  const due = useDueCount();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="rounded-full outline-offset-4">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 rounded-full border border-line bg-card/70 p-1 md:flex">
            {LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={clsx("relative flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", isActive(href) ? "text-paper" : "text-ink-2 hover:text-ink")}
              >
                {isActive(href) && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
                <Icon size={16} className="relative" />
                <span className="relative">{label}</span>
                {href === "/review" && due > 0 && (
                  <span className="relative rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-accent-ink">{due}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <InstallButton />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Phone tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-paper/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={clsx("relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium", isActive(href) ? "text-accent" : "text-ink-3")}>
              <span className="relative">
                <Icon size={22} strokeWidth={isActive(href) ? 2.2 : 1.8} />
                {href === "/review" && due > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-accent-ink">{due}</span>
                )}
              </span>
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
