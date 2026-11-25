alter table public.exam_packages
  add column campus_name text not null default 'Campus Januária'
  check (char_length(campus_name) between 1 and 180);
