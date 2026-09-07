import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { type DocKind } from "@/lib/doc";
import { applyEpubZoom, parseEpub, resolveChapterHref, type EpubChapter } from "@/lib/epub";
import { openPdfDocument } from "@/lib/pdf-engine";
import {
  IconChevronL,
  IconChevronR,
  IconCompress,
  IconExpand,
  IconPlus,
  IconReset,
  IconZoomIn,
  IconZoomOut,
  Spinner,
} from "@/components/bits";

const ZOOMS = [0.7, 0.85, 1, 1.15, 1.35, 1.6];
const DEFAULT_ZOOM = 2;

type FolioViewerProps = {
  data: Uint8Array;
  kind: DocKind;
  page: number;
  onPage: (page: number) => void;
  fileName: string | null;
  notesCount: number;
  onOpenNotes: () => void;
  onReadyPages?: (n: number) => void;
  focus?: boolean;
  onToggleFocus?: () => void;
};

export function FolioViewer({
  data,
  kind,
  page,
  onPage,
  fileName,
  notesCount,
  onOpenNotes,
  onReadyPages,
  focus,
  onToggleFocus,
}: FolioViewerProps) {
  if (kind === "epub") {
    return (
      <EpubPane
        data={data}
        page={page}
        onPage={onPage}
        fileName={fileName}
        notesCount={notesCount}
        onOpenNotes={onOpenNotes}
        onReadyPages={onReadyPages}
        focus={focus}
        onToggleFocus={onToggleFocus}
      />
    );
  }
  return (
    <PdfPane
      data={data}
      page={page}
      onPage={onPage}
      fileName={fileName}
      notesCount={notesCount}
      onOpenNotes={onOpenNotes}
      onReadyPages={onReadyPages}
      focus={focus}
      onToggleFocus={onToggleFocus}
    />
  );
}

function PdfPane({
  data,
  page,
  onPage,
  fileName,
  notesCount,
  onOpenNotes,
  onReadyPages,
  focus,
  onToggleFocus,
}: Omit<FolioViewerProps, "kind">) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReadyPages);
  readyRef.current = onReadyPages;
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM);
  const [fit, setFit] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setLoading(true);
    setError(null);
    setDoc(null);
    (async () => {
      try {
        loaded = await openPdfDocument(data);
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setDoc(loaded);
        setPageCount(loaded.numPages);
        readyRef.current?.(loaded.numPages);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setDoc(null);
          setError(err instanceof Error ? err.message : "Could not open that PDF");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [data]);

  useEffect(() => {
    if (!doc) return;
    const el = wrapRef.current;
    if (!el) return;
    let cancelled = false;
    const update = () => {
      void doc
        .getPage(1)
        .then((first) => {
          if (cancelled) return;
          const base = first.getViewport({ scale: 1 });
          const availW = Math.max(40, el.clientWidth - 32);
          const availH = Math.max(80, el.clientHeight - 32);
          const next = Math.min(availW / base.width, availH / base.height);
          if (next > 0) setFit(Math.min(2.4, Math.max(0.35, next)));
        })
        .catch(() => {
          /* keep last fit */
        });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [doc, focus]);

  const scale = fit * ZOOMS[zoomIdx]!;

  useLayoutEffect(() => {
    if (!doc) return;
    const safe = Math.min(doc.numPages, Math.max(1, page));
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const pdfPage = await doc.getPage(safe);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const outputScale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#f7f1e2";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      task = pdfPage.render({
        canvasContext: ctx,
        viewport,
        transform,
        background: "#f7f1e2",
      });
      await task.promise;
    })().catch(() => {
      if (!cancelled) setError("Could not draw this page");
    });
    return () => {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [doc, page, scale]);

  useEffect(() => {
    wrapRef.current?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <ReaderShell
      page={page}
      pageCount={pageCount}
      onPage={onPage}
      loading={loading}
      error={error}
      zoomIdx={zoomIdx}
      setZoomIdx={setZoomIdx}
      notesCount={notesCount}
      onOpenNotes={onOpenNotes}
      kindLabel={fileName}
      focus={focus}
      onToggleFocus={onToggleFocus}
    >
      <div ref={wrapRef} className="flex h-full min-h-0 justify-center overflow-auto px-3 py-4 sm:px-6">
        <canvas
          ref={canvasRef}
          className="m-auto h-auto max-w-full rounded-xs bg-paper-50 shadow-[0_26px_70px_-18px_rgba(0,0,0,0.65)] ring-1 ring-black/40"
        />
      </div>
    </ReaderShell>
  );
}

function EpubPane({
  data,
  page,
  onPage,
  fileName,
  notesCount,
  onOpenNotes,
  onReadyPages,
  focus,
  onToggleFocus,
}: Omit<FolioViewerProps, "kind">) {
  const readyRef = useRef(onReadyPages);
  readyRef.current = onReadyPages;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingHash = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [chapters, setChapters] = useState<EpubChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM);

  useEffect(() => {
    let cancelled = false;
    let revoke: (() => void) | undefined;
    setError(null);
    setChapters([]);
    setLoading(true);
    (async () => {
      try {
        const parsed = await parseEpub(data);
        revoke = parsed.revoke;
        if (cancelled) {
          parsed.revoke();
          return;
        }
        setChapters(parsed.chapters);
        readyRef.current?.(parsed.chapters.length);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open that EPUB");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [data]);

  const count = chapters.length || 1;
  const safePage = Math.min(count, Math.max(1, page));
  const chapter = chapters[safePage - 1];
  const zoom = ZOOMS[zoomIdx]!;

  const scrollToHash = useCallback((doc: Document | null, hash: string) => {
    if (!doc || !hash) return;
    const id = decodeURIComponent(hash);
    const el =
      doc.getElementById(id) ||
      doc.querySelector(`[name="${CSS.escape(id)}"]`) ||
      doc.querySelector(`a[id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !chapter) return;
    let doc: Document | null = null;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (/^(https?:|mailto:)/i.test(href)) {
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const hit = resolveChapterHref(chapters, chapter.path, href);
      if (!hit) return;
      const nextPage = hit.index + 1;
      if (nextPage !== safePage) {
        pendingHash.current = hit.hash;
        onPage(nextPage);
        return;
      }
      scrollToHash(iframe.contentDocument, hit.hash);
    };
    const bind = () => {
      const nextDoc = iframe.contentDocument;
      if (!nextDoc) return;
      if (doc && doc !== nextDoc) doc.removeEventListener("click", onClick);
      if (doc !== nextDoc) {
        doc = nextDoc;
        doc.addEventListener("click", onClick);
      }
      const hash = pendingHash.current;
      if (hash) {
        pendingHash.current = "";
        window.setTimeout(() => scrollToHash(doc, hash), 40);
      }
    };
    iframe.addEventListener("load", bind);
    bind();
    return () => {
      iframe.removeEventListener("load", bind);
      doc?.removeEventListener("click", onClick);
    };
  }, [chapter, chapters, onPage, safePage, scrollToHash]);

  return (
    <ReaderShell
      page={safePage}
      pageCount={chapters.length}
      onPage={onPage}
      loading={loading}
      error={error}
      zoomIdx={zoomIdx}
      setZoomIdx={setZoomIdx}
      notesCount={notesCount}
      onOpenNotes={onOpenNotes}
      kindLabel={chapter?.title ?? fileName}
      focus={focus}
      onToggleFocus={onToggleFocus}
    >
      <div className="absolute inset-0 flex min-h-0 justify-center p-3 sm:p-5">
        <div className="relative h-full w-full max-w-3xl overflow-hidden rounded-xs bg-paper-50 shadow-[0_26px_70px_-18px_rgba(0,0,0,0.65)] ring-1 ring-black/40">
          {chapter ? (
            <iframe
              ref={iframeRef}
              key={chapter.path}
              title={chapter.title}
              className="epub-frame"
              sandbox="allow-same-origin"
              srcDoc={applyEpubZoom(chapter.html, zoom)}
            />
          ) : error ? null : (
            <p className="px-6 py-16 text-center text-sm text-mist-500">Opening the EPUB…</p>
          )}
        </div>
      </div>
    </ReaderShell>
  );
}

function ReaderShell({
  page,
  pageCount,
  onPage,
  loading,
  error,
  zoomIdx,
  setZoomIdx,
  notesCount,
  onOpenNotes,
  kindLabel,
  focus,
  onToggleFocus,
  children,
}: {
  page: number;
  pageCount: number;
  onPage: (n: number) => void;
  loading: boolean;
  error: string | null;
  zoomIdx: number;
  setZoomIdx: (fn: (z: number) => number) => void;
  notesCount: number;
  onOpenNotes: () => void;
  kindLabel?: string | null;
  focus?: boolean;
  onToggleFocus?: () => void;
  children: React.ReactNode;
}) {
  const zoom = ZOOMS[zoomIdx]!;
  const prev = useCallback(() => onPage(Math.max(1, page - 1)), [onPage, page]);
  const next = useCallback(
    () => onPage(pageCount > 0 ? Math.min(pageCount, page + 1) : page + 1),
    [onPage, page, pageCount],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
      if (e.key === "ArrowLeft" || e.key === "k" || e.key === "K" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight" || e.key === "j" || e.key === "J" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onOpenNotes();
      } else if ((e.key === "f" || e.key === "F") && onToggleFocus) {
        e.preventDefault();
        onToggleFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, onOpenNotes, onToggleFocus, prev]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-mist-500">
            <Spinner className="size-7 text-brass-400" />
            <p className="font-code text-xs tracking-[0.18em]">OPENING THE BOOK…</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-2xl text-vermilion-400 italic">The book would not open.</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-mist-500">{error}</p>
          </div>
        ) : (
          children
        )}
        {!loading && !error ? (
          <button
            type="button"
            onClick={onOpenNotes}
            className="group absolute right-4 bottom-4 z-20 flex size-14 items-center justify-center overflow-visible rounded-full bg-brass-500 text-pine-950 shadow-[0_14px_36px_-8px_rgba(211,160,68,0.55)] transition-transform duration-300 hover:scale-105 active:scale-95"
            aria-label={notesCount > 0 ? `Notes on page ${page}` : `Add a note on page ${page}`}
          >
            <IconPlus className="size-6" />
            {notesCount > 0 ? (
              <span
                className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-vermilion-500"
                aria-hidden="true"
              />
            ) : null}
          </button>
        ) : null}
      </div>

      <footer className="folio-chrome-bottom flex shrink-0 items-center justify-between gap-2 border-t border-pine-700 bg-pine-900/80 px-2 backdrop-blur-sm sm:gap-3 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            disabled={page <= 1 || loading}
            className="flex size-11 items-center justify-center rounded-full border border-pine-600 text-mist-300 transition-all enabled:hover:-translate-x-0.5 enabled:hover:border-brass-500/60 enabled:hover:text-brass-300 disabled:opacity-30"
            aria-label="Previous page"
          >
            <IconChevronL className="size-4" />
          </button>
          <button
            onClick={next}
            disabled={(pageCount > 0 && page >= pageCount) || loading}
            className="flex size-11 items-center justify-center rounded-full border border-pine-600 text-mist-300 transition-all enabled:hover:translate-x-0.5 enabled:hover:border-brass-500/60 enabled:hover:text-brass-300 disabled:opacity-30"
            aria-label="Next page"
          >
            <IconChevronR className="size-4" />
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <span className="font-code rounded-full border border-pine-600 bg-pine-850 px-3 py-1.5 text-[13px] text-brass-300 tabular-nums sm:px-4">
            {page} / {pageCount || "…"}
          </span>
          {kindLabel ? (
            <span className="font-display hidden max-w-[220px] truncate text-sm text-mist-400 italic md:block">
              {kindLabel}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
            disabled={zoomIdx === 0}
            className="flex size-11 items-center justify-center rounded-md text-mist-400 transition-colors enabled:hover:bg-pine-800 enabled:hover:text-brass-300 disabled:opacity-30"
            aria-label="Zoom out"
          >
            <IconZoomOut className="size-4" />
          </button>
          <span className="font-code w-10 text-center text-xs text-mist-400 tabular-nums sm:w-12">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))}
            disabled={zoomIdx === ZOOMS.length - 1}
            className="flex size-11 items-center justify-center rounded-md text-mist-400 transition-colors enabled:hover:bg-pine-800 enabled:hover:text-brass-300 disabled:opacity-30"
            aria-label="Zoom in"
          >
            <IconZoomIn className="size-4" />
          </button>
          {zoomIdx !== DEFAULT_ZOOM ? (
            <button
              onClick={() => setZoomIdx(() => DEFAULT_ZOOM)}
              className="anim-pop ml-0.5 flex size-11 items-center justify-center rounded-md text-mist-500 transition-colors hover:bg-pine-800 hover:text-brass-300"
              aria-label="Reset zoom"
            >
              <IconReset className="size-4" />
            </button>
          ) : null}
          {onToggleFocus ? (
            <button
              onClick={onToggleFocus}
              className="ml-0.5 flex size-11 items-center justify-center rounded-md text-mist-400 transition-colors hover:bg-pine-800 hover:text-brass-300"
              aria-label={focus ? "Exit full screen" : "Full screen"}
              title={focus ? "Exit full screen" : "Full screen"}
            >
              {focus ? <IconCompress className="size-4" /> : <IconExpand className="size-4" />}
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
