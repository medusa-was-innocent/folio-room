import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolioViewer } from "@/components/folio-viewer";
import { NotesSheet } from "@/components/notes-sheet";
import {
  Avatar,
  Bar,
  IconBook,
  IconCheck,
  IconCopy,
  IconLeave,
  IconMenu,
  IconUpload,
  IconUsers,
  IconX,
  Spinner,
  Switch,
  ToastHost,
  useScramble,
  type Toast,
  type ToastTone,
} from "@/components/bits";
import { detectKind, isAcceptedFile, looksLikeBook, type DocKind } from "@/lib/doc";
import { formatBytes } from "@/lib/format";
import {
  addNote,
  CHUNK_BYTES,
  getSnapshot,
  joinRoom,
  leaveRoom,
  MAX_DOC_BYTES,
  placeSample,
  setPage as setPageRemote,
  setPageCount,
  uploadAbort,
  uploadBegin,
  uploadChunk,
  uploadFinish,
  type NoteRow,
  type RoomSnapshot,
} from "@/lib/folio-api";
import { loadSampleEpub, loadSamplePdf } from "@/lib/sample-pdf";
import { blobToBase64, delay, getClientId } from "@/lib/utils";

type RoomSessionProps = {
  code: string;
  name: string;
  hostSecret: string;
};

function docKey(next: RoomSnapshot) {
  return `${next.source}:${next.fileName ?? ""}:${next.kind}:${next.docRev}`;
}

export function RoomSession({ code, name, hostSecret }: RoomSessionProps) {
  const navigate = useNavigate();
  const clientIdRef = useRef("");
  const [clientReady, setClientReady] = useState(false);
  const [isHost, setIsHost] = useState(Boolean(hostSecret));
  const [missing, setMissing] = useState(false);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [kind, setKind] = useState<DocKind>("pdf");
  const [page, setPage] = useState(1);
  const [followHost, setFollowHost] = useState(true);
  const [opening, setOpening] = useState(true);
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focus, setFocus] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [localName, setLocalName] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const followRef = useRef(followHost);
  const hostRef = useRef(isHost);
  const pageRef = useRef(page);
  const loadedSource = useRef("");
  const lastCount = useRef(0);
  const uploadingRef = useRef(false);
  const loadingDocRef = useRef("");
  const loadGen = useRef(0);
  const hasDocRef = useRef(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrambled = useScramble(code);

  const push = useCallback((msg: string, tone: ToastTone = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, msg, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => {
    followRef.current = followHost;
  }, [followHost]);
  useEffect(() => {
    hostRef.current = isHost;
  }, [isHost]);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    clientIdRef.current = getClientId();
    setClientReady(true);
  }, []);

  const applyNotes = useCallback((_pageNum: number, list: NoteRow[]) => {
    setNotes(list);
  }, []);

  const loadDocument = useCallback(
    async (next: RoomSnapshot, opts?: { quiet?: boolean }) => {
      if (uploadingRef.current) return;
      const key = docKey(next);
      if (loadedSource.current === key || loadingDocRef.current === key) return;
      if (next.source === "none") {
        loadedSource.current = key;
        hasDocRef.current = false;
        setPdfBytes(null);
        setLocalName(null);
        setOpening(false);
        return;
      }
      loadingDocRef.current = key;
      const gen = ++loadGen.current;
      if (!hasDocRef.current) setOpening(true);
      try {
        let bytes: Uint8Array | null = null;
        if (next.source === "sample-pdf") bytes = await loadSamplePdf();
        else if (next.source === "sample-epub") bytes = await loadSampleEpub();
        else {
          let lastErr = "pending";
          for (let attempt = 0; attempt < 8; attempt++) {
            try {
              const res = await fetch(`/api/rooms/${next.code}/doc?r=${next.docRev}&n=${attempt}`, {
                cache: "no-store",
                headers: { Pragma: "no-cache" },
              });
              if (!res.ok) {
                lastErr = res.status === 404 ? "pending" : "fetch";
              } else {
                const buf = new Uint8Array(await res.arrayBuffer());
                if (buf.byteLength > 0) {
                  bytes = buf;
                  break;
                }
                lastErr = "empty";
              }
            } catch {
              lastErr = "network";
            }
            await delay(280 * (attempt + 1));
            if (loadGen.current !== gen) return;
          }
          if (!bytes) throw new Error(lastErr);
        }
        if (loadGen.current !== gen) return;
        loadedSource.current = key;
        lastCount.current = 0;
        hasDocRef.current = true;
        setKind(next.kind);
        setPdfBytes(bytes);
        setLocalName(next.fileName);
        setPage(next.hostPage || 1);
        setOpening(false);
      } catch {
        if (loadingDocRef.current === key) loadingDocRef.current = "";
        if (loadGen.current !== gen) return;
        if (!opts?.quiet) push("The book could not be fetched.", "bad");
        setOpening(false);
      } finally {
        if (loadingDocRef.current === key) loadingDocRef.current = "";
      }
    },
    [push],
  );

  useEffect(() => {
    if (!clientReady) return;
    let cancelled = false;
    void joinRoom({
      data: {
        code,
        name,
        clientId: clientIdRef.current,
        hostSecret: hostSecret || undefined,
      },
    }).then(async (res) => {
      if (cancelled) return;
      if (!res.ok) {
        setMissing(true);
        setOpening(false);
        return;
      }
      setIsHost(res.isHost);
      setSnap(res.snapshot);
      setPage(res.snapshot.hostPage || 1);
      applyNotes(res.snapshot.hostPage || 1, res.notes);
      await loadDocument(res.snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [applyNotes, clientReady, code, hostSecret, loadDocument, name]);

  const onPage = useCallback(
    (next: number, opts?: { fromFollow?: boolean }) => {
      if (next < 1) return;
      if (!opts?.fromFollow && !hostRef.current && followRef.current) {
        setFollowHost(false);
      }
      if (next !== pageRef.current) setNotesOpen(false);
      setPage(next);
      void setPageRemote({
        data: {
          code,
          clientId: clientIdRef.current,
          page: next,
          present: hostRef.current,
        },
      }).then((res) => {
        if (res.ok) {
          if (res.snapshot) setSnap(res.snapshot);
          applyNotes(next, res.notes);
        }
      });
    },
    [applyNotes, code],
  );

  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;

  useEffect(() => {
    if (!clientReady) return;
    let cancelled = false;
    const tick = () => {
      void getSnapshot({
        data: { code, clientId: clientIdRef.current, page: pageRef.current },
      }).then((res) => {
        if (cancelled || !res.ok) return;
        setSnap(res.snapshot);
        if (res.snapshot.source !== "none" && loadedSource.current !== docKey(res.snapshot)) {
          void loadDocument(res.snapshot, { quiet: true });
        }
        const following =
          !hostRef.current && followRef.current && res.snapshot.hostPage !== pageRef.current;
        if (following) {
          onPageRef.current(res.snapshot.hostPage, { fromFollow: true });
        } else if (res.notes) {
          applyNotes(pageRef.current, res.notes);
        }
      });
    };
    tick();
    const id = window.setInterval(tick, 700);
    const onWake = () => {
      if (document.visibilityState === "hidden") return;
      tick();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [applyNotes, clientReady, code, loadDocument]);

  const onReadyPages = useCallback(
    (n: number) => {
      if (n <= 0 || n === lastCount.current) return;
      lastCount.current = n;
      void setPageCount({ data: { code, pageCount: n } }).then((res) => {
        if (res.ok && res.snapshot) setSnap(res.snapshot);
      });
    },
    [code],
  );

  async function placeFile(file: File) {
    if (!hostSecret) {
      push("Only the host can place a document.", "warn");
      return;
    }
    if (uploadingRef.current) {
      push("A book is already being shared.", "warn");
      return;
    }

    setUploadPct(0);
    uploadingRef.current = true;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (buf.byteLength < 64) {
        push("That file looks empty.", "bad");
        return;
      }
      if (buf.byteLength > MAX_DOC_BYTES) {
        push("That file is larger than 10 MB.", "bad");
        return;
      }
      if (!isAcceptedFile(file) && !looksLikeBook(buf)) {
        push("Please choose a PDF or EPUB.", "warn");
        return;
      }
      const nextKind = detectKind(file.name, buf);
      const fileName = file.name.replace(/[/\\?%*:|"<>]/g, "-").trim().slice(0, 180) || (nextKind === "epub" ? "book.epub" : "book.pdf");
      const chunks = Math.max(1, Math.ceil(buf.byteLength / CHUNK_BYTES));

      const begin = await uploadBegin({
        data: {
          code,
          hostSecret,
          fileName,
          kind: nextKind,
          size: buf.byteLength,
          chunks,
        },
      });
      if (!begin.ok) {
        push(begin.error, "bad");
        return;
      }

      let failed: string | null = null;
      let finished = 0;
      const worker = async (offset: number) => {
        for (let i = offset; i < chunks; i += 3) {
          if (failed) return;
          const slice = buf.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
          const copy = new Uint8Array(slice.byteLength);
          copy.set(slice);
          const base64 = await blobToBase64(new Blob([copy]));
          let lastErr = "Could not upload that file.";
          let ok = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const part = await uploadChunk({ data: { code, hostSecret, index: i, base64 } });
              if (part.ok) {
                ok = true;
                break;
              }
              lastErr = part.error;
            } catch {
              lastErr = "Could not upload that file.";
            }
            await delay(350 * (attempt + 1));
          }
          if (!ok) {
            failed = lastErr;
            return;
          }
          finished += 1;
          setUploadPct(Math.round((finished / chunks) * 90));
        }
      };
      await Promise.all([worker(0), worker(1), worker(2)]);
      if (failed) {
        await uploadAbort({ data: { code, hostSecret } }).catch(() => undefined);
        push(failed, "bad");
        return;
      }

      setUploadPct(94);
      let published: Extract<Awaited<ReturnType<typeof uploadFinish>>, { ok: true }> | null = null;
      let publishErr = "Could not publish the book to the room.";
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await uploadFinish({
            data: {
              code,
              hostSecret,
              fileName,
              kind: nextKind,
              size: buf.byteLength,
              chunks,
            },
          });
          if (res.ok) {
            published = res;
            break;
          }
          publishErr = res.error;
        } catch {
          publishErr = "Could not publish the book to the room.";
        }
        if (attempt < 3) await delay(400 * (attempt + 1));
      }
      if (!published) {
        await uploadAbort({ data: { code, hostSecret } }).catch(() => undefined);
        push(publishErr, "bad");
        return;
      }

      const local = new Uint8Array(buf.byteLength);
      local.set(buf);
      lastCount.current = 0;
      hasDocRef.current = true;
      loadedSource.current = docKey(published.snapshot);
      setKind(nextKind);
      setPdfBytes(local);
      setLocalName(fileName);
      setPage(1);
      setNotes([]);
      setSnap(published.snapshot);
      setOpening(false);
      setUploadPct(100);
      push("The book is on the table — everyone can read it now.");
    } catch {
      await uploadAbort({ data: { code, hostSecret } }).catch(() => undefined);
      push("Could not upload that file.", "bad");
    } finally {
      uploadingRef.current = false;
      window.setTimeout(() => setUploadPct(null), 700);
    }
  }

  async function onSample(kindSample: "pdf" | "epub") {
    if (!hostSecret) return;
    const res = await placeSample({ data: { code, hostSecret, sample: kindSample } });
    if (!res.ok) {
      push(res.error, "bad");
      return;
    }
    loadedSource.current = "";
    lastCount.current = 0;
    setNotes([]);
    setLocalName(res.snapshot.fileName);
    setSnap(res.snapshot);
    await loadDocument(res.snapshot);
    push("Sample book set.");
  }

  async function copyInvite() {
    const url = `${window.location.origin}/r/${code}`;
    const text = `Join my Folio Room — code ${code} — ${url}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      push("Could not copy. Share the code by hand.", "warn");
      return;
    }
    setCopied(true);
    push("Invite copied — code and link together.");
    window.setTimeout(() => setCopied(false), 2200);
  }

  async function onLeave() {
    await leaveRoom({ data: { code, clientId: clientIdRef.current } });
    void navigate({ to: "/" });
  }

  const toggleFocus = useCallback(() => {
    setFocus((v) => {
      const next = !v;
      const root = document.documentElement;
      if (next) {
        void root.requestFullscreen?.().catch(() => undefined);
      } else if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => undefined);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setFocus(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (notesOpen) {
        setNotesOpen(false);
        return;
      }
      if (focus) toggleFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, notesOpen, page, toggleFocus]);

  const onDragOver = (e: DragEvent) => {
    if (!isHost) return;
    if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
  };
  const onDragEnter = (e: DragEvent) => {
    if (!isHost) return;
    dragDepth.current++;
    if (Array.from(e.dataTransfer.types).includes("Files")) setDragging(true);
  };
  const onDragLeave = () => {
    if (!isHost) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!isHost) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void placeFile(file);
  };

  const closeNotes = useCallback(() => {
    setNotesOpen(false);
  }, []);

  const total = snap?.pageCount || 0;
  const noteCount = snap?.notesSummary[String(page)] || notes.length || 0;
  const readers = snap?.readers ?? [];
  const myPct = total ? Math.round((page / total) * 100) : 0;

  if (missing) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-pine-950 px-5 text-mist-100">
        <section className="w-full max-w-md text-center">
          <p className="font-code text-[11px] tracking-[0.3em] text-brass-400">NO LAMP HERE</p>
          <h1 className="font-display mt-3 text-4xl font-semibold">Room not found</h1>
          <p className="mt-4 text-sm leading-relaxed text-mist-400">
            No reading room is open under {code}. Check the code, or open a new room.
          </p>
          <Link
            to="/"
            className="btn-sweep mt-8 inline-flex min-h-11 items-center rounded-md bg-brass-500 px-5 py-2.5 text-sm font-bold text-pine-950"
          >
            Back to the door
          </Link>
        </section>
      </main>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-pine-700 p-5">
        <div className="flex items-end justify-between">
          <p className="font-code text-[10px] tracking-[0.24em] text-mist-600">YOUR READING</p>
          <p className="font-display text-[42px] leading-none font-semibold text-brass-300 tabular-nums">
            {myPct}
            <span className="text-xl">%</span>
          </p>
        </div>
        <Bar value={total ? page / total : 0} className="mt-3 h-1" />
        <p className="font-code mt-2.5 text-[11px] text-mist-500">
          page {page} of {total || "…"}
          {!isHost ? (
            <span className={followHost ? "text-celadon-400" : "text-mist-600"}>
              {" "}
              · {followHost ? "following host" : "wandering free"}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <p className="font-code text-[10px] tracking-[0.24em] text-mist-600">IN THE ROOM</p>
        <span className="font-code flex items-center gap-1.5 rounded-full border border-pine-600 px-2 py-0.5 text-[10.5px] text-mist-400">
          <IconUsers className="size-3" />
          {readers.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {readers.map((r) => (
          <div key={r.id} className="anim-fade-up rounded-lg px-2 py-2 transition-colors hover:bg-pine-800/80">
            <div className="flex items-center gap-2.5">
              <span className="relative">
                <Avatar name={r.name} id={r.id} size={30} />
                <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-pine-900 bg-celadon-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-mist-200">
                  {r.name}
                  {r.id === clientIdRef.current ? (
                    <span className="font-code ml-1.5 text-[9.5px] font-normal text-brass-400">you</span>
                  ) : null}
                </p>
                <p className="font-code text-[9.5px] tracking-wider">
                  <span className={r.isHost ? "text-brass-400" : "text-mist-500"}>{r.isHost ? "HOST" : "READER"}</span>
                  <span className="text-mist-600"> · p.{r.page}</span>
                </p>
              </div>
              <span className="font-code text-[10.5px] text-mist-500 tabular-nums">{r.progress}%</span>
            </div>
            <Bar value={total ? r.page / total : 0} tone={r.id === clientIdRef.current ? "brass" : "dim"} className="mt-2" />
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-pine-700 p-5 text-[11.5px] leading-relaxed text-mist-500">
        <p>The book stays with the room — late joiners pick up the same pages and notes.</p>
        <p className="font-code text-[10.5px] tracking-wide text-mist-600">PDF · EPUB · 10 MB MAX</p>
      </div>
    </div>
  );

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden bg-pine-950 overscroll-none"
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {focus ? null : (
        <header className="folio-chrome-top flex shrink-0 items-center gap-2 border-b border-pine-700 bg-pine-900/85 px-2 backdrop-blur-sm sm:gap-3 sm:px-5">
          <button
            onClick={() => setSideOpen(true)}
            className="flex size-11 items-center justify-center rounded-md border border-pine-600 text-mist-400 lg:hidden"
            aria-label="Open people panel"
          >
            <IconMenu className="size-4" />
          </button>
          <span className="hidden items-center gap-2 sm:flex">
            <IconBook className="size-5 text-brass-400" />
            <span className="font-display text-lg text-mist-100 italic">Folio Room</span>
          </span>
          <span className="hidden h-6 w-px bg-pine-700 sm:block" />

          <div className="flex items-center gap-2 rounded-md border border-pine-600 bg-pine-850 py-1.5 pr-2 pl-3">
            <span className="font-code text-[9.5px] tracking-[0.2em] text-mist-600">TABLE</span>
            <span className="font-code text-[13px] font-bold tracking-[0.28em] text-brass-300">{scrambled}</span>
          </div>
          <button
            onClick={() => void copyInvite()}
            className="group flex min-h-11 items-center gap-1.5 rounded-md border border-pine-600 px-2.5 text-mist-400 transition-colors hover:border-brass-500/60 hover:text-brass-300"
            title="Copy invite"
          >
            {copied ? <IconCheck className="size-3.5 text-celadon-400" /> : <IconCopy className="size-3.5" />}
            <span className="hidden text-[12px] font-bold md:block">{copied ? "Copied" : "Invite"}</span>
          </button>
          <span className="font-code hidden items-center gap-1.5 text-[11px] text-mist-500 md:flex">
            <IconUsers className="size-3.5" />
            {readers.length} here
          </span>

          <span className="flex-1" />

          {localName || snap?.fileName ? (
            <span className="hidden min-w-0 items-center gap-2 sm:flex">
              <span
                className={`font-code rounded border px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider ${
                  kind === "pdf"
                    ? "border-brass-500/40 bg-brass-500/10 text-brass-300"
                    : "border-celadon-500/40 bg-celadon-500/10 text-celadon-300"
                }`}
              >
                {kind.toUpperCase()}
              </span>
              <span className="max-w-[150px] truncate text-[13px] font-semibold text-mist-300">
                {localName ?? snap?.fileName}
              </span>
              {snap?.fileSize && uploadPct === null ? (
                <span className="font-code text-[10px] text-mist-600">{formatBytes(snap.fileSize)}</span>
              ) : null}
            </span>
          ) : null}

          {isHost ? (
            <>
              <span className="font-code hidden rounded-full border border-brass-500/40 px-3 py-1 text-[9.5px] tracking-[0.2em] text-brass-400 lg:block">
                HOSTING
              </span>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex size-11 items-center justify-center rounded-md border border-pine-600 text-mist-300 transition-colors hover:border-brass-500/60 hover:text-brass-300 sm:hidden"
                aria-label={snap?.fileName ? "Replace book" : "Add book"}
              >
                <IconUpload className="size-3.5" />
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="hidden min-h-11 items-center gap-2 rounded-md border border-pine-600 px-3 text-[12.5px] font-bold text-mist-300 transition-colors hover:border-brass-500/60 hover:text-brass-300 sm:flex"
              >
                <IconUpload className="size-3.5" />
                {snap?.fileName ? "Replace" : "Add book"}
              </button>
            </>
          ) : (
            <Switch on={followHost} onChange={() => setFollowHost((v) => !v)} label="FOLLOW HOST" />
          )}

          <button
            onClick={() => void onLeave()}
            className="flex min-h-11 items-center gap-2 rounded-md border border-vermilion-500/50 px-3 text-[12.5px] font-bold text-vermilion-400 transition-colors hover:bg-vermilion-500/10"
          >
            <IconLeave className="size-3.5" />
            <span className="hidden sm:block">Leave</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.epub,application/pdf,application/epub+zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void placeFile(f);
              e.target.value = "";
            }}
          />
        </header>
      )}

      {uploadPct !== null ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-pine-700 bg-pine-900/90 px-3 py-2 sm:px-5">
          <Spinner className="size-3.5 text-brass-400" />
          <p className="font-code text-[10.5px] tracking-[0.18em] text-mist-400">
            BUFFERING ON THIS TABLE · THEN SHARING
          </p>
          <Bar value={uploadPct / 100} className="h-1 min-w-0 flex-1" />
          <span className="font-code text-[11px] text-brass-300 tabular-nums">{uploadPct}%</span>
        </div>
      ) : !isHost && snap?.uploading ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-pine-700 bg-pine-900/90 px-3 py-2 sm:px-5">
          <Spinner className="size-3.5 text-brass-400" />
          <p className="font-code text-[10.5px] tracking-[0.18em] text-mist-400">
            THE HOST IS PLACING A BOOK ON THE TABLE
          </p>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        {focus ? null : <aside className="hidden w-[290px] shrink-0 border-r border-pine-700 bg-pine-900/60 lg:block">{sidebar}</aside>}

        {sideOpen && !focus ? (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="w-[300px] border-r border-pine-700 bg-pine-900 shadow-2xl">{sidebar}</div>
            <button
              className="flex-1 bg-pine-950/70 backdrop-blur-sm"
              onClick={() => setSideOpen(false)}
              aria-label="Close people panel"
            >
              <IconX className="ml-4 size-5 text-mist-400" />
            </button>
          </div>
        ) : null}

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="lamp-breathe absolute -top-24 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(228,182,92,0.09),transparent_70%)]" />
            <span className="font-display absolute right-[-3rem] bottom-[-6rem] text-[26rem] leading-none text-pine-800/45 select-none">
              ¶
            </span>
          </div>

          <div className="relative z-10 min-h-0 flex-1">
            {opening && !pdfBytes ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-mist-500">
                <Spinner className="size-7 text-brass-400" />
                <p className="font-code text-xs tracking-[0.2em]">PULLING OUT A CHAIR…</p>
              </div>
            ) : !pdfBytes ? (
              isHost ? (
                <div className="flex h-full items-center justify-center p-6">
                  <div
                    className={`w-full max-w-xl rounded-lg border-2 border-dashed p-10 text-center transition-all duration-300 sm:p-14 ${
                      dragging ? "scale-[1.02] border-brass-400 bg-brass-500/5" : "border-pine-600 hover:border-brass-500/50"
                    }`}
                  >
                    <span className="mx-auto flex size-16 items-center justify-center rounded-full border border-brass-500/40 bg-pine-850 text-brass-400">
                      <IconUpload className="size-7" />
                    </span>
                    <h2 className="font-display mt-6 text-3xl text-mist-100">The table is empty</h2>
                    <p className="mx-auto mt-3 max-w-sm text-[14px] leading-relaxed text-mist-500">
                      Drag a book anywhere into this room, or choose one from your machine. Everyone who joins will
                      read the very same file.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="btn-sweep min-h-11 rounded-md bg-brass-500 px-5 py-2.5 text-[14px] font-bold text-pine-950 transition-colors hover:bg-brass-400"
                      >
                        Choose a book
                      </button>
                      <button
                        onClick={() => void onSample("pdf")}
                        className="flex min-h-11 items-center gap-2 rounded-md border border-pine-600 px-5 py-2.5 text-[14px] font-semibold text-mist-300 transition-colors hover:border-brass-500/60 hover:text-brass-300"
                      >
                        Set the sample PDF
                      </button>
                      <button
                        onClick={() => void onSample("epub")}
                        className="flex min-h-11 items-center gap-2 rounded-md border border-pine-600 px-5 py-2.5 text-[14px] font-semibold text-mist-300 transition-colors hover:border-brass-500/60 hover:text-brass-300"
                      >
                        Set the sample EPUB
                      </button>
                    </div>
                    <p className="font-code mt-6 text-[10px] tracking-[0.2em] text-mist-600">PDF · EPUB · UP TO 10 MB</p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <span className="flex items-end gap-1.5" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="size-2.5 animate-bounce rounded-full bg-brass-500/70"
                        style={{ animationDelay: `${i * 160}ms` }}
                      />
                    ))}
                  </span>
                  <h2 className="font-display mt-6 text-3xl text-mist-100 italic">
                    {snap?.uploading ? "The host is placing a book." : "The host hasn’t set a book yet."}
                  </h2>
                  <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-mist-500">
                    {snap?.uploading
                      ? "Stay in the chair — it will open here as soon as the file is on the table. No need to refresh."
                      : "Your chair is saved — the moment a book lands on the table, it opens right here."}
                  </p>
                </div>
              )
            ) : (
              <FolioViewer
                key={`${snap?.docRev ?? 0}:${kind}:${pdfBytes.byteLength}`}
                data={pdfBytes}
                kind={kind}
                page={page}
                onPage={onPage}
                fileName={snap?.fileName ?? null}
                notesCount={noteCount}
                onOpenNotes={() => {
                  setNotesOpen(true);
                }}
                onReadyPages={onReadyPages}
                focus={focus}
                onToggleFocus={toggleFocus}
              />
            )}
          </div>

          {notesOpen ? (
            <button
              type="button"
              className="absolute inset-0 z-30 bg-pine-950/45 backdrop-blur-[1px]"
              onClick={closeNotes}
              aria-label="Close notes"
            />
          ) : null}

          <NotesSheet
            open={notesOpen}
            page={page}
            notes={notes}
            selfId={clientIdRef.current}
            onClose={closeNotes}
            onPost={async (body) => {
              const res = await addNote({
                data: { code, clientId: clientIdRef.current, page, body },
              });
              if (res.ok) {
                setNotes(res.notes);
                if (res.snapshot) setSnap(res.snapshot);
              }
            }}
          />

          {dragging && isHost ? (
            <div className="pointer-events-none absolute inset-3 z-[60] flex items-center justify-center rounded-lg border-2 border-dashed border-brass-500 bg-pine-950/85 backdrop-blur-sm">
              <div className="anim-pop text-center">
                <IconUpload className="mx-auto size-10 text-brass-400" />
                <p className="font-display mt-4 text-3xl text-brass-300">Drop the book to place it</p>
                <p className="font-code mt-2 text-[11px] tracking-[0.2em] text-mist-500">
                  BUFFERED HERE FIRST · THEN THE WHOLE ROOM
                </p>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <ToastHost toasts={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      <div className="grain" aria-hidden="true" />
    </div>
  );
}
