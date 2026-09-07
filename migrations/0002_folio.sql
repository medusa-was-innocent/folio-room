create table if not exists folio_rooms (
  code text primary key,
  host_secret text not null,
  file_name text,
  kind text not null default 'pdf',
  source text not null default 'none',
  page_count integer not null default 0,
  host_page integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists folio_docs (
  code text primary key references folio_rooms (code) on delete cascade,
  bytes bytea not null
);

create table if not exists folio_readers (
  code text not null references folio_rooms (code) on delete cascade,
  client_id text not null,
  name text not null,
  is_host boolean not null default false,
  page integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (code, client_id)
);

create table if not exists folio_notes (
  id text primary key,
  code text not null references folio_rooms (code) on delete cascade,
  page integer not null,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists folio_notes_code_page_idx on folio_notes (code, page);
create index if not exists folio_readers_updated_idx on folio_readers (code, updated_at);
