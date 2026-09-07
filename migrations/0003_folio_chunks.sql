alter table folio_rooms add column if not exists file_size integer not null default 0;

alter table folio_notes add column if not exists author_id text not null default '';

create table if not exists folio_doc_chunks (
  code text not null references folio_rooms (code) on delete cascade,
  idx integer not null,
  bytes bytea not null,
  primary key (code, idx)
);
