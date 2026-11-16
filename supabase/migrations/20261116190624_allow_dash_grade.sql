alter table public.marks
  drop constraint if exists marks_value_check;

alter table public.marks
  add constraint marks_value_check
  check (
    ((points_value is not null) and (points_grade is not null))
    or value in ('Н', '✝', 'Зач', 'Незач', '—')
    or value ~ '^([1-9]|10)(/([1-9]|10))?$'
  );
