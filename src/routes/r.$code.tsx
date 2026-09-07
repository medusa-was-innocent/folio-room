import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RoomSession } from "@/components/room-session";
import { IconArrowR, IconBook } from "@/components/bits";
import { hostKey, nameKey } from "@/lib/utils";

export const Route = createFileRoute("/r/$code")({
  component: RoomPage,
});

function readHostSecret(clean: string) {
  const stored = localStorage.getItem(hostKey(clean)) ?? "";
  return stored === "1" ? "" : stored;
}

function RoomPage() {
  const { code } = Route.useParams();
  const clean = code.toUpperCase();
  const [boot, setBoot] = useState(false);
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [hostSecret, setHostSecret] = useState("");

  useEffect(() => {
    const storedName = localStorage.getItem(nameKey()) ?? "";
    setName(storedName);
    setReady(Boolean(storedName.trim()));
    setHostSecret(readHostSecret(clean));
    setBoot(true);
  }, [clean]);

  if (!boot) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-pine-950 px-5">
        <p className="font-code text-xs tracking-[0.2em] text-mist-500">OPENING THE ROOM…</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-pine-950 px-5 py-10">
        <section className="w-full max-w-md rotate-[-0.6deg] rounded-xs border border-paper-300 bg-paper-100 p-8 text-inkpaper shadow-folio">
          <span className="flex size-10 items-center justify-center rounded-md border border-brass-500/40 bg-pine-850 text-brass-400">
            <IconBook className="size-5" />
          </span>
          <p className="font-code mt-5 text-[10px] tracking-[0.26em] text-brass-700">JOINING {clean}</p>
          <h1 className="font-display mt-2 text-3xl font-semibold">Who is reading?</h1>
          <label className="font-code mt-6 block text-[10px] font-bold tracking-[0.22em] text-inkpaper/60">
            YOUR NAME AT THE TABLE
          </label>
          <input
            id="join-name"
            value={name}
            maxLength={40}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                localStorage.setItem(nameKey(), name.trim());
                setReady(true);
              }
            }}
            className="mt-1.5 h-11 w-full rounded-xs border border-paper-300 bg-paper-50 px-3.5 text-[15px] font-semibold outline-none focus:border-brass-600"
          />
          <button
            className="btn-sweep mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-pine-900 text-[15px] font-bold text-paper-100"
            onClick={() => {
              if (!name.trim()) return;
              localStorage.setItem(nameKey(), name.trim());
              setReady(true);
            }}
          >
            Enter the room
            <IconArrowR className="size-4" />
          </button>
          <Link to="/" className="mt-3 block text-center text-sm font-semibold text-inkpaper/55 hover:text-brass-700">
            Back
          </Link>
        </section>
      </main>
    );
  }

  return (
    <RoomSession
      key={`${clean}:${name.trim()}`}
      code={clean}
      name={name.trim()}
      hostSecret={hostSecret}
    />
  );
}
