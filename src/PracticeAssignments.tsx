import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from './supabase';

type Conductor = { id: string; name: string };
type ConductorStats = {conductorId:string;recommendationScore:number|null;rating:number|null;criteriaAverage:number|null;gradeAverage:number|null;attendanceRate:number|null;};
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
  stats,
}: {
  conductors: Conductor[];
  lnps: Lnp[];
  currentUserId: string;
  stats: ConductorStats[];
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
    const recommendation = conductors
      .filter(candidate => !assignments.some(item =>
        item.practice_day_id === day.id &&
        item.conductor_id === candidate.id &&
        !(item.wagon_no === wagonNo && item.slot === slot)
      ))
      .map(candidate => ({ candidate, stats: stats.find(item => item.conductorId === candidate.id) }))
      .filter(item => item.stats && item.stats.recommendationScore !== null && Number.isFinite(item.stats.recommendationScore))
      .sort((a, b) => (b.stats?.recommendationScore || 0) - (a.stats?.recommendationScore || 0))[0];
    const recommendationDetails = recommendation?.stats ? [
      recommendation.stats.rating !== null ? 'рейтинг ' + Math.round(recommendation.stats.rating) : '',
      recommendation.stats.criteriaAverage !== null ? 'качества ' + Math.round(recommendation.stats.criteriaAverage) : '',
      recommendation.stats.gradeAverage !== null ? 'оценки ' + recommendation.stats.gradeAverage.toFixed(1) + '/10' : '',
      recommendation.stats.attendanceRate !== null ? 'посещаемость ' + Math.round(recommendation.stats.attendanceRate) + '%' : '',
    ].filter(Boolean).join(' · ') : '';

    return (
      <div className="practice-select-wrap">
        <select
          className="practice-select"
          value={assignment?.conductor_id || ''}
          disabled={saving}
          aria-label={'Проводник, вагон ' + wagonNo + ', место ' + slot + ', ' + formatDate(day.practice_date)}
          onChange={event => void saveAssignment(day.id, wagonNo, slot, event.target.value)}
        >
          <option value="">Не назначен</option>
          {conductors.map(conductor => {
            const usedElsewhere = assignments.some(item =>
              item.practice_day_id === day.id &&
              item.conductor_id === conductor.id &&
              !(item.wagon_no === wagonNo && item.slot === slot)
            );
            return (
              <option key={conductor.id} value={conductor.id} disabled={usedElsewhere}>
                {conductor.name}{usedElsewhere ? ' · уже назначен' : ''}
              </option>
            );
          })}
        </select>
        {!assignment && (
          <div className="practice-recommendation">
            {recommendation ? (
              <>
                <div className="practice-recommendation-copy">
                  <span>Рекомендация сайта</span>
                  <b>{recommendation.candidate.name} <strong>{Math.round(recommendation.stats?.recommendationScore || 0)}/100</strong></b>
                  {recommendationDetails && <small>{recommendationDetails}</small>}
                </div>
                <button type="button" className="practice-recommend-button" disabled={saving} onClick={() => void saveAssignment(day.id, wagonNo, slot, recommendation.candidate.id)}>
                  Поставить
                </button>
              </>
            ) : (
              <small className="practice-recommendation-empty">Пока недостаточно статистики для рекомендации. Выбери проводника вручную.</small>
            )}
          </div>
        )}
      </div>
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
      <div className="practice-mobile-list">
        {days.map(day => (
          <article className="practice-mobile-day" key={day.id}>
            <div className="practice-mobile-day-head">
              <b>{formatDate(day.practice_date)}</b>
              <button type="button" className="practice-delete-date" title="Удалить дату" onClick={() => void deletePracticeDate(day)}>
                <Trash2 size={14} />
              </button>
            </div>
            <div className="practice-mobile-lnps">
              <strong>ЛНП</strong>
              <div>
                {lnps.slice(0, 2).map(lnp => <span key={lnp.id}>{lnp.display_name}</span>)}
                {lnps.length < 2 && <small>Ожидается второй ЛНП</small>}
              </div>
            </div>
            <div className="practice-mobile-wagons">
              {(showSeventhWagon ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6]).map(wagonNo => (
                <div className="practice-mobile-wagon" key={wagonNo}>
                  <div className="practice-mobile-wagon-title">Вагон {wagonNo}</div>
                  <div className="practice-mobile-slot">
                    <small>Первый проводник</small>
                    {renderSelect(day, wagonNo, 1)}
                  </div>
                  <div className="practice-mobile-slot">
                    <small>Второй проводник</small>
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
                        <Plus size={12} /> Добавить второго
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
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
