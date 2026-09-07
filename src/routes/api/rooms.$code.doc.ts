import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

function toNodeBuffer(bytes: unknown): Buffer | null {
  if (!bytes) return null;
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (typeof bytes === "string") {
    if (bytes.startsWith("\\x")) return Buffer.from(bytes.slice(2), "hex");
    return Buffer.from(bytes, "base64");
  }
  try {
    return Buffer.from(bytes as ArrayBuffer);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/rooms/$code/doc")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const code = String(params.code || "").toUpperCase();
        const sql = await getSql();
        const rooms = await sql.query<{ source: string; kind: string }>(
          "select source, kind from folio_rooms where code = $1",
          [code],
        );
        const room = rooms[0];
        if (!room) return new Response("Room not found", { status: 404 });
        if (room.source === "sample-pdf") {
          return Response.redirect("/sample.pdf", 302);
        }
        if (room.source === "sample-epub") {
          return Response.redirect("/sample.epub", 302);
        }
        const docs = await sql.query<{ bytes: unknown }>("select bytes from folio_docs where code = $1", [code]);
        const buf = toNodeBuffer(docs[0]?.bytes);
        if (!buf || buf.byteLength === 0) {
          return new Response("No document in this room yet", {
            status: 404,
            headers: { "Cache-Control": "no-store" },
          });
        }
        const type = room.kind === "epub" ? "application/epub+zip" : "application/pdf";
        const urlRev = new URL(request.url).searchParams.get("r") || "0";
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": type,
            "Content-Length": String(buf.byteLength),
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            Pragma: "no-cache",
            ETag: `"${code}-${urlRev}-${buf.byteLength}"`,
          },
        });
      },
    },
  },
});
