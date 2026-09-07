import { useEffect, useRef, useState, type ReactNode } from "react";

export type ToastTone = "ok" | "warn" | "bad";
export type Toast = { id: number; msg: string; tone: ToastTone };

type IconProps = { className?: string };
const base = "inline-block shrink-0";

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${base} ${className ?? "size-4"}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 6.6C10 4.9 6.8 4.4 3.5 5v13.4c3.3-.6 6.5-.1 8.5 1.6 2-1.7 5.2-2.2 8.5-1.6V5c-3.3-.6-6.5-.1-8.5 1.6z" />
    <path d="M12 6.6V20" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M5 14.5V5.5A1.5 1.5 0 0 1 6.5 4h9" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 13l4 4L19 7" />
  </Svg>
);
export const IconChevronL = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Svg>
);
export const IconChevronR = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);
export const IconZoomIn = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3M8 11h6M11 8v6" />
  </Svg>
);
export const IconZoomOut = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3M8 11h6" />
  </Svg>
);
export const IconReset = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4.5v5.5h5.5" />
    <path d="M3.4 10a8.6 8.6 0 1 1-.4 4" />
  </Svg>
);
export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15.5V4M6.5 9.5L12 4l5.5 5.5M4.5 20h15" />
  </Svg>
);
export const IconLeave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.5" />
    <path d="M15.5 16.5L20 12l-4.5-4.5M20 12H9.5" />
  </Svg>
);
export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 21v-1.8a3.7 3.7 0 0 0-3.7-3.7H6.2A3.7 3.7 0 0 0 2.5 19.2V21" />
    <circle cx="9" cy="7.3" r="3.6" />
    <path d="M21.5 21v-1.8a3.7 3.7 0 0 0-2.8-3.6M15.2 3.9a3.6 3.6 0 0 1 0 6.9" />
  </Svg>
);
export const IconArrowR = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h15M13.5 6l6 6-6 6" />
  </Svg>
);
export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconNote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4.5h14v11l-4.5 4H5z" />
    <path d="M14.5 19.5V15H19M8.5 9.5h7M8.5 12.5h4.5" />
  </Svg>
);
export const IconExpand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
export const IconCompress = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4v5H4M15 4v5h5M4 15h5v5M20 15h-5v5" />
  </Svg>
);

export function Spinner({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} animate-spin ${className ?? "size-5"}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"ready" | "pending" | "shown">("ready");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("shown");
      return;
    }
    const inView = () => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight - 24 && r.bottom > 24;
    };
    if (inView()) {
      setPhase("shown");
      return;
    }
    setPhase("pending");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPhase("shown");
          io.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "40px" },
    );
    io.observe(el);
    const t = window.setTimeout(() => setPhase("shown"), 1800);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  const motion = phase === "pending" ? "is-pending" : phase === "shown" ? "is-in" : "";
  return (
    <div ref={ref} className={`reveal ${motion} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const SCRAMBLE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function useScramble(text: string, play = true): string {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (!play || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOut(text);
      return;
    }
    let frame = 0;
    const total = 22;
    const iv = window.setInterval(() => {
      frame++;
      const locked = Math.floor((frame / total) * text.length);
      let s = "";
      for (let i = 0; i < text.length; i++) {
        s += i < locked ? text[i] : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
      setOut(s);
      if (frame >= total) {
        setOut(text);
        window.clearInterval(iv);
      }
    }, 34);
    return () => window.clearInterval(iv);
  }, [text, play]);
  return out;
}

export function Bar({
  value,
  className = "",
  tone = "brass",
}: {
  value: number;
  className?: string;
  tone?: "brass" | "celadon" | "dim";
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const fill =
    tone === "brass"
      ? "bg-brass-500"
      : tone === "celadon"
        ? "bg-celadon-500"
        : "bg-pine-500";
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-pine-700 ${className}`}>
      <div className={`h-full rounded-full ${fill} transition-[width] duration-500 ease-out`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const AVATAR_TONES = [
  "bg-brass-500 text-pine-900",
  "bg-celadon-400 text-pine-900",
  "bg-rosewood-400 text-pine-900",
  "bg-slateblue-400 text-pine-900",
  "bg-brass-400 text-pine-900",
  "bg-celadon-500 text-pine-900",
];

export function Avatar({ name, id, size = 34 }: { name: string; id: string; size?: number }) {
  const hash = Array.from(id).reduce((a, c) => a + c.charCodeAt(0), 0);
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length];
  return (
    <span
      className={`font-display inline-flex items-center justify-center rounded-full font-semibold select-none ${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="group flex min-h-11 items-center gap-2.5"
      aria-pressed={on}
      aria-label={label}
    >
      <span
        className={`relative h-5 w-9 rounded-full border transition-colors duration-300 ${
          on ? "border-brass-500 bg-brass-500/90" : "border-pine-600 bg-pine-800"
        }`}
      >
        <span
          className={`absolute top-0.5 size-3.5 rounded-full transition-all duration-300 ${
            on ? "left-[18px] bg-pine-950" : "left-[3px] bg-mist-500 group-hover:bg-mist-300"
          }`}
        />
      </span>
      <span
        className={`font-code hidden text-[11px] tracking-wide transition-colors sm:inline ${
          on ? "text-brass-300" : "text-mist-500"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(d) || d < 45_000) return "just now";
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[80] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`anim-pop pointer-events-auto flex w-auto max-w-full items-center gap-2.5 rounded-md border px-4 py-2.5 text-left text-[13px] font-medium shadow-xl backdrop-blur-sm ${
            t.tone === "ok"
              ? "border-brass-500/40 bg-pine-800/95 text-brass-300"
              : t.tone === "warn"
                ? "border-pine-600 bg-pine-800/95 text-mist-300"
                : "border-vermilion-500/50 bg-pine-800/95 text-vermilion-400"
          }`}
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              t.tone === "ok" ? "bg-brass-400" : t.tone === "warn" ? "bg-mist-500" : "bg-vermilion-500"
            }`}
          />
          {t.msg}
        </button>
      ))}
    </div>
  );
}
