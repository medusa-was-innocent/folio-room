import type JSZip from "jszip";
import { copyToBuffer } from "@/lib/doc";

export type EpubChapter = {
  title: string;
  html: string;
  path: string;
  ids: string[];
};

export type ParsedEpub = {
  chapters: EpubChapter[];
  revoke: () => void;
};

function joinPath(baseDir: string, rel: string): string {
  if (/^(https?:|data:|blob:|#)/i.test(rel)) return rel;
  const trimmed = rel.split("#")[0] ?? rel;
  if (!trimmed) return rel;
  if (trimmed.startsWith("/")) return trimmed.slice(1);
  const parts = `${baseDir}${trimmed}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i + 1);
}

function mimeFor(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".otf")) return "font/otf";
  if (lower.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
}

function remember(map: Map<string, string>, path: string, url: string) {
  const aliases = new Set<string>([path, path.replace(/^\.\//, "")]);
  try {
    aliases.add(decodeURIComponent(path));
  } catch {
    /* ignore */
  }
  const base = path.split("/").pop();
  if (base) aliases.add(base);
  for (const key of aliases) map.set(key, url);
}

function findBlob(map: Map<string, string>, path: string): string | undefined {
  const tries = [path, path.replace(/^\.\//, "")];
  try {
    tries.push(decodeURIComponent(path));
  } catch {
    /* ignore */
  }
  for (const t of tries) {
    const hit = map.get(t);
    if (hit) return hit;
  }
  const lower = path.toLowerCase();
  for (const [k, v] of map) if (k.toLowerCase() === lower) return v;
  const base = path.split("/").pop()?.toLowerCase();
  if (base) {
    for (const [k, v] of map) if (k.split("/").pop()?.toLowerCase() === base) return v;
  }
  return undefined;
}

const PAGE_CSS = `
  html { background: #f7f1e2; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: Fraunces, Georgia, "Iowan Old Style", "Times New Roman", serif;
    background: #f7f1e2;
    color: #1f261f;
    padding: 2.5rem 2rem 4rem;
    line-height: 1.8;
    font-size: 1.28rem;
    max-width: 40rem;
    margin: 0 auto;
  }
  h1, h2, h3, h4 { font-weight: 600; line-height: 1.3; color: #1f261f; }
  h1 { font-size: 2.1rem; margin: 0 0 1rem; }
  h2 { font-size: 1.6rem; margin: 0 0 0.85rem; }
  p { margin: 0 0 1em; }
  img, svg, image { max-width: 100%; height: auto; }
  a { color: #8a6120; cursor: pointer; }
  blockquote { margin: 1.2em 0; padding-left: 1em; border-left: 3px solid #d3a044; font-style: italic; }
`;

const PAGE_OVERRIDE = `
  html, body {
    background: #f7f1e2 !important;
    color: #1f261f !important;
  }
  body {
    visibility: visible !important;
    opacity: 1 !important;
    overflow: visible !important;
    height: auto !important;
    max-width: 40rem !important;
    font-size: 1.28rem !important;
    line-height: 1.8 !important;
  }
  p, li, dd, blockquote, td, th, h1, h2, h3, h4, h5, h6, article, section {
    color: #1f261f !important;
    visibility: visible !important;
    opacity: 1 !important;
    -webkit-text-fill-color: currentColor;
  }
  p, li, dd, blockquote {
    font-size: 1em !important;
    line-height: 1.8 !important;
  }
  img, svg, image { max-width: 100% !important; height: auto !important; }
`;

export function applyEpubZoom(html: string, zoom: number): string {
  const pct = Math.round(Math.max(0.5, zoom) * 100);
  const tag = `<style>html{font-size:${pct}% !important}</style>`;
  if (html.includes("</head>")) return html.replace("</head>", `${tag}</head>`);
  return `<head>${tag}</head>${html}`;
}

function normPath(path: string): string {
  return path.replace(/^\.\//, "").replace(/\\/g, "/").toLowerCase();
}

function fileName(path: string): string {
  return (path.split("/").pop() || "").toLowerCase();
}

/** Resolve a TOC / in-book link to a spine chapter. */
export function resolveChapterHref(
  chapters: EpubChapter[],
  fromPath: string,
  href: string,
): { index: number; hash: string } | null {
  const raw = href.trim();
  if (!raw || /^(mailto:|javascript:|data:)/i.test(raw)) return null;
  if (/^https?:/i.test(raw)) return null;

  const hashAt = raw.indexOf("#");
  const file = (hashAt === -1 ? raw : raw.slice(0, hashAt)).trim();
  const hash = (hashAt === -1 ? "" : raw.slice(hashAt + 1)).trim();

  const currentIdx = chapters.findIndex((c) => normPath(c.path) === normPath(fromPath));

  if (!file || file === "." || file === "./") {
    if (hash) {
      const here = currentIdx >= 0 ? chapters[currentIdx] : null;
      if (here?.ids.includes(hash)) return { index: currentIdx < 0 ? 0 : currentIdx, hash };
      const other = chapters.findIndex((c) => c.ids.includes(hash));
      if (other >= 0) return { index: other, hash };
    }
    return { index: currentIdx < 0 ? 0 : currentIdx, hash };
  }

  const resolved = joinPath(dirOf(fromPath), file);
  const want = normPath(resolved);
  const wantName = fileName(resolved);
  let idx = chapters.findIndex((c) => normPath(c.path) === want);
  if (idx < 0) idx = chapters.findIndex((c) => fileName(c.path) === wantName);
  if (idx < 0 && hash) idx = chapters.findIndex((c) => c.ids.includes(hash));
  if (idx < 0) return null;
  return { index: idx, hash };
}

export async function parseEpub(data: Uint8Array): Promise<ParsedEpub> {
  const JSZipMod = (await import("jszip")).default;
  const zip = await JSZipMod.loadAsync(data);
  const blobs: string[] = [];
  const blobFor = new Map<string, string>();

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (/\.(xhtml|html|xml|opf|ncx|htm)$/i.test(path)) continue;
    const bytes = await entry.async("uint8array");
    const url = URL.createObjectURL(new Blob([copyToBuffer(bytes)], { type: mimeFor(path) }));
    blobs.push(url);
    remember(blobFor, path, url);
  }

  const revoke = () => {
    for (const url of blobs) URL.revokeObjectURL(url);
  };

  try {
    const containerEntry = zip.file("META-INF/container.xml");
    if (!containerEntry) throw new Error("This EPUB is missing its container file.");
    const containerXml = await containerEntry.async("text");
    const container = new DOMParser().parseFromString(containerXml, "text/xml");
    const rootfile = container.getElementsByTagName("rootfile")[0];
    const opfPath = rootfile?.getAttribute("full-path");
    if (!opfPath) throw new Error("This EPUB does not point to a package file.");

    const opfEntry = zip.file(opfPath);
    if (!opfEntry) throw new Error("This EPUB package file is missing.");
    const opfXml = await opfEntry.async("text");
    const opf = new DOMParser().parseFromString(opfXml, "text/xml");
    const opfDir = dirOf(opfPath);

    const hrefById = new Map<string, string>();
    for (const item of Array.from(opf.getElementsByTagName("item"))) {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      if (id && href) hrefById.set(id, href);
    }

    const spineHrefs: string[] = [];
    for (const ref of Array.from(opf.getElementsByTagName("itemref"))) {
      if (ref.getAttribute("linear") === "no") continue;
      const idref = ref.getAttribute("idref");
      const href = idref ? hrefById.get(idref) : null;
      if (href) spineHrefs.push(joinPath(opfDir, href));
    }
    if (spineHrefs.length === 0) throw new Error("This EPUB has no chapters.");

    const chapters: EpubChapter[] = [];
    for (const href of spineHrefs) {
      const file = zip.file(href) ?? zip.file(decodeURIComponent(href));
      if (!file) continue;
      const raw = await file.async("text");
      chapters.push(await chapterFrom(raw, href, zip, blobFor));
    }
    if (chapters.length === 0) throw new Error("Could not read any EPUB chapters.");
    return { chapters, revoke };
  } catch (err) {
    revoke();
    throw err;
  }
}

async function chapterFrom(
  raw: string,
  href: string,
  zip: JSZip,
  blobFor: Map<string, string>,
): Promise<EpubChapter> {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const base = dirOf(href);

  const rewriteUrl = (value: string | null): string | null => {
    if (!value || /^(https?:|data:|blob:|#|mailto:)/i.test(value)) return null;
    const resolved = joinPath(base, value);
    return findBlob(blobFor, resolved) ?? findBlob(blobFor, value) ?? null;
  };

  for (const el of Array.from(doc.querySelectorAll("[src], [href], [srcset]"))) {
    const tag = el.tagName.toLowerCase();
    if (el.hasAttribute("src")) {
      const next = rewriteUrl(el.getAttribute("src"));
      if (next) el.setAttribute("src", next);
    }
    if (el.hasAttribute("href") && tag !== "a") {
      const next = rewriteUrl(el.getAttribute("href"));
      if (next) el.setAttribute("href", next);
    }
    if (el.hasAttribute("srcset")) {
      const srcset = el.getAttribute("srcset") || "";
      const rewritten = srcset
        .split(",")
        .map((part) => {
          const bits = part.trim().split(/\s+/);
          const url = bits[0];
          const rest = bits.slice(1).join(" ");
          const blob = url ? rewriteUrl(url) : null;
          return blob ? `${blob}${rest ? ` ${rest}` : ""}` : part.trim();
        })
        .join(", ");
      el.setAttribute("srcset", rewritten);
    }
  }
  for (const el of Array.from(doc.getElementsByTagName("image"))) {
    const hrefAttr = el.getAttribute("href") || el.getAttribute("xlink:href");
    const next = rewriteUrl(hrefAttr);
    if (next) {
      el.setAttribute("href", next);
      el.setAttribute("xlink:href", next);
    }
  }

  const cssParts: string[] = [PAGE_CSS];
  for (const link of Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))) {
    const value = link.getAttribute("href");
    if (!value || /^(https?:|data:|blob:)/i.test(value)) continue;
    const path = joinPath(base, value);
    const file = zip.file(path) ?? zip.file(decodeURIComponent(path));
    if (!file) continue;
    let css = await file.async("text");
    css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, _q: string, u: string) => {
      if (/^(https?:|data:|blob:)/i.test(u)) return `url(${u})`;
      const resolved = joinPath(dirOf(path), u);
      const blob = findBlob(blobFor, resolved) ?? findBlob(blobFor, u);
      return blob ? `url("${blob}")` : `url(${u})`;
    });
    cssParts.push(css);
    link.remove();
  }
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    if (style.textContent) cssParts.push(style.textContent);
    style.remove();
  }
  cssParts.push(PAGE_OVERRIDE);

  const title =
    doc.querySelector("h1, h2, h3, title")?.textContent?.trim() ||
    href.split("/").pop()?.replace(/\.(xhtml|html|htm)$/i, "") ||
    "Chapter";
  const bodyEl = doc.body;
  const body = bodyEl?.innerHTML?.trim() || raw;
  const ids = Array.from(doc.querySelectorAll("[id], a[name]"))
    .map((el) => el.getAttribute("id") || el.getAttribute("name") || "")
    .filter(Boolean);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap"/><style>${cssParts.join("\n")}</style></head><body>${body}</body></html>`;
  return { title, html, path: href, ids };
}
