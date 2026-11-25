alter table public.exam_versions
  add column qr_token uuid not null default gen_random_uuid();

create unique index exam_versions_qr_token_uidx
  on public.exam_versions (qr_token);
