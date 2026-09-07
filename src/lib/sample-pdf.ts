/** Bundled samples so a room is readable without an upload. */

async function loadBytes(path: string, label: string): Promise<Uint8Array> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load the ${label}`);
  const copy = new Uint8Array(await res.arrayBuffer());
  if (copy.byteLength < 32) throw new Error(`Could not load the ${label}`);
  return copy;
}

export async function loadSamplePdf(): Promise<Uint8Array> {
  return loadBytes("/sample.pdf", "sample PDF");
}

export async function loadSampleEpub(): Promise<Uint8Array> {
  return loadBytes("/sample.epub", "sample EPUB");
}
