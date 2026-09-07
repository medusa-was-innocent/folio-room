import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createRoom as createRoomFn, getSnapshot, type RoomSnapshot } from "@/lib/folio-api";
import { cleanRoomCode, hostKey, nameKey } from "@/lib/utils";
import {
  IconArrowR,
  IconBook,
  IconCheck,
  IconNote,
  IconPlus,
  Reveal,
  Spinner,
} from "@/components/bits";

const DUST = [
  { top: "18%", left: "12%", dur: "19s" },
  { top: "32%", left: "84%", dur: "26s" },
  { top: "58%", left: "6%", dur: "23s" },
  { top: "71%", left: "91%", dur: "17s" },
  { top: "12%", left: "58%", dur: "29s" },
  { top: "84%", left: "38%", dur: "21s" },
  { top: "44%", left: "48%", dur: "31s" },
];

const TOC = [
  { n: "01", t: "Open a room", d: "six letters stand in for a door", p: "p. 01" },
  { n: "02", t: "Set the book", d: "PDF or EPUB, up to 10 MB", p: "p. 02" },
  { n: "03", t: "Pass the code", d: "the invite is the only key", p: "p. 03" },
  { n: "04", t: "Read together", d: "bars move as pages turn", p: "p. 04" },
  { n: "05", t: "Pin the margin", d: "notes wait on their page", p: "p. 05" },
];

const MARGIN_CARDS = [
  {
    cls: "top-0 left-2 sm:left-6 rotate-[-4deg]",
    page: "P. 47 · THE SHARED MARGIN",
    text: "Wait — is this the part where the copyist gets roasted?",
    who: "Mira",
    when: "just now",
  },
  {
    cls: "top-40 left-36 sm:left-52 rotate-[3deg]",
    page: "P. 12 · THE SHARED MARGIN",
    text: "Pull quotes read aloud are mandatory. House rules.",
    who: "Jonah",
    when: "2m ago",
  },
  {
    cls: "top-[15.5rem] left-8 sm:left-16 rotate-[-1.5deg]",
    page: "P. 6 · THE SHARED MARGIN",
    text: "Last one to the colophon buys the next book.",
    who: "Ada",
    when: "1h ago",
  },
];

const QUOTES = [
  {
    text: "The reading of all good books is like a conversation with the finest minds of past centuries.",
    who: "René Descartes",
  },
  {
    text: "A room without books is like a body without a soul.",
    who: "Cicero",
  },
  {
    text: "The mind is not a vessel to be filled, but a fire to be kindled.",
    who: "Plutarch",
  },
  {
    text: "I cannot teach anybody anything. I can only make them think.",
    who: "Socrates",
  },
  {
    text: "Some books are to be tasted, others to be swallowed, and some few to be chewed and digested.",
    who: "Francis Bacon",
  },
] as const;

type Busy = null | "sample" | "empty" | "epub";

function QuoteRotator() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let fade: number | undefined;
    const id = window.setInterval(() => {
      setVisible(false);
      fade = window.setTimeout(() => {
        setIndex((n) => (n + 1) % QUOTES.length);
        setVisible(true);
      }, 380);
    }, 7500);
    return () => {
      window.clearInterval(id);
      if (fade !== undefined) window.clearTimeout(fade);
    };
  }, []);

  const quote = QUOTES[index];

  return (
    <figure
      className="anim-fade-up mt-7 max-w-xl"
      style={{ animationDelay: "450ms" }}
      aria-live="polite"
    >
      <blockquote
        className={`min-h-[4.6rem] text-[15.5px] leading-relaxed text-mist-300 italic transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        “{quote.text}”
      </blockquote>
      <figcaption
        className={`font-code mt-3 text-[11px] tracking-[0.22em] text-brass-400 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        — {quote.who.toUpperCase()}
      </figcaption>
    </figure>
  );
}

function LocalClock() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d).toUpperCase();
      const time = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(d);
      const tz =
        new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
          .formatToParts(d)
          .find((part) => part.type === "timeZoneName")?.value ?? "";
      setLabel([weekday, time, tz].filter(Boolean).join(" · "));
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <time className="font-code text-[10.5px] tracking-wide text-mist-500 tabular-nums" suppressHydrationWarning>
      {label || "\u00a0"}
    </time>
  );
}

export function Lobby() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [boxes, setBoxes] = useState<string[]>(() => Array.from({ length: 6 }, () => ""));
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [peek, setPeek] = useState<RoomSnapshot | null>(null);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  const code = boxes.join("");

  useEffect(() => {
    setName(localStorage.getItem(nameKey()) ?? "");
  }, []);

  useEffect(() => {
    if (code.length !== 6) {
      setPeek(null);
      return;
    }
    let cancelled = false;
    void getSnapshot({ data: { code } }).then((res) => {
      if (cancelled) return;
      setPeek(res.ok ? res.snapshot : null);
      if (!res.ok) setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const persistName = (value: string) => {
    setName(value);
    if (typeof window !== "undefined") localStorage.setItem(nameKey(), value.trim());
  };

  const requireName = (): string | null => {
    const next = name.trim().slice(0, 40);
    if (!next) {
      setNameError(true);
      setShakeKey((k) => k + 1);
      nameRef.current?.focus();
      return null;
    }
    setNameError(false);
    persistName(next);
    return next;
  };

  const setChar = (i: number, raw: string) => {
    const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
    setBoxes((b) => {
      const next = [...b];
      next[i] = c;
      return next;
    });
    if (c && i < 5) boxRefs.current[i + 1]?.focus();
  };

  const onBoxKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !boxes[i] && i > 0) boxRefs.current[i - 1]?.focus();
    if (e.key === "Enter") void tryJoin();
  };

  const onBoxPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const t = cleanRoomCode(e.clipboardData.getData("text")).slice(0, 6);
    if (!t) return;
    e.preventDefault();
    setBoxes(Array.from({ length: 6 }, (_, i) => t[i] ?? ""));
    boxRefs.current[Math.min(t.length, 5)]?.focus();
  };

  async function tryJoin() {
    if (!requireName()) return;
    if (code.length < 6) {
      setError("Six letters — that is the whole key.");
      setShakeKey((k) => k + 1);
      return;
    }
    const res = await getSnapshot({ data: { code } });
    if (!res.ok) {
      setError("No room answers that code.");
      setShakeKey((k) => k + 1);
      return;
    }
    void navigate({ to: "/r/$code", params: { code } });
  }

  async function start(sample: "none" | "pdf" | "epub") {
    const who = requireName();
    if (!who || busy) return;
    setBusy(sample === "pdf" ? "sample" : sample === "epub" ? "epub" : "empty");
    try {
      const res = await createRoomFn({ data: { name: who, sample } });
      localStorage.setItem(hostKey(res.code), res.hostSecret);
      await navigate({ to: "/r/$code", params: { code: res.code } });
    } catch {
      setError("Could not open a room. Try once more.");
      setBusy(null);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="drift-a absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(211,160,68,0.13),transparent_65%)]" />
        <div className="drift-b absolute -right-48 top-1/3 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgba(111,163,135,0.11),transparent_65%)]" />
        <div className="lamp-breathe absolute top-[-12rem] left-1/2 h-[26rem] w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(228,182,92,0.10),transparent_70%)]" />
        <span className="font-display absolute top-[4%] -right-8 z-0 text-[22rem] leading-none text-pine-800/40 select-none sm:text-[28rem]">
          §
        </span>
        {DUST.map((d, i) => (
          <span
            key={i}
            className="drift-a absolute size-1 rounded-full bg-brass-400/25"
            style={{ top: d.top, left: d.left, animationDuration: d.dur }}
          />
        ))}
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="group flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md border border-brass-500/40 bg-pine-850 text-brass-400">
            <IconBook className="size-5" />
          </span>
          <span className="font-display text-xl text-mist-100 italic">Folio Room</span>
          <span className="font-code mt-1 hidden text-[9.5px] tracking-[0.2em] text-mist-600 sm:block">SHARED TABLE</span>
        </span>
        <nav className="font-code hidden items-center gap-7 text-[11.5px] tracking-wide text-mist-500 md:flex">
          <a href="#contents" className="transition-colors hover:text-brass-300">
            Contents
          </a>
          <a href="#margin" className="transition-colors hover:text-brass-300">
            The margin
          </a>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl items-start gap-14 px-6 pt-8 pb-24 lg:grid-cols-12 lg:gap-10 lg:pt-14">
        <div className="lg:col-span-7">
          <div className="anim-fade-up flex items-center gap-3">
            <span className="h-px w-10 bg-brass-500" />
            <span className="font-code text-[11px] tracking-[0.32em] text-brass-400">A SHARED READING TABLE</span>
          </div>

          <h1 className="font-display mt-6 text-[12vw] leading-[1.16] font-semibold tracking-tight text-mist-100 sm:text-6xl lg:text-[4.2rem] xl:text-[5rem]">
            <span className="mask-line">
              <span style={{ animationDelay: "80ms" }}>One book,</span>
            </span>
            <span className="mask-line">
              <span style={{ animationDelay: "220ms" }}>many minds,</span>
            </span>
            <span className="mask-line">
              <span className="text-brass-400 italic" style={{ animationDelay: "360ms" }}>
                one shared table.
              </span>
            </span>
          </h1>

          <QuoteRotator />

          <div className="anim-fade-up mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "550ms" }}>
            <button
              onClick={() => void start("pdf")}
              disabled={busy !== null}
              className="btn-sweep group flex min-h-11 items-center gap-3 rounded-md bg-brass-500 px-6 py-3.5 text-[15px] font-bold text-pine-950 transition-colors enabled:hover:bg-brass-400 disabled:opacity-60"
            >
              {busy === "sample" ? <Spinner className="size-4" /> : <IconBook className="size-4" />}
              Open the sample book
              <IconArrowR className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => void start("none")}
              disabled={busy !== null}
              className="flex min-h-11 items-center gap-2.5 rounded-md border border-pine-600 px-6 py-3.5 text-[15px] font-semibold text-mist-200 transition-all enabled:hover:border-brass-500/60 enabled:hover:text-brass-300 disabled:opacity-60"
            >
              {busy === "empty" ? <Spinner className="size-4" /> : <IconPlus className="size-4" />}
              Set an empty table
            </button>
          </div>

          <p className="anim-fade-up font-code mt-6 text-[11px] tracking-wide text-mist-600" style={{ animationDelay: "650ms" }}>
            YOU HOST THE ROOMS YOU START · PDF & EPUB · UP TO 10 MB · THE BOOK STAYS WITH THE ROOM
          </p>
        </div>

        <div className="lg:col-span-5 lg:mt-2">
          <div key={shakeKey} className={`relative ${shakeKey ? "anim-shake" : ""}`}>
            <div className="group relative rotate-[-1.3deg] transition-transform duration-500 hover:rotate-0">
              <span className="absolute -top-3 left-12 z-10 h-6 w-24 -rotate-6 bg-brass-500/30" aria-hidden="true" />
              <div className="relative rounded-xs border border-paper-300 bg-paper-100 p-7 text-inkpaper shadow-folio sm:p-8">
                <div className="flex items-baseline justify-between">
                  <p className="font-code text-[10px] font-bold tracking-[0.26em] text-brass-700">ADMISSION</p>
                  <p className="font-code text-[10px] text-inkpaper/50">No. 001</p>
                </div>
                <h2 className="font-display mt-2 text-[32px] leading-none font-semibold">Take a seat</h2>

                <label className="font-code mt-6 block text-[10px] font-bold tracking-[0.22em] text-inkpaper/60">
                  YOUR NAME AT THE TABLE
                </label>
                <input
                  ref={nameRef}
                  value={name}
                  maxLength={40}
                  onChange={(e) => {
                    persistName(e.target.value);
                    if (nameError && e.target.value.trim()) setNameError(false);
                  }}
                  placeholder="e.g. Mira"
                  suppressHydrationWarning
                  className={`mt-1.5 h-11 w-full rounded-xs border bg-paper-50 px-3.5 text-[15px] font-semibold outline-none transition-colors placeholder:text-inkpaper/35 ${
                    nameError ? "border-vermilion-500" : "border-paper-300 focus:border-brass-600"
                  }`}
                />
                {nameError ? (
                  <p className="anim-pop mt-1.5 text-xs font-bold text-vermilion-600">Write your name before you sit down.</p>
                ) : null}

                <label className="font-code mt-5 block text-[10px] font-bold tracking-[0.22em] text-inkpaper/60">
                  ROOM CODE
                </label>
                <div className="mt-2 flex gap-1.5">
                  {boxes.map((ch, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        boxRefs.current[i] = el;
                      }}
                      value={ch}
                      onChange={(e) => setChar(i, e.target.value)}
                      onKeyDown={(e) => onBoxKey(i, e)}
                      onPaste={onBoxPaste}
                      onFocus={(e) => e.target.select()}
                      maxLength={2}
                      inputMode="text"
                      autoComplete="off"
                      suppressHydrationWarning
                      aria-label={`Code letter ${i + 1}`}
                      className="font-code h-12 w-full min-w-0 rounded-xs border border-paper-300 border-b-2 border-b-inkpaper/30 bg-paper-50 text-center text-lg font-bold uppercase transition-colors outline-none focus:border-brass-600"
                    />
                  ))}
                </div>
                {error ? (
                  <p className="anim-pop mt-2.5 text-xs leading-snug font-bold text-vermilion-600">{error}</p>
                ) : code.length === 6 && peek ? (
                  <p className="anim-pop mt-2.5 flex items-center gap-1.5 text-xs font-bold text-celadon-600">
                    <IconCheck className="size-3.5" /> Room found — “{peek.fileName ?? "an empty table"}” is on it.
                  </p>
                ) : null}

                <button
                  onClick={() => void tryJoin()}
                  className="btn-sweep group mt-5 flex h-11 w-full items-center justify-center gap-2.5 rounded-sm bg-pine-900 py-3 text-[15px] font-bold text-paper-100 transition-colors hover:bg-pine-800"
                >
                  Join the room
                  <IconArrowR className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </button>

                <div className="mt-5 border-t border-dashed border-inkpaper/25 pt-4">
                  <p className="text-[12.5px] leading-relaxed text-inkpaper/65">
                    Anyone with the code can sit down — another tab, another phone, another city. The book stays with
                    the room.
                  </p>
                </div>
              </div>
              <span className="font-code absolute -right-2 -bottom-4 rotate-3 rounded-sm border-2 border-vermilion-500/50 px-2 py-1 text-[9.5px] font-bold tracking-[0.18em] text-vermilion-500/80 select-none">
                NO ACCOUNTS · NO FEED
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="contents" className="relative z-10 border-t border-pine-800">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-code text-[11px] tracking-[0.3em] text-brass-400">HOW A ROOM READS</p>
              <h2 className="font-display mt-3 text-5xl font-semibold text-mist-100 sm:text-6xl">
                Contents<span className="text-brass-500">.</span>
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-mist-500">
              Five moves, in order. The whole room runs on nothing else.
            </p>
          </Reveal>

          <div className="mt-14">
            {TOC.map((row, i) => (
              <Reveal key={row.n} delay={i * 90}>
                <div className="group flex cursor-default items-baseline gap-4 rounded-md px-2 py-5 transition-all duration-300 hover:bg-pine-900/70 sm:gap-6">
                  <span className="font-code w-8 shrink-0 text-sm text-brass-500">{row.n}</span>
                  <span className="font-display text-[26px] font-medium text-mist-100 transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-brass-300 sm:text-3xl">
                    {row.t}
                  </span>
                  <span className="mx-1 mb-2 flex-1 border-b border-dotted border-pine-600" aria-hidden="true" />
                  <span className="font-code hidden text-xs text-mist-500 md:block">{row.d}</span>
                  <span className="font-code text-sm text-brass-400">{row.p}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="margin" className="relative z-10 border-y border-pine-800 bg-pine-900/45">
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-24 lg:grid-cols-2">
          <Reveal>
            <p className="font-code flex items-center gap-2.5 text-[11px] tracking-[0.3em] text-brass-400">
              <span className="flex size-6 items-center justify-center rounded-full bg-brass-500 text-pine-950">
                <IconPlus className="size-3.5" />
              </span>
              THE ROUND +
            </p>
            <h2 className="font-display mt-4 text-4xl leading-[1.05] font-semibold text-mist-100 sm:text-5xl">
              The margin is <span className="text-brass-400 italic">the point.</span>
            </h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-mist-400">
              Every page carries a round +. Pin a note and it belongs to that page alone. A red dot on the + means
              the page has notes — tap it when you want the margin.
            </p>
            <ul className="mt-8 space-y-3.5">
              {[
                "Notes are pinned to a page, not a thread.",
                "A red dot on the + means this page has notes.",
                "The margin opens only when you press it.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3 text-[14px] text-mist-300">
                  <IconCheck className="mt-0.5 size-4 shrink-0 text-celadon-400" />
                  {line}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={150}>
            <div className="relative h-[26rem] select-none sm:h-[24rem]">
              {MARGIN_CARDS.map((c) => (
                <div
                  key={c.page}
                  className={`absolute w-60 rounded-xs border border-paper-300 bg-paper-100 p-4 text-inkpaper shadow-[0_20px_50px_-16px_rgba(0,0,0,0.65)] transition-transform duration-500 hover:z-20 hover:rotate-0 hover:scale-[1.04] sm:w-64 ${c.cls}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-code text-[9px] font-bold tracking-[0.18em] text-brass-700">{c.page}</p>
                    <span className="size-2 rounded-full bg-vermilion-500" aria-hidden="true" />
                  </div>
                  <p className="font-display mt-2.5 text-[15.5px] leading-snug italic">{c.text}</p>
                  <p className="font-code mt-3 text-[10px] text-inkpaper/55">
                    — {c.who}, {c.when}
                  </p>
                </div>
              ))}
              <div className="absolute right-2 bottom-2 flex size-14 items-center justify-center overflow-visible rounded-full bg-brass-500 text-pine-950 shadow-[0_14px_36px_-8px_rgba(211,160,68,0.5)] sm:right-10">
                <IconPlus className="size-6" />
                <span
                  className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-vermilion-500"
                  aria-hidden="true"
                />
              </div>
              <IconNote className="absolute top-6 right-4 size-16 rotate-12 text-pine-700" />
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="relative z-10 border-t border-pine-800">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 py-8 md:flex-row md:items-center">
          <p className="flex items-center gap-2.5 text-sm text-mist-500">
            <IconBook className="size-4 text-brass-500" />
            <span className="font-display italic">Folio Room</span> — a reading table for the open web.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <LocalClock />
            <p className="font-code text-[10.5px] tracking-wide text-mist-600">PDF & EPUB · 10 MB MAX · SHARED ROOMS</p>
          </div>
        </div>
      </footer>
      <div className="grain" aria-hidden="true" />
    </div>
  );
}
