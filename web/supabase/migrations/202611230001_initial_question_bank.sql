-- Base do banco: categorias, posições da prova e banco de questões.
-- Questões e alternativas ficam no banco; os pacotes congelarão os dados
-- usados em cada versão em uma migração posterior.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.question_slots (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null,
  owner_id uuid not null default auth.uid(),
  slot_number smallint not null check (slot_number between 1 and 10),
  question_format text not null default 'multiple_choice'
    check (question_format = 'multiple_choice'),
  alternatives_count smallint not null default 5
    check (alternatives_count between 2 and 8),
  created_at timestamptz not null default now(),
  unique (category_id, slot_number),
  unique (category_id, slot_number, owner_id),
  foreign key (category_id, owner_id)
    references public.categories (id, owner_id) on delete cascade
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null,
  owner_id uuid not null default auth.uid(),
  slot_number smallint not null check (slot_number between 1 and 10),
  statement jsonb not null default '[]'::jsonb,
  explanation text,
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (category_id, owner_id)
    references public.categories (id, owner_id) on delete cascade,
  foreign key (category_id, slot_number, owner_id)
    references public.question_slots (category_id, slot_number, owner_id) on delete cascade
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  owner_id uuid not null default auth.uid(),
  option_number smallint not null check (option_number between 1 and 8),
  content jsonb not null default '[]'::jsonb,
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, option_number),
  foreign key (question_id, owner_id)
    references public.questions (id, owner_id) on delete cascade
);

create index questions_category_slot_idx
  on public.questions (category_id, slot_number, is_active);
create index question_options_question_idx
  on public.question_options (question_id, option_number);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger questions_set_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.question_slots enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;

grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.question_slots to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, insert, update, delete on public.question_options to authenticated;

create policy "Owners manage their categories"
on public.categories for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Owners manage their question slots"
on public.question_slots for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Owners manage their questions"
on public.questions for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Owners manage their question options"
on public.question_options for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
