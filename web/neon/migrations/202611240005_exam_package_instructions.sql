alter table public.exam_packages
  add column instructions text not null default ''
  check (char_length(instructions) <= 500);
