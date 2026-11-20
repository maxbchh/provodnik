begin;

-- Ratings for "Отношение к работе" are not valid ratings of
-- sanitary condition, so clear only this criterion's old scores.
delete from public.conductor_metric_ratings
where criterion_id = (
  select id
  from public.conductor_rating_criteria
  where title = 'Отношение к работе'
);

update public.conductor_rating_criteria
set title = 'Санитарное состояние вагона'
where title = 'Отношение к работе';

commit;
