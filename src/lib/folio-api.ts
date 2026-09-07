import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_DOC_BYTES = 10_000_000;
const CHUNK_BYTES = 256 * 1024;
const MAX_CHUNKS = 48;
const READER_TTL_MS = 25_000;

function makeCode(len = 6) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < len; i++) code += ALPHABET[bytes[i]! % ALPHABET.length]!;
  return code;
}

function secret() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function asBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(value as ArrayBuffer);
}

let schemaReady: Promise<void> | null = null;

async function folioSql(): Promise<Sql> {
  const sql = await getSql();
  schemaReady ??= (async () => {
    await sql.query(
      "alter table folio_rooms add column if not exists file_size integer not null default 0",
    );
    await sql.query(
      "alter table folio_rooms add column if not exists doc_rev integer not null default 0",
    );
    await sql.query(
      "alter table folio_rooms add column if not exists uploading_at timestamptz",
    );
    await sql.query(
      "alter table folio_notes add column if not exists author_id text not null default ''",
    );
    await sql.query(`
      create table if not exists folio_doc_chunks (
        code text not null references folio_rooms (code) on delete cascade,
        idx integer not null,
        bytes bytea not null,
        primary key (code, idx)
      )
    `);
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  await schemaReady;
  return sql;
}

export type DocSource = "none" | "sample-pdf" | "sample-epub" | "upload";
export type DocKind = "pdf" | "epub";

export type ReaderRow = {
  id: string;
  name: string;
  isHost: boolean;
  page: number;
  progress: number;
};

export type NoteRow = {
  id: string;
  author: string;
  authorId: string;
  body: string;
  page: number;
  createdAt: string;
};

export type RoomSnapshot = {
  code: string;
  fileName: string | null;
  fileSize: number;
  kind: DocKind;
  source: DocSource;
  pageCount: number;
  hostPage: number;
  docRev: number;
  uploading: boolean;
  readers: ReaderRow[];
  notesSummary: Record<string, number>;
};

type RoomRec = {
  code: string;
  host_secret: string;
  file_name: string | null;
  file_size: number | null;
  kind: string;
  source: string;
  page_count: number;
  host_page: number;
  doc_rev: number | null;
  uploading_at: string | Date | null;
};

function isUploading(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const ts = typeof value === "string" ? Date.parse(value) : value.getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < 120_000;
}

function safeFileName(name: string, kind: DocKind): string {
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, "-").trim();
  const sliced = cleaned.slice(0, 180);
  if (sliced) return sliced;
  return kind === "epub" ? "book.epub" : "book.pdf";
}

async function loadRoom(code: string) {
  const sql = await folioSql();
  const rows = await sql.query<RoomRec>(
    "select code, host_secret, file_name, file_size, kind, source, page_count, host_page, doc_rev, uploading_at from folio_rooms where code = $1",
    [code],
  );
  return rows[0] ?? null;
}

async function snapshot(code: string): Promise<RoomSnapshot | null> {
  const sql = await folioSql();
  const room = await loadRoom(code);
  if (!room) return null;
  const cutoff = new Date(Date.now() - READER_TTL_MS).toISOString();
  const readers = await sql.query<{
    client_id: string;
    name: string;
    is_host: boolean;
    page: number;
  }>(
    "select client_id, name, is_host, page from folio_readers where code = $1 and updated_at > $2 order by is_host desc, name asc",
    [code, cutoff],
  );
  const counts = await sql.query<{ page: number; n: number }>(
    "select page, count(*)::int as n from folio_notes where code = $1 group by page",
    [code],
  );
  const notesSummary: Record<string, number> = {};
  for (const row of counts) notesSummary[String(row.page)] = row.n;
  const total = room.page_count || 0;
  return {
    code: room.code,
    fileName: room.file_name,
    fileSize: Number(room.file_size || 0),
    kind: room.kind === "epub" ? "epub" : "pdf",
    source: (room.source as DocSource) || "none",
    pageCount: total,
    hostPage: room.host_page,
    docRev: Number(room.doc_rev || 0),
    uploading: isUploading(room.uploading_at),
    readers: readers.map((r) => ({
      id: r.client_id,
      name: r.name,
      isHost: Boolean(r.is_host),
      page: r.page,
      progress: total ? Math.min(100, Math.round((r.page / total) * 100)) : 0,
    })),
    notesSummary,
  };
}

async function notesFor(code: string, page: number): Promise<NoteRow[]> {
  const sql = await folioSql();
  const rows = await sql.query<{
    id: string;
    author: string;
    author_id: string | null;
    body: string;
    page: number;
    created_at: string | Date;
  }>(
    "select id, author, author_id, body, page, created_at from folio_notes where code = $1 and page = $2 order by created_at asc",
    [code, page],
  );
  return rows.map((n) => ({
    id: n.id,
    author: n.author,
    authorId: n.author_id || "",
    body: n.body,
    page: n.page,
    createdAt:
      typeof n.created_at === "string" ? n.created_at : new Date(n.created_at).toISOString(),
  }));
}

export const createRoom = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().min(1).max(40),
      sample: z.enum(["none", "pdf", "epub"]),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await folioSql();
    let code = makeCode();
    for (let i = 0; i < 8; i++) {
      const existing = await loadRoom(code);
      if (!existing) break;
      code = makeCode();
    }
    const hostSecret = secret();
    const source: DocSource =
      data.sample === "pdf" ? "sample-pdf" : data.sample === "epub" ? "sample-epub" : "none";
    const fileName =
      source === "sample-pdf" ? "Sample folio.pdf" : source === "sample-epub" ? "Sample folio.epub" : null;
    const kind: DocKind = source === "sample-epub" ? "epub" : "pdf";
    const pageCount = 0;
    await sql.query(
      "insert into folio_rooms (code, host_secret, file_name, kind, source, page_count, host_page, file_size) values ($1,$2,$3,$4,$5,$6,1,0)",
      [code, hostSecret, fileName, kind, source, pageCount],
    );
    return { code, hostSecret, source, kind, fileName };
  });

export const joinRoom = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      name: z.string().trim().min(1).max(40),
      clientId: z.string().min(8).max(80),
      hostSecret: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const room = await loadRoom(code);
    if (!room) return { ok: false as const, error: "No room answers that code." };
    const sql = await folioSql();
    const isHost = Boolean(data.hostSecret && data.hostSecret === room.host_secret);
    await sql.query(
      `insert into folio_readers (code, client_id, name, is_host, page, updated_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (code, client_id) do update set name = excluded.name, is_host = excluded.is_host, updated_at = now()`,
      [code, data.clientId, data.name, isHost, room.host_page],
    );
    const snap = await snapshot(code);
    if (!snap) return { ok: false as const, error: "No room answers that code." };
    return { ok: true as const, isHost, snapshot: snap, notes: await notesFor(code, room.host_page) };
  });

export const getSnapshot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      clientId: z.string().min(8).max(80).optional(),
      page: z.number().int().min(1).max(9999).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const sql = await folioSql();
    if (data.clientId) {
      await sql.query("update folio_readers set updated_at = now() where code = $1 and client_id = $2", [
        code,
        data.clientId,
      ]);
    }
    const snap = await snapshot(code);
    if (!snap) return { ok: false as const, error: "No room answers that code." };
    const notes = data.page ? await notesFor(code, data.page) : [];
    return { ok: true as const, snapshot: snap, notes };
  });

export const setPage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      clientId: z.string().min(8).max(80),
      page: z.number().int().min(1).max(9999),
      present: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const sql = await folioSql();
    const room = await loadRoom(code);
    if (!room) return { ok: false as const, error: "Room not found" };
    const readers = await sql.query<{ is_host: boolean }>(
      "select is_host from folio_readers where code = $1 and client_id = $2",
      [code, data.clientId],
    );
    const isHost = Boolean(readers[0]?.is_host);
    await sql.query("update folio_readers set page = $3, updated_at = now() where code = $1 and client_id = $2", [
      code,
      data.clientId,
      data.page,
    ]);
    if (isHost && data.present) {
      await sql.query("update folio_rooms set host_page = $2 where code = $1", [code, data.page]);
    }
    return { ok: true as const, notes: await notesFor(code, data.page), snapshot: await snapshot(code) };
  });

export const setPageCount = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      pageCount: z.number().int().min(0).max(9999),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const sql = await folioSql();
    await sql.query("update folio_rooms set page_count = $2 where code = $1", [code, data.pageCount]);
    return { ok: true as const, snapshot: await snapshot(code) };
  });

export const addNote = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      clientId: z.string().min(8).max(80),
      page: z.number().int().min(1).max(9999),
      body: z.string().trim().min(1).max(500),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const sql = await folioSql();
    const readers = await sql.query<{ name: string }>(
      "select name from folio_readers where code = $1 and client_id = $2",
      [code, data.clientId],
    );
    const author = readers[0]?.name || "Reader";
    const id = secret().slice(0, 16);
    await sql.query(
      "insert into folio_notes (id, code, page, author, author_id, body) values ($1,$2,$3,$4,$5,$6)",
      [id, code, data.page, author, data.clientId, data.body],
    );
    return { ok: true as const, notes: await notesFor(code, data.page), snapshot: await snapshot(code) };
  });

export const getNotes = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      page: z.number().int().min(1).max(9999),
    }),
  )
  .handler(async ({ data }) => {
    return { ok: true as const, notes: await notesFor(data.code.toUpperCase(), data.page) };
  });

export const placeSample = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      hostSecret: z.string(),
      sample: z.enum(["pdf", "epub"]),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const room = await loadRoom(code);
    if (!room) return { ok: false as const, error: "Room not found" };
    if (room.host_secret !== data.hostSecret) return { ok: false as const, error: "Only the host can place a book" };
    const sql = await folioSql();
    const source: DocSource = data.sample === "epub" ? "sample-epub" : "sample-pdf";
    const fileName = data.sample === "epub" ? "Sample folio.epub" : "Sample folio.pdf";
    const kind: DocKind = data.sample === "epub" ? "epub" : "pdf";
    const pageCount = 0;
    await sql.query(
      "update folio_rooms set file_name = $2, kind = $3, source = $4, page_count = $5, host_page = 1, file_size = 0, doc_rev = coalesce(doc_rev, 0) + 1, uploading_at = null where code = $1",
      [code, fileName, kind, source, pageCount],
    );
    await sql.query("delete from folio_docs where code = $1", [code]);
    await sql.query("delete from folio_doc_chunks where code = $1", [code]);
    await sql.query("delete from folio_notes where code = $1", [code]);
    await sql.query("update folio_readers set page = 1 where code = $1", [code]);
    const snap = await snapshot(code);
    if (!snap) return { ok: false as const, error: "Room not found" };
    return { ok: true as const, snapshot: snap };
  });

export const uploadBegin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      hostSecret: z.string(),
      fileName: z.string().min(1).max(240),
      kind: z.enum(["pdf", "epub"]),
      size: z.number().int().min(1).max(MAX_DOC_BYTES),
      chunks: z.number().int().min(1).max(MAX_CHUNKS),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const room = await loadRoom(code);
    if (!room) return { ok: false as const, error: "Room not found" };
    if (room.host_secret !== data.hostSecret) return { ok: false as const, error: "Only the host can replace the file" };
    if (data.size > MAX_DOC_BYTES) return { ok: false as const, error: "That file is larger than 10 MB." };
    const sql = await folioSql();
    await sql.query("delete from folio_doc_chunks where code = $1", [code]);
    await sql.query("update folio_rooms set uploading_at = now() where code = $1", [code]);
    return { ok: true as const, chunks: data.chunks };
  });

export const uploadChunk = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      hostSecret: z.string(),
      index: z.number().int().min(0).max(MAX_CHUNKS - 1),
      base64: z.string().min(4).max(400_000),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const room = await loadRoom(code);
    if (!room) return { ok: false as const, error: "Room not found" };
    if (room.host_secret !== data.hostSecret) return { ok: false as const, error: "Only the host can replace the file" };
    const buf = Buffer.from(data.base64, "base64");
    if (buf.byteLength === 0 || buf.byteLength > CHUNK_BYTES + 64) {
      return { ok: false as const, error: "Chunk too large." };
    }
    const sql = await folioSql();
    await sql.query(
      "insert into folio_doc_chunks (code, idx, bytes) values ($1,$2,$3) on conflict (code, idx) do update set bytes = excluded.bytes",
      [code, data.index, buf],
    );
    return { ok: true as const };
  });

export const uploadFinish = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      hostSecret: z.string(),
      fileName: z.string().min(1).max(240),
      kind: z.enum(["pdf", "epub"]),
      size: z.number().int().min(1).max(MAX_DOC_BYTES),
      chunks: z.number().int().min(1).max(MAX_CHUNKS),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const room = await loadRoom(code);
    if (!room) return { ok: false as const, error: "Room not found" };
    if (room.host_secret !== data.hostSecret) return { ok: false as const, error: "Only the host can replace the file" };
    const sql = await folioSql();
    const parts = await sql.query<{ idx: number; bytes: unknown }>(
      "select idx, bytes from folio_doc_chunks where code = $1 order by idx asc",
      [code],
    );
    if (parts.length === 0) {
      await sql.query("update folio_rooms set uploading_at = null where code = $1", [code]);
      return { ok: false as const, error: "The upload did not arrive." };
    }
    if (parts.length !== data.chunks) {
      await sql.query("delete from folio_doc_chunks where code = $1", [code]);
      await sql.query("update folio_rooms set uploading_at = null where code = $1", [code]);
      return { ok: false as const, error: "The upload was incomplete. Try again." };
    }
    for (let i = 0; i < data.chunks; i++) {
      if (parts[i]?.idx !== i) {
        await sql.query("delete from folio_doc_chunks where code = $1", [code]);
        await sql.query("update folio_rooms set uploading_at = null where code = $1", [code]);
        return { ok: false as const, error: "The upload was incomplete. Try again." };
      }
    }
    const buf = Buffer.concat(parts.map((p) => asBuffer(p.bytes)));
    if (buf.byteLength !== data.size || buf.byteLength > MAX_DOC_BYTES) {
      await sql.query("delete from folio_doc_chunks where code = $1", [code]);
      await sql.query("update folio_rooms set uploading_at = null where code = $1", [code]);
      return { ok: false as const, error: "The file did not match what was sent. Try again." };
    }
    await sql.query(
      "insert into folio_docs (code, bytes) values ($1, $2) on conflict (code) do update set bytes = excluded.bytes",
      [code, buf],
    );
    await sql.query("delete from folio_doc_chunks where code = $1", [code]);
    await sql.query(
      "update folio_rooms set file_name = $2, kind = $3, source = 'upload', host_page = 1, file_size = $4, doc_rev = coalesce(doc_rev, 0) + 1, uploading_at = null where code = $1",
      [code, safeFileName(data.fileName, data.kind), data.kind, buf.byteLength],
    );
    await sql.query("delete from folio_notes where code = $1", [code]);
    await sql.query("update folio_readers set page = 1 where code = $1", [code]);
    const snap = await snapshot(code);
    if (!snap) return { ok: false as const, error: "Room not found" };
    return { ok: true as const, snapshot: snap };
  });

export const uploadAbort = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      hostSecret: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const room = await loadRoom(code);
    if (!room) return { ok: false as const, error: "Room not found" };
    if (room.host_secret !== data.hostSecret) return { ok: false as const, error: "Only the host can replace the file" };
    const sql = await folioSql();
    await sql.query("delete from folio_doc_chunks where code = $1", [code]);
    await sql.query("update folio_rooms set uploading_at = null where code = $1", [code]);
    const snap = await snapshot(code);
    if (!snap) return { ok: false as const, error: "Room not found" };
    return { ok: true as const, snapshot: snap };
  });

export const leaveRoom = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(4).max(12),
      clientId: z.string().min(8).max(80),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await folioSql();
    await sql.query("delete from folio_readers where code = $1 and client_id = $2", [
      data.code.toUpperCase(),
      data.clientId,
    ]);
    return { ok: true as const };
  });

export { MAX_DOC_BYTES, CHUNK_BYTES };
