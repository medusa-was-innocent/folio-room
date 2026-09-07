import type { PDFDocumentProxy } from "pdfjs-dist";
import { copyToBuffer } from "@/lib/doc";

let configured = false;

export async function openPdfDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist");
  if (!configured) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    configured = true;
  }
  return pdfjs.getDocument({
    data: copyToBuffer(data),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
}
