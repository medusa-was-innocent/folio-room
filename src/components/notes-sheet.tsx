import { useEffect, useRef, useState } from "react";
import type { NoteRow } from "@/lib/folio-api";
import { Avatar, IconPlus, IconX, timeAgo } from "@/components/bits";

type NotesSheetProps = {
  open: boolean;
  page: number;
  notes: NoteRow[];
  selfId: string;
  onClose: () => void;
  onPost: (body: string) => Promise<void>;
};

export function NotesSheet({ open, page, notes, selfId, onClose, onPost }: NotesSheetProps) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft("");
  }, [page]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => fieldRef.current?.focus(), 180);
    return () => window.clearTimeout(t);
  }, [open, page]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [open, notes.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onPost(body);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      className={`absolute inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-pine-700 bg-pine-900/97 shadow-[-24px_0_60px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Notes on page ${page}`}
      aria-hidden={!open}
      inert={!open}
    >
      <header className="flex items-center justify-between border-b border-pine-700 px-5 py-4">
        <div>
          <p className="font-code text-[10px] tracking-[0.22em] text-brass-400">THE MARGIN</p>
          <h2 className="font-display text-xl text-mist-100">
            Notes on page {page}
            {notes.length > 0 ? <span className="font-code ml-2 text-xs text-mist-500">· {notes.length}</span> : null}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-full border border-pine-600 text-mist-400 transition-all hover:rotate-90 hover:border-vermilion-500/60 hover:text-vermilion-400"
          aria-label="Close notes"
        >
          <IconX className="size-4" />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {notes.length === 0 ? (
          <div className="anim-fade-up mt-8 flex flex-col items-center text-center">
            <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-pine-600 text-pine-500">
              <IconPlus className="size-6" />
            </span>
            <p className="font-display mt-5 text-lg text-mist-300 italic">Nothing pinned to page {page} yet.</p>
            <p className="mt-2 max-w-[220px] text-[13px] leading-relaxed text-mist-500">
              Pin the first note — everyone who lands on this page will find it waiting.
            </p>
          </div>
        ) : (
          notes.map((n) => (
            <article
              key={n.id}
              className={`anim-pop rounded-lg border p-3.5 ${
                n.authorId === selfId ? "border-brass-500/35 bg-pine-800" : "border-pine-700 bg-pine-850"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Avatar name={n.author} id={n.authorId || n.author} size={26} />
                <span className="text-[13px] font-bold text-mist-200">
                  {n.author}
                  {n.authorId === selfId ? (
                    <span className="font-code ml-1.5 text-[10px] font-normal text-brass-400">you</span>
                  ) : null}
                </span>
                <span className="font-code ml-auto text-[10px] text-mist-600">{timeAgo(n.createdAt)}</span>
              </div>
              <p className="mt-2.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-mist-100">{n.body}</p>
            </article>
          ))
        )}
      </div>

      <footer className="border-t border-pine-700 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <textarea
          ref={fieldRef}
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          rows={3}
          placeholder={`Write to the margin of page ${page}…`}
          className="w-full resize-none rounded-md border border-pine-600 bg-pine-850 px-3.5 py-2.5 text-[13.5px] text-mist-100 placeholder-mist-600 transition-colors outline-none focus:border-brass-500/70"
        />
        <div className="mt-2.5 flex items-center justify-between">
          <span className="font-code text-[10px] text-mist-600">ctrl/⌘ + enter</span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !draft.trim()}
            className="btn-sweep min-h-11 rounded-md bg-brass-500 px-4 py-2 text-[13px] font-bold text-pine-950 transition-all enabled:hover:bg-brass-400 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Pin to page {page}
          </button>
        </div>
      </footer>
    </aside>
  );
}
