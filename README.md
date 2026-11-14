# Журнал ДЖД

Электронный учебный журнал для проводников детской железной дороги. Адаптивный интерфейс на React + Vite, Supabase Auth/Database/Realtime.

## Разделы
- регистрация и личный кабинет;
- роли: начальник поезда, учитель, проводник;
- список проводников и назначение второго ЛНП учителем;
- оценки (1–10 и отдельная отметка «Н»);
- отдельная посещаемость (был / Н / опоздал);
- график занятий и домашние задания;
- примечания преподавателей.

## Supabase
1. Создай проект Supabase.
2. В SQL Editor выполни `supabase/schema.sql`.
3. Возьми Project URL и Publishable/anon key.
4. Для локального запуска создай `.env` по `.env.example` и заполни `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.
5. Не используй `service_role` или secret key в браузере.

После первой регистрации назначь себе роль владельца запросом в SQL Editor, заменив email:

```sql
update public.profiles p
set role = 'owner'
from auth.users u
where u.id = p.id and u.email = 'ТВОЙ_EMAIL';
```

Второй ЛНП регистрируется как обычный пользователь; владелец назначает ему роль учителя в разделе «Проводники».

## Локальный запуск
Требуется Node.js LTS:
```powershell
npm install
npm run dev
```

## GitHub Pages
В Settings → Pages выбери **GitHub Actions** как источник публикации. В Settings → Secrets and variables → Actions → Variables добавь `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.

После push в `main` workflow соберёт и опубликует сайт. Запуск также доступен вручную во вкладке Actions.

## Важно
Это стартовая версия, ещё не проверенная на production и не подключённая к твоей базе. Перед реальным использованием протестируй регистрацию, роли и RLS на тестовых аккаунтах. Не публикуй персональные данные участников без необходимости.
