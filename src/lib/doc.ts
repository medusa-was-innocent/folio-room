export type DocKind = "pdf" | "epub";

export function detectKind(name: string, bytes: Uint8Array): DocKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".epub")) return "epub";
  if (lower.endsWith(".pdf")) return "pdf";
  if (bytes.byteLength >= 5) {
    const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!);
    if (sig === "%PDF-") return "pdf";
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return "epub";
  return "pdf";
}

export function copyToBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

export function isAcceptedFile(file: File): boolean {
  const n = file.name.toLowerCase();
  const t = (file.type || "").toLowerCase();
  return (
    n.endsWith(".pdf") ||
    n.endsWith(".epub") ||
    t === "application/pdf" ||
    t === "application/x-pdf" ||
    t === "application/epub+zip" ||
    t === "application/zip"
  );
}

export function looksLikeBook(bytes: Uint8Array): boolean {
  if (bytes.byteLength >= 5) {
    const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!);
    if (sig === "%PDF-") return true;
  }
  return bytes.byteLength >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}
