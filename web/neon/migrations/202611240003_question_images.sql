create table public.question_images (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  blob_pathname text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size integer not null check (file_size > 0 and file_size <= 1048576),
  alt_text text not null default '',
  sort_order smallint not null default 0 check (sort_order between 0 and 2),
  created_at timestamptz not null default now(),
  unique (question_id, sort_order)
);

create index question_images_question_order_idx
  on public.question_images (question_id, sort_order);
