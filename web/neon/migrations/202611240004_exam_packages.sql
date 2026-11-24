create table public.exam_packages (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.academic_terms (id) on delete restrict,
  discipline_id uuid not null references public.disciplines (id) on delete restrict,
  content_id uuid not null references public.contents (id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 120),
  version_count smallint not null check (version_count between 1 and 30),
  question_count smallint not null check (question_count between 1 and 10),
  total_points numeric(7,2) not null check (total_points > 0),
  created_at timestamptz not null default now()
);

create index exam_packages_created_idx on public.exam_packages (created_at desc);

create table public.exam_package_slots (
  package_id uuid not null references public.exam_packages (id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  question_type_id uuid not null references public.question_types (id) on delete restrict,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  points numeric(7,2) not null check (points > 0),
  primary key (package_id, position)
);

create table public.exam_versions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.exam_packages (id) on delete cascade,
  version_number smallint not null check (version_number between 1 and 30),
  version_label text not null check (char_length(version_label) between 1 and 20),
  created_at timestamptz not null default now(),
  unique (package_id, version_number),
  unique (package_id, version_label)
);

create table public.exam_version_questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.exam_versions (id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  question_id uuid not null references public.questions (id) on delete restrict,
  question_type_name text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  points numeric(7,2) not null check (points > 0),
  statement_snapshot jsonb not null check (jsonb_typeof(statement_snapshot) = 'array'),
  alternatives_snapshot jsonb not null check (jsonb_typeof(alternatives_snapshot) = 'array'),
  explanation_snapshot text,
  images_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(images_snapshot) = 'array'),
  unique (version_id, position)
);

create index exam_versions_package_idx on public.exam_versions (package_id, version_number);
create index exam_version_questions_version_idx on public.exam_version_questions (version_id, position);
