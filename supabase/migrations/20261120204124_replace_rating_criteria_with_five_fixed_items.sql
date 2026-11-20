insert into public.conductor_rating_criteria (title, sort_order)
values
  ('Качество обслуживания пассажиров', 10),
  ('Знание инструкций и техники безопасности', 20),
  ('Отношение к работе', 30),
  ('Дисциплина и внешний вид', 40),
  ('Работа с поездной документацией', 50)
on conflict (title) do update set sort_order = excluded.sort_order;

with mapped as (
  select
    m.conductor_id,
    case
      when c.title in ('Вежливость', 'Работа с пассажирами')
        then 'Качество обслуживания пассажиров'
      when c.title = 'Знание правил'
        then 'Знание инструкций и техники безопасности'
      when c.title = 'Ответственность'
        then 'Отношение к работе'
      when c.title = 'Дисциплина'
        then 'Дисциплина и внешний вид'
    end as new_title,
    round(avg(m.score))::smallint as score
  from public.conductor_metric_ratings m
  join public.conductor_rating_criteria c on c.id = m.criterion_id
  where c.title in (
    'Вежливость',
    'Работа с пассажирами',
    'Знание правил',
    'Ответственность',
    'Дисциплина'
  )
  group by m.conductor_id,
    case
      when c.title in ('Вежливость', 'Работа с пассажирами')
        then 'Качество обслуживания пассажиров'
      when c.title = 'Знание правил'
        then 'Знание инструкций и техники безопасности'
      when c.title = 'Ответственность'
        then 'Отношение к работе'
      when c.title = 'Дисциплина'
        then 'Дисциплина и внешний вид'
    end
)
insert into public.conductor_metric_ratings (conductor_id, criterion_id, score)
select mapped.conductor_id, c.id, mapped.score
from mapped
join public.conductor_rating_criteria c on c.title = mapped.new_title
on conflict (conductor_id, criterion_id) do nothing;

delete from public.conductor_metric_ratings m
using public.conductor_rating_criteria c
where c.id = m.criterion_id
  and c.title not in (
    'Качество обслуживания пассажиров',
    'Знание инструкций и техники безопасности',
    'Отношение к работе',
    'Дисциплина и внешний вид',
    'Работа с поездной документацией'
  );

delete from public.conductor_rating_criteria
where title not in (
  'Качество обслуживания пассажиров',
  'Знание инструкций и техники безопасности',
  'Отношение к работе',
  'Дисциплина и внешний вид',
  'Работа с поездной документацией'
);
