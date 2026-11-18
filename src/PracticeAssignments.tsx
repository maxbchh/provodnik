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
  const priorityWagons = [3, 1, 6] as const;
  const visibleWagons = showSeventhWagon ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];
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

  const buildRecommendationPlan = (dayId: string) => {
    const assigned = assignments.filter(item => item.practice_day_id === dayId);
    const assignedIds = new Set(assigned.map(item => item.conductor_id));
    const currentDay = days.find(day => day.id === dayId);
    const currentDate = currentDay?.practice_date || '';
    const pastDays = days
      .filter(day => day.practice_date < currentDate)
      .sort((a, b) => b.practice_date.localeCompare(a.practice_date));
    const previousShiftDate = pastDays[0]?.practice_date || '';
    const pastAssignments = assignments.filter(item => {
      const date = days.find(day => day.id === item.practice_day_id)?.practice_date || '';
      return date && date < currentDate;
    });

    const scoreById = new Map<string, number>();
    for (const person of conductors) {
      const item = stats.find(entry => entry.conductorId === person.id);
      if (item && item.recommendationScore !== null && Number.isFinite(item.recommendationScore)) {
        scoreById.set(person.id, item.recommendationScore);
      }
    }
    const available = () => conductors
      .filter(person => !assignedIds.has(person.id) && scoreById.has(person.id))
      .map(person => ({
        person,
        stats: stats.find(entry => entry.conductorId === person.id)!,
        score: scoreById.get(person.id)!,
      }));

    const wagonHistoryCount = (personId: string, wagonNo: number) =>
      pastAssignments.filter(item => item.conductor_id === personId && item.wagon_no === wagonNo).length;
    const workedThisWagonLastShift = (personId: string, wagonNo: number) =>
      !!previousShiftDate && pastAssignments.some(item =>
        item.conductor_id === personId &&
        item.wagon_no === wagonNo &&
        days.find(day => day.id === item.practice_day_id)?.practice_date === previousShiftDate
      );
    const personRotationPenalty = (personId: string, wagonNo: number) =>
      wagonHistoryCount(personId, wagonNo) * 22 +
      (workedThisWagonLastShift(personId, wagonNo) ? 18 : 0);

    const pairKey = (firstId: string, secondId: string) =>
      [firstId, secondId].sort().join('|');
    const pairHistoryCount = (firstId: string, secondId: string, wagonNo: number) => {
      const key = pairKey(firstId, secondId);
      const previousDays = new Set<string>();
      for (const item of pastAssignments) {
        if (item.wagon_no !== wagonNo) continue;
        const partner = pastAssignments.find(other =>
          other.practice_day_id === item.practice_day_id &&
          other.wagon_no === wagonNo &&
          other.conductor_id !== item.conductor_id &&
          pairKey(item.conductor_id, other.conductor_id) === key
        );
        if (partner) previousDays.add(item.practice_day_id);
      }
      return previousDays.size;
    };

    const allScores = Array.from(scoreById.values());
    const groupAverage = allScores.length
      ? allScores.reduce((sum, value) => sum + value, 0) / allScores.length
      : 70;
    const pairQuality = (firstScore: number, secondScore: number) => {
      const average = (firstScore + secondScore) / 2;
      // Judge the two-person team by its average, not by each person's score alone.
      // This allows a 49 + 90 team to be considered a reasonable pair.
      const balance = 100 - Math.abs(average - groupAverage);
      return average * 0.8 + balance * 0.2;
    };

    const isOccupied = (wagonNo: number, slot: number) =>
      assigned.some(item => item.wagon_no === wagonNo && item.slot === slot);
    const plan = new Map<string, {
      person: Conductor;
      stats: ConductorStats;
      lowPriority: boolean;
      historyCount: number;
      pairAverage: number | null;
    }>();
    const setPlan = (
      wagonNo: number,
      slot: number,
      candidate: ReturnType<typeof available>[number],
      lowPriority = false,
      partnerScore: number | null = null
    ) => {
      plan.set(wagonNo + '-' + slot, {
        person: candidate.person,
        stats: candidate.stats,
        lowPriority,
        historyCount: wagonHistoryCount(candidate.person.id, wagonNo),
        pairAverage: partnerScore === null ? null : (candidate.score + partnerScore) / 2,
      });
      assignedIds.add(candidate.person.id);
    };

    const bestSingle = (wagonNo: number, partnerId?: string) => {
      const partnerScore = partnerId ? scoreById.get(partnerId) : undefined;
      return available()
        .map(candidate => {
          const pairScore = partnerScore === undefined ? candidate.score : pairQuality(partnerScore, candidate.score);
          const repeatPenalty = partnerId ? pairHistoryCount(partnerId, candidate.person.id, wagonNo) * 28 : 0;
          const adjusted = pairScore - personRotationPenalty(candidate.person.id, wagonNo) - repeatPenalty;
          return { candidate, adjusted, pairScore };
        })
        .sort((a, b) => b.adjusted - a.adjusted || a.candidate.person.name.localeCompare(b.candidate.person.name, 'ru'))[0] || null;
    };

    const bestPair = (wagonNo: number) => {
      const candidates = available();
      let best: { first: typeof candidates[number]; second: typeof candidates[number]; adjusted: number; pairScore: number } | null = null;
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
          const first = candidates[i];
          const second = candidates[j];
          const pairScore = pairQuality(first.score, second.score);
          const historyPenalty =
            personRotationPenalty(first.person.id, wagonNo) +
            personRotationPenalty(second.person.id, wagonNo);
          const repeatPenalty = pairHistoryCount(first.person.id, second.person.id, wagonNo) * 28;
          const adjusted = pairScore - historyPenalty - repeatPenalty;
          if (!best || adjusted > best.adjusted) best = { first, second, adjusted, pairScore };
        }
      }
      return best;
    };

    const fillBalancedWagon = (wagonNo: number, lowPriority = false) => {
      const firstEmpty = !isOccupied(wagonNo, 1);
      const secondOpen = isOccupied(wagonNo, 2) || expandedSlots[dayId + '-' + wagonNo];
      const secondEmpty = secondOpen && !isOccupied(wagonNo, 2);

      if (firstEmpty && secondEmpty) {
        const pair = bestPair(wagonNo);
        if (pair) {
          setPlan(wagonNo, 1, pair.first, lowPriority);
          setPlan(wagonNo, 2, pair.second, lowPriority, pair.first.score);
        }
        return;
      }

      const openSlot = firstEmpty ? 1 : secondEmpty ? 2 : null;
      if (openSlot === null) return;
      const existingPartner = assigned.find(item =>
        item.wagon_no === wagonNo && item.slot === (openSlot === 1 ? 2 : 1)
      );
      const match = bestSingle(wagonNo, existingPartner?.conductor_id);
      if (match) setPlan(wagonNo, openSlot, match.candidate, lowPriority, existingPartner ? match.candidate.stats.recommendationScore === null ? null : scoreById.get(existingPartner.conductor_id) ?? null : null);
    };

    // First staff the required wagons; historical frequency rotates people between shifts.
    [3, 1, 6].forEach(wagonNo => fillBalancedWagon(wagonNo));

    // Wagon 4 gets a lower-rated spare candidate only after the required seats are covered.
    const emptyRequiredSeats = [3, 1, 6].reduce((total, wagonNo) =>
      total + [1, 2].filter(slot => !isOccupied(wagonNo, slot) && !plan.has(wagonNo + '-' + slot)).length, 0);
    const remainingCandidates = available();
    const freeWagonFourSlots = [1, 2].filter(slot =>
      !isOccupied(4, slot) && (slot === 1 || expandedSlots[dayId + '-4'])
    );
    const spareCount = Math.max(0, remainingCandidates.length - emptyRequiredSeats);
    const lowCount = Math.min(freeWagonFourSlots.length, spareCount);
    if (lowCount > 0) {
      const lowCandidates = remainingCandidates
        .map(candidate => ({
          ...candidate,
          adjusted: candidate.score + personRotationPenalty(candidate.person.id, 4),
        }))
        .sort((a, b) => a.adjusted - b.adjusted || a.person.name.localeCompare(b.person.name, 'ru'));
      const lowFirst = lowCandidates[0];
      if (lowFirst) {
        const firstSlot = freeWagonFourSlots[0];
        if (firstSlot === 1 && freeWagonFourSlots.includes(2) && lowCount >= 2) {
          const companion = bestSingle(4, lowFirst.person.id);
          if (companion && companion.candidate.person.id !== lowFirst.person.id) {
            setPlan(4, 1, lowFirst, true);
            setPlan(4, 2, companion.candidate, true, lowFirst.score);
          } else {
            setPlan(4, 1, lowFirst, true);
          }
        } else {
          setPlan(4, firstSlot, lowFirst, true);
        }
      }
    }

    // Other wagons remain available too. Recommendations appear only for places
    // the operator has opened, so hidden optional second seats don't consume candidates.
    visibleWagons
      .filter(wagonNo => ![3, 1, 6, 4].includes(wagonNo))
      .forEach(wagonNo => fillBalancedWagon(wagonNo));

    // If wagon 4 still has an optional open second seat, fill it with a suitable partner.
    if (expandedSlots[dayId + '-4'] && !isOccupied(4, 2) && !plan.has('4-2')) {
      const partnerId = assigned.find(item => item.wagon_no === 4 && item.slot === 1)?.conductor_id ||
        plan.get('4-1')?.person.id;
      const match = bestSingle(4, partnerId);
      if (match) setPlan(4, 2, match.candidate, true, partnerId ? scoreById.get(partnerId) ?? null : null);
    }

    return plan;
  };

  const renderSelect = (day: PracticeDay, wagonNo: number, slot: number) => {
    const assignment = assignments.find(item =>
      item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === slot
    );
    const recommendation = buildRecommendationPlan(day.id).get(wagonNo + '-' + slot);
    const recommendationDetails = recommendation ? [
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
        {!assignment && recommendation && (
          <div className={'practice-recommendation ' + (recommendation.lowPriority ? 'practice-recommendation-low' : '')}>
            <div className="practice-recommendation-copy">
              <span>{recommendation.lowPriority ? 'Низкий рейтинг · подбор для вагона 4' : [3, 1, 6].includes(wagonNo) ? 'Приоритетное назначение' : 'Рекомендация сайта'}</span>
              <b>{recommendation.person.name} <strong>{Math.round(recommendation.stats.recommendationScore || 0)}/100</strong></b>
              {recommendationDetails && <small>{recommendationDetails}</small>}
            </div>
            <button type="button" className="practice-recommend-button" disabled={saving} onClick={() => void saveAssignment(day.id, wagonNo, slot, recommendation.person.id)}>
              Поставить
            </button>
          </div>
        )}
        {!assignment && !recommendation && (
          <small className="practice-recommendation-empty">
            {wagonNo === 4
              ? 'Вагон 4 получает кандидата с более низким рейтингом после заполнения приоритетных мест.'
              : 'Рекомендация появится, когда останется свободный кандидат с заполненной статистикой.'}
          </small>
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
              {[0, ...visibleWagons].map(wagonNo => (
                <tr key={wagonNo}>
                  <th>
                    <span className="practice-wagon-number">{wagonNo}</span>
                    <small>{wagonNo === 0 ? 'ЛНП' : wagonNo === 3 ? 'штабной · обычные билеты' : wagonNo <= 2 ? 'обычные билеты' : wagonNo <= 6 ? 'онлайн-билеты' : 'дополнительный вагон'}</small>
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
                          {(priorityWagons as readonly number[]).includes(wagonNo) || assignments.some(item => item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === 2) ? (
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
              {visibleWagons.map(wagonNo => (
                <div className="practice-mobile-wagon" key={wagonNo}>
                  <div className="practice-mobile-wagon-title"><span className="practice-mobile-wagon-name">Вагон {wagonNo}{wagonNo === 3 ? ' · Штабной' : ''}</span><span className="practice-ticket-type">{wagonNo <= 3 ? 'Обычные билеты' : wagonNo <= 6 ? 'Онлайн-билеты' : 'Дополнительный вагон'}</span></div>
                  <div className="practice-mobile-slot">
                    <small>Первый проводник</small>
                    {renderSelect(day, wagonNo, 1)}
                  </div>
                  <div className="practice-mobile-slot">
                    <small>Второй проводник</small>
                    {(priorityWagons as readonly number[]).includes(wagonNo) || assignments.some(item => item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === 2) ? (
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
