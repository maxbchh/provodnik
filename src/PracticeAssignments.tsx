import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from './supabase';

type Conductor = { id: string; name: string };
type Lnp = { id: string; display_name: string };
type PracticeDay = { id: string; practice_date: string };
type PracticeAssignment = {
  id: string;
  practice_day_id: string;
  wagon_no: number;
  slot: number;
  conductor_id: string;
};

const localDate = () => {
  const date = new Date();
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
};
const formatDate = (value: string) => new Date(value + 'T12:00:00').toLocaleDateString('ru-RU', {
  day: 'numeric', month: 'long', year: 'numeric',
});

function canShowSeventhWagonControl(show: boolean, setShow: (value: boolean) => void) {
  return (
    <div className="practice-wagon-tools">
      {show ? (
        <span className="practice-wagon-note">7-й вагон добавлен в журнал</span>
      ) : (
        <button type="button" className="secondary practice-show-seventh" onClick={() => setShow(true)}>
          <Plus size={14} /> Добавить 7-й вагон
        </button>
      )}
    </div>
  );
}

export default function PracticeAssignments({
  conductors,
  lnps,
  currentUserId,
  ratings,
}: {
  conductors: Conductor[];
  lnps: Lnp[];
  currentUserId: string;
  ratings: Array<{ conductorId: string; score: number | null }>;
}) {
  const [days, setDays] = useState<PracticeDay[]>([]);
  const [assignments, setAssignments] = useState<PracticeAssignment[]>([]);
  const [newDate, setNewDate] = useState(localDate());
  const [expandedSlots, setExpandedSlots] = useState<Record<string, boolean>>({});
  const [showSeventhWagon, setShowSeventhWagon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    const [dayResult, assignmentResult] = await Promise.all([
      supabase.from('practice_days').select('id,practice_date').order('practice_date', { ascending: true }),
      supabase.from('practice_assignments').select('id,practice_day_id,wagon_no,slot,conductor_id'),
    ]);
    if (dayResult.error || assignmentResult.error) {
      setError('Не удалось загрузить назначения: ' + (dayResult.error || assignmentResult.error)?.message);
      setLoading(false);
      return;
    }
    const loadedAssignments = (assignmentResult.data || []) as PracticeAssignment[];
    setDays((dayResult.data || []) as PracticeDay[]);
    setAssignments(loadedAssignments);
    setShowSeventhWagon(previous => previous || loadedAssignments.some(item => item.wagon_no === 7));
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const addPracticeDate = async (event: FormEvent) => {
    event.preventDefault();
    if (!newDate || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    const { error: saveError } = await supabase.from('practice_days').upsert(
      { practice_date: newDate, created_by: currentUserId },
      { onConflict: 'practice_date' },
    );
    if (saveError) setError('Не удалось добавить дату: ' + saveError.message);
    else {
      setNotice('Дата практики добавлена');
      await reload();
    }
    setSaving(false);
  };

  const deletePracticeDate = async (day: PracticeDay) => {
    if (!window.confirm('Удалить практику ' + formatDate(day.practice_date) + ' и все назначения на эту дату?')) return;
    setError('');
    setNotice('');
    const { error: deleteError } = await supabase.from('practice_days').delete().eq('id', day.id);
    if (deleteError) {
      setError('Не удалось удалить дату: ' + deleteError.message);
      return;
    }
    setDays(previous => previous.filter(item => item.id !== day.id));
    setAssignments(previous => previous.filter(item => item.practice_day_id !== day.id));
    setNotice('Дата и назначения удалены');
  };

  const saveAssignment = async (dayId: string, wagonNo: number, slot: number, conductorId: string) => {
    if (saving) return;
    const old = assignments.find(item =>
      item.practice_day_id === dayId && item.wagon_no === wagonNo && item.slot === slot
    );
    setError('');
    setNotice('');

    if (conductorId) {
      const selected = conductors.find(person => person.id === conductorId);
      const surname = selected?.name.toLocaleLowerCase('ru-RU') || '';
      const isNali = surname.includes('наливайко');
      const isSpecialDate = days.find(item => item.id === dayId)?.practice_date === '2026-12-25';
      if (isNali && wagonNo !== 4 && !(isSpecialDate && wagonNo === 3)) {
        setError('Наливайко назначается только в 4-й вагон. Исключение — 25 декабря: 3-й вагон вместе с Бурундуковым.');
        return;
      }
      if (isNali && wagonNo === 4 && slot !== 1) {
        setError('Наливайко в 4-м вагоне должен быть один.');
        return;
      }
    }
    if (!conductorId) {
      if (!old) return;
      const { error: deleteError } = await supabase.from('practice_assignments').delete().eq('id', old.id);
      if (deleteError) {
        setError('Не удалось снять назначение: ' + deleteError.message);
        return;
      }
      setAssignments(previous => previous.filter(item => item.id !== old.id));
      setNotice('Назначение снято');
      return;
    }

    const duplicate = assignments.find(item =>
      item.practice_day_id === dayId && item.conductor_id === conductorId && item.id !== old?.id
    );
    if (duplicate) {
      setError('Этот проводник уже назначен на эту дату — выбери другого или сними прежнее назначение.');
      return;
    }

    setSaving(true);
    const { data, error: saveError } = await supabase.from('practice_assignments').upsert(
      {
        practice_day_id: dayId,
        wagon_no: wagonNo,
        slot,
        conductor_id: conductorId,
        created_by: currentUserId,
      },
      { onConflict: 'practice_day_id,wagon_no,slot' },
    ).select('id,practice_day_id,wagon_no,slot,conductor_id').single();

    if (saveError) {
      setError('Не удалось сохранить назначение: ' + saveError.message);
    } else if (data) {
      setAssignments(previous => [
        ...previous.filter(item => !(item.practice_day_id === dayId && item.wagon_no === wagonNo && item.slot === slot)),
        data as PracticeAssignment,
      ]);
      if (wagonNo === 7) setShowSeventhWagon(true);
      setNotice('Назначение сохранено');
    }
    setSaving(false);
  };

  const renderSelect = (day: PracticeDay, wagonNo: number, slot: number) => {
    const assignment = assignments.find(item =>
      item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === slot
    );
    return (
      <select
        className="practice-select"
        value={assignment?.conductor_id || ''}
        disabled={saving}
        aria-label={'Проводник, вагон ' + wagonNo + ', место ' + slot + ', ' + formatDate(day.practice_date)}
        onChange={event => void saveAssignment(day.id, wagonNo, slot, event.target.value)}
      >
        <option value="">Не назначен</option>
        {conductors.map(conductor => {
          const nali = conductor.name.toLocaleLowerCase('ru-RU').includes('наливайко');
          const specialDate = day.practice_date === '2026-12-25';
          const forbiddenNali = nali && wagonNo !== 4 && !(specialDate && wagonNo === 3);
          const usedElsewhere = assignments.some(item =>
            item.practice_day_id === day.id &&
            item.conductor_id === conductor.id &&
            !(item.wagon_no === wagonNo && item.slot === slot)
          );
          return (
            <option key={conductor.id} value={conductor.id} disabled={usedElsewhere || forbiddenNali || (nali && wagonNo === 4 && slot === 2)}>
              {conductor.name}{forbiddenNali ? ' · не рекомендуется в этот вагон' : usedElsewhere ? ' · уже назначен' : nali && wagonNo === 4 ? ' · только один в 4-м' : ''}
            </option>
          );
        })}
      </select>
    );
  };

  return (
    <section className="panel practice-panel">
      <div className="section-heading">
        <div>
          <h3>Журнал назначений на практику</h3>
          <p className="muted">Даты идут по горизонтали, вагоны — сверху вниз. В каждом вагоне можно назначить одного или двух проводников.</p>
        </div>
        <span className="pill">{days.length} дат</span>
      </div>

      <section className="practice-recommendations">
        <h4>Рекомендации по рейтингу</h4>
        <p className="muted">Подбор учитывает средний балл, хвостовой 6-й вагон и специальные ограничения. Это подсказки — назначения сохраняются вручную.</p>
        {days.filter(day => day.practice_date >= localDate()).slice(0, 4).map(day => {
          const ranked = conductors.map(person => ({ person, score: ratings.find(item => item.conductorId === person.id)?.score ?? -1 }))
            .sort((a,b) => b.score-a.score || a.person.name.localeCompare(b.person.name,'ru'));
          const nali = ranked.find(item => item.person.name.toLocaleLowerCase('ru-RU').includes('наливайко'));
          const burundukov = ranked.find(item => item.person.name.toLocaleLowerCase('ru-RU').includes('бурундуков'));
          const vanzonok = ranked.find(item => item.person.name.toLocaleLowerCase('ru-RU').includes('ванзонок'));
          const special = day.practice_date === '2026-12-25';
          const used = new Set<string>();
          const take = (count: number, excludeNali = true) => ranked.filter(item => !used.has(item.person.id) && (!excludeNali || !item.person.name.toLocaleLowerCase('ru-RU').includes('наливайко'))).slice(0,count);
          const pick = (wagon: number) => {
            if (wagon === 3 && special && nali && burundukov) { used.add(nali.person.id); used.add(burundukov.person.id); return [nali,burundukov]; }
            if (wagon === 4 && nali && !used.has(nali.person.id)) { used.add(nali.person.id); return [nali]; }
            if (wagon === 1 && vanzonok && (special || vanzonok.score > 80) && !used.has(vanzonok.person.id)) { used.add(vanzonok.person.id); const mate=ranked.filter(item => !used.has(item.person.id) && !item.person.name.toLocaleLowerCase('ru-RU').includes('наливайко') && item.score > 50).slice(0,1); mate.forEach(x=>used.add(x.person.id)); return [vanzonok,...mate]; }
            const picks=take(2); picks.forEach(x=>used.add(x.person.id)); return picks;
          };
          return <div className="practice-recommendation-date" key={day.id}>
            <b>{formatDate(day.practice_date)}</b>
            <div className="practice-recommendation-grid">
              {[1,2,3,4,5,6].map(wagon => {
                const picks=pick(wagon);
                return <div className="practice-recommendation-item" key={wagon}>
                  <strong>{wagon}-й вагон{wagon===6?' · хвост':''}</strong>
                  <span>{picks.length ? picks.map(item => item.person.name + (item.score >= 0 ? ' ('+Math.round(item.score)+'/100)' : '')).join(' + ') : 'Нет данных'}</span>
                </div>;
              })}
            </div>
          </div>;
        })}
      </section>
      <form className="practice-date-form" onSubmit={addPracticeDate}>
        <label>
          Дата практики
          <input type="date" value={newDate} onChange={event => setNewDate(event.target.value)} required />
        </label>
        <button className="primary" type="submit" disabled={saving || !newDate}>
          <Plus size={15} /> Добавить дату
        </button>
      </form>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      {canShowSeventhWagonControl(showSeventhWagon, setShowSeventhWagon)}
      {loading ? <div className="empty">Загружаем журнал назначений…</div> : days.length === 0 ? (
        <div className="empty">Пока нет дат практики. Добавь первую дату — она появится отдельной колонкой.</div>
      ) : (
        <div className="practice-table-wrap">
          <table className="practice-table">
            <thead>
              <tr>
                <th>Вагон</th>
                {days.map(day => (
                  <th key={day.id}>
                    <div className="practice-date-heading">
                      <span>{formatDate(day.practice_date)}</span>
                      <button type="button" className="practice-delete-date" title="Удалить дату" onClick={() => void deletePracticeDate(day)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5, 6, ...(showSeventhWagon ? [7] : [])].map(wagonNo => (
                <tr key={wagonNo}>
                  <th>
                    <span className="practice-wagon-number">{wagonNo}</span>
                    <small>{wagonNo === 0 ? 'ЛНП' : 'вагон'}</small>
                  </th>
                  {days.map(day => (
                    <td key={day.id}>
                      {wagonNo === 0 ? (
                        <div className="practice-lnps">
                          {lnps.slice(0, 2).map(lnp => (
                            <div className="practice-lnp-name" key={lnp.id}>
                              <Users size={13} /> {lnp.display_name}
                            </div>
                          ))}
                          {lnps.length < 2 && <small>Ожидается второй ЛНП</small>}
                        </div>
                      ) : (
                        <div className="practice-cell">
                          {renderSelect(day, wagonNo, 1)}
                          {assignments.some(item => item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === 2) ? (
                            renderSelect(day, wagonNo, 2)
                          ) : expandedSlots[day.id + '-' + wagonNo] ? (
                            renderSelect(day, wagonNo, 2)
                          ) : (
                            <button
                              type="button"
                              className="practice-add-second"
                              disabled={saving || !assignments.some(item => item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === 1)}
                              onClick={() => setExpandedSlots(previous => ({ ...previous, [day.id + '-' + wagonNo]: true }))}
                            >
                              <Plus size={12} /> Второго
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="practice-legend"><b>Вагон 0</b> автоматически показывает оба аккаунта ЛНП. По умолчанию открыты вагоны 1–6. Седьмой добавляется отдельной кнопкой; в каждом вагоне можно назначить одного или двух проводников.</p>
    </section>
  );
}

export function MyPracticeCard({ conductorId }: { conductorId: string }) {
  const [upcomingPractices, setUpcomingPractices] = useState<Array<{ date: string; wagons: number[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      const { data: assignmentRows, error: assignmentError } = await supabase
        .from('practice_assignments')
        .select('practice_day_id,wagon_no')
        .eq('conductor_id', conductorId);
      if (assignmentError) {
        if (active) { setUpcomingPractices([]); setError('Не удалось загрузить назначения.'); setLoading(false); }
        return;
      }
      const rows = (assignmentRows || []) as Array<{ practice_day_id: string; wagon_no: number }>;
      const ids = Array.from(new Set(rows.map(row => row.practice_day_id)));
      if (!ids.length) {
        if (active) { setUpcomingPractices([]); setLoading(false); }
        return;
      }
      const { data, error: daysError } = await supabase
        .from('practice_days')
        .select('id,practice_date')
        .in('id', ids)
        .gte('practice_date', localDate())
        .order('practice_date', { ascending: true })
        .limit(20);
      if (active) {
        if (daysError) {
          setUpcomingPractices([]);
          setError('Не удалось загрузить даты практики.');
        } else {
          const days = (data || []) as Array<{ id: string; practice_date: string }>;
          setUpcomingPractices(days.map(day => ({
            date: day.practice_date,
            wagons: Array.from(new Set(rows.filter(row => row.practice_day_id === day.id).map(row => row.wagon_no))).sort((a, b) => a - b),
          })));
        }
        setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [conductorId]);

  const nextPractice = upcomingPractices[0] || null;
  return (
    <section className="panel practice-next-card">
      <div className="practice-next-icon"><CalendarDays size={20} /></div>
      <div className="practice-next-content">
        <h3>Следующая практика</h3>
        <b>{loading ? 'Проверяем назначения…' : nextPractice ? formatDate(nextPractice.date) : 'Пока не назначена'}</b>
        <p className="muted">{loading ? 'Проверяем твой вагон…' : nextPractice ? 'Твоё ближайшее назначение: вагон ' + nextPractice.wagons.join(', ') + '.' : error || 'Когда ЛНП добавит тебя в вагон, дата и номер вагона появятся здесь.'}</p>
        {!loading && upcomingPractices.length > 0 && (
          <div className="practice-my-list">
            <b>Все ближайшие назначения</b>
            {upcomingPractices.map((practice, index) => (
              <div className="practice-my-row" key={practice.date}>
                <span>{formatDate(practice.date)}</span>
                <strong>Вагон {practice.wagons.join(', ')}</strong>
                {index === 0 && <small>Ближайшая</small>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function PracticeScheduleSummary({ conductors }: { conductors: Conductor[] }) {
  const [items, setItems] = useState<Array<{ day: PracticeDay; assignments: PracticeAssignment[] }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const today = localDate();
      const { data: dayRows } = await supabase
        .from('practice_days')
        .select('id,practice_date')
        .gte('practice_date', today)
        .order('practice_date', { ascending: true })
        .limit(8);
      const rows = (dayRows || []) as PracticeDay[];
      if (!rows.length) {
        if (active) { setItems([]); setLoading(false); }
        return;
      }
      const { data: assignmentRows } = await supabase
        .from('practice_assignments')
        .select('id,practice_day_id,wagon_no,slot,conductor_id')
        .in('practice_day_id', rows.map(row => row.id));
      const all = (assignmentRows || []) as PracticeAssignment[];
      if (active) {
        setItems(rows.map(day => ({ day, assignments: all.filter(item => item.practice_day_id === day.id) })));
        setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  return (
    <section className="panel practice-summary">
      <div className="section-heading">
        <div>
          <h3>Ближайшая практика проводников</h3>
          <p className="muted">Ближайшие даты и распределение по вагонам</p>
        </div>
      </div>
      {loading ? <div className="empty">Загружаем практику…</div> : items.length === 0 ? (
        <div className="empty">Практика пока не запланирована.</div>
      ) : items.map(({ day, assignments: assigned }) => (
        <div className="practice-summary-row" key={day.id}>
          <div className="practice-summary-date">{formatDate(day.practice_date)}</div>
          <div className="practice-summary-assignments">
            {assigned.length ? assigned.sort((a, b) => a.wagon_no - b.wagon_no || a.slot - b.slot).map(item => {
              const conductor = conductors.find(person => person.id === item.conductor_id);
              return <span key={item.id}>Вагон {item.wagon_no}: {conductor?.name || 'Проводник'}</span>;
            }) : <small>Пока нет назначенных проводников</small>}
          </div>
        </div>
      ))}
    </section>
  );
}
