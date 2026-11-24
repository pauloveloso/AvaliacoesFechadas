-- Hierarquia usada no cadastro do professor:
-- período letivo -> disciplinas ofertadas -> conteúdos -> tipos de questão.
-- A migração é aditiva e preserva as tabelas antigas de categorias e questões.

create table public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 30),
  created_at timestamptz not null default now()
);

create unique index academic_terms_name_ci_uidx
  on public.academic_terms (lower(trim(name)));

create table public.disciplines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index disciplines_name_ci_uidx
  on public.disciplines (lower(trim(name)));

create table public.term_disciplines (
  term_id uuid not null references public.academic_terms (id) on delete cascade,
  discipline_id uuid not null references public.disciplines (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (term_id, discipline_id)
);

create index term_disciplines_discipline_idx
  on public.term_disciplines (discipline_id, term_id);

create table public.contents (
  id uuid primary key default gen_random_uuid(),
  discipline_id uuid not null references public.disciplines (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index contents_discipline_name_ci_uidx
  on public.contents (discipline_id, lower(trim(name)));

create index contents_discipline_idx on public.contents (discipline_id);

create table public.question_types (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '',
  question_format text not null default 'multiple_choice'
    check (question_format = 'multiple_choice'),
  alternatives_count smallint not null default 5
    check (alternatives_count between 2 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index question_types_content_name_ci_uidx
  on public.question_types (content_id, lower(trim(name)));

create index question_types_content_idx on public.question_types (content_id);

create trigger disciplines_set_updated_at
before update on public.disciplines
for each row execute function public.set_updated_at();

create trigger contents_set_updated_at
before update on public.contents
for each row execute function public.set_updated_at();

create trigger question_types_set_updated_at
before update on public.question_types
for each row execute function public.set_updated_at();
