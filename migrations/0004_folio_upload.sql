alter table folio_rooms add column if not exists uploading_at timestamptz;
alter table folio_rooms add column if not exists doc_rev integer not null default 0;
