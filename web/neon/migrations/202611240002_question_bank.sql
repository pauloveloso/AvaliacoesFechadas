-- O primeiro esquema de questões usava categoria + posição da prova.
-- Essas tabelas ainda estão vazias; preservamos os nomes e referências como legado.
alter table public.question_options rename to legacy_question_options;
alter table public.questions rename to legacy_questions;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  question_type_id uuid not null references public.question_types (id) on delete restrict,
  statement jsonb not null check (jsonb_typeof(statement) = 'array'),
  explanation text,
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_type_active_created_idx
  on public.questions (question_type_id, is_active, created_at desc);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  option_number smallint not null check (option_number between 1 and 8),
  content jsonb not null check (jsonb_typeof(content) = 'array'),
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, option_number)
);

create index question_options_question_number_idx
  on public.question_options (question_id, option_number);

create trigger bank_questions_set_updated_at
before update on public.questions
for each row execute function public.set_updated_at();
