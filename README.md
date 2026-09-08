# Folio Room

One book, many minds, one shared table.

Open a room, set a PDF or EPUB on the table, and give the six-letter code to
anyone who should be reading with you. Everyone sees the same pages. Notes sit
on the page they belong to. You can see how far the others have read, without
anyone having to shout across the table.

No accounts. A room is just a door and whoever walked through it.
##DEMO video available "\.mp4"

## Running it

Node 22.

```bash
npm install
npm run dev
```

That serves the app at [http://localhost:8080](http://localhost:8080). Locally
it uses an embedded Postgres (PGLite), so you do not need a database to try it.

To point it at real Postgres — Neon, RDS, anything with a connection string —
set `DATABASE_URL` (see `.env.example`). Migrations run on `npm run build`.

```bash
npm run build
npm run typecheck
```

## What it does

- **Host** opens a room and places a PDF or EPUB (10 MB max). The file is
  buffered on the host, sent in chunks, then published. Guests only see the
  book once it has landed.
- **Guests** join with the code. Late arrivals get the book that is already
  on the table — no refresh required.
- **Progress** for you and everyone else at the table.
- **Notes** pinned to a page. A red dot on the plus means the current page
  has a margin note; the sheet never jumps open on its own.
- Sample PDF if you want to sit down before you have a file of your own.

## Layout

```
src/routes/          landing + /r/:code
src/components/      lobby, room, reader, notes
src/lib/             rooms API, pdf/epub, database
migrations/          Postgres schema
public/pdfjs/        pdf.js worker, cmaps, fonts
```

The interesting files are `src/lib/folio-api.ts` (rooms, chunked upload,
snapshot polling) and `src/components/room-session.tsx` (host buffer → publish
→ live sync).

## Deploy

It is a TanStack Start app. `vite build` emits a Vercel-ready Nitro output.
Give the host `DATABASE_URL` and you are done. Without it, the process falls
back to PGLite, which is fine for a demo and the wrong idea for more than one
server.

## License

MIT.
