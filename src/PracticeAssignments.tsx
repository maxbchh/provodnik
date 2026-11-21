import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from './supabase';

type Conductor = { id: string; name: string; isSeniorConductor?: boolean };
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
  type Lnp = { id: string; display_name: string };
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
  const defaultSecondWagons = [3] as const;
  const optionalSecondWagons = [1, 2, 4, 5, 6] as const;
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
    const currentDate = days.find(day => day.id === dayId)?.practice_date || '';
    const pastDays = days
      .filter(day => day.practice_date < currentDate)
      .sort((a, b) => b.practice_date.localeCompare(a.practice_date));
    const pastAssignments = assignments.filter(item => {
      const date = days.find(day => day.id === item.practice_day_id)?.practice_date || '';
      return date && date < currentDate;
    });
    const previousShiftDate = pastDays.find(day =>
      pastAssignments.some(item => item.practice_day_id === day.id)
    )?.practice_date || '';

    const scoreById = new Map<string, number>();
    for (const person of conductors) {
      const personStats = stats.find(item => item.conductorId === person.id);
      if (personStats && personStats.recommendationScore !== null && Number.isFinite(personStats.recommendationScore)) {
        scoreById.set(person.id, personStats.recommendationScore);
      }
    }
    const available = () => conductors
      .filter(person => !assignedIds.has(person.id) && scoreById.has(person.id))
      .map(person => ({
        person,
        stats: stats.find(item => item.conductorId === person.id)!,
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
    const wagonPreferenceBonus = (personId: string, wagonNo: number) => {
      const personalHistory = pastAssignments.filter(item => item.conductor_id === personId);
      const shiftsWorked = new Set(personalHistory.map(item => item.practice_day_id)).size;
      if (shiftsWorked < 2 || !personalHistory.length) return 0;
      const share = personalHistory.filter(item => item.wagon_no === wagonNo).length / personalHistory.length;
      return share * 58 * Math.min(1, shiftsWorked / 3);
    };
    const rotationPenalty = (personId: string, wagonNo: number) =>
      (workedThisWagonLastShift(personId, wagonNo) ? 10 : 0) +
      Math.max(0, wagonHistoryCount(personId, wagonNo) - 4) * 2;
    const pairKey = (firstId: string, secondId: string) => [firstId, secondId].sort().join('|');
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
    const pairAverage = (firstScore: number, secondScore: number) => (firstScore + secondScore) / 2;
    const pairQuality = (firstScore: number, secondScore: number) => {
      const average = pairAverage(firstScore, secondScore);
      const balance = 100 - Math.abs(average - groupAverage);
      return average * 0.8 + balance * 0.2;
    };

    const plan = new Map<string, {
      person: Conductor;
      stats: ConductorStats;
      tier: 'ticket' | 'online' | 'pair';
      historyCount: number;
      pairAverage: number | null;
      isSeniorConductor: boolean;
    }>();
    const isOccupied = (wagonNo: number, slot: number) =>
      assigned.some(item => item.wagon_no === wagonNo && item.slot === slot);
    const plannedPerson = (wagonNo: number, slot: number) =>
      plan.get(wagonNo + '-' + slot)?.person || null;
    const conductorScore = (personId: string) => scoreById.get(personId) ?? null;
    const setPlan = (
      wagonNo: number,
      slot: number,
      candidate: ReturnType<typeof available>[number],
      tier: 'ticket' | 'online' | 'pair',
      partnerScore: number | null = null
    ) => {
      plan.set(wagonNo + '-' + slot, {
        person: candidate.person,
        stats: candidate.stats,
        tier,
        historyCount: wagonHistoryCount(candidate.person.id, wagonNo),
        pairAverage: partnerScore === null ? null : pairAverage(candidate.score, partnerScore),
        isSeniorConductor: !!candidate.person.isSeniorConductor,
      });
      assignedIds.add(candidate.person.id);
    };

    const bestCandidate = (
      wagonNo: number,
      tier: 'ticket' | 'online' | 'pair',
      partnerId?: string
    ) => {
      const partnerScore = partnerId ? conductorScore(partnerId) : null;
      return available()
        .map(candidate => {
          const pairScore = partnerScore === null
            ? candidate.score
            : pairQuality(partnerScore, candidate.score);
          const repeatPairPenalty = partnerId
            ? pairHistoryCount(partnerId, candidate.person.id, wagonNo) * 28
            : 0;
          const rotation = rotationPenalty(candidate.person.id, wagonNo);
          const wagonPreference = wagonPreferenceBonus(candidate.person.id, wagonNo);
          const roleScore = tier === 'online'
            ? wagonNo === 6
              ? (100 - candidate.score) * 0.12
              : (100 - candidate.score) * 0.78
            : pairScore;
          const seniorBonus = candidate.person.isSeniorConductor && [3, 1, 6].includes(wagonNo) ? 18 : 0;
          const adjusted = roleScore + wagonPreference + seniorBonus - rotation - repeatPairPenalty;
          return { candidate, adjusted };
        })
        .sort((a, b) =>
          b.adjusted - a.adjusted ||
          a.candidate.person.name.localeCompare(b.candidate.person.name, 'ru')
        )[0] || null;
    };

    const bestPair = (wagonNo: number) => {
      const candidates = available();
      let best: { first: typeof candidates[number]; second: typeof candidates[number]; adjusted: number } | null = null;
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
          const first = candidates[i];
          const second = candidates[j];
          const adjusted =
            pairQuality(first.score, second.score) +
            wagonPreferenceBonus(first.person.id, wagonNo) +
            wagonPreferenceBonus(second.person.id, wagonNo) -
            rotationPenalty(first.person.id, wagonNo) -
            rotationPenalty(second.person.id, wagonNo) -
            pairHistoryCount(first.person.id, second.person.id, wagonNo) * 28;
          if (!best || adjusted > best.adjusted) best = { first, second, adjusted };
        }
      }
      return best;
    };

    const fillFirstSeat = (wagonNo: number, tier: 'ticket' | 'online') => {
      if (isOccupied(wagonNo, 1)) return;
      const candidate = bestCandidate(wagonNo, tier);
      if (candidate) setPlan(wagonNo, 1, candidate.candidate, tier);
    };

    const fillSecondSeat = (wagonNo: number, tier: 'ticket' | 'pair') => {
      if (isOccupied(wagonNo, 2)) return;
      const partner = assigned.find(item => item.wagon_no === wagonNo && item.slot === 1);
      const partnerId = partner?.conductor_id || plannedPerson(wagonNo, 1)?.id;
      if (!partnerId) return;
      const candidate = bestCandidate(wagonNo, tier === 'ticket' ? 'ticket' : 'pair', partnerId);
      if (candidate) {
        setPlan(wagonNo, 2, candidate.candidate, tier, conductorScore(partnerId));
      }
    };

    // Fill wagon 3 first: its permanent pair is normally the strongest team.
    // A conductor's regular wagon history is a positive preference, not a reason
    // to rotate them away from the place where they usually perform well.
    if (!isOccupied(3, 1) && !isOccupied(3, 2)) {
      const pair = bestPair(3);
      if (pair) {
        setPlan(3, 1, pair.first, 'ticket');
        setPlan(3, 2, pair.second, 'ticket', pair.first.score);
      } else {
        fillFirstSeat(3, 'ticket');
      }
    } else {
      if (!isOccupied(3, 1)) {
        const partnerId = assigned.find(item => item.wagon_no === 3 && item.slot === 2)?.conductor_id;
        const candidate = bestCandidate(3, 'ticket', partnerId);
        if (candidate) setPlan(3, 1, candidate.candidate, 'ticket', partnerId ? conductorScore(partnerId) : null);
      }
      if (!isOccupied(3, 2)) fillSecondSeat(3, 'ticket');
    }

    // Wagon 6 is flexible: a strong conductor may be recommended there when
    // their assignment history shows that this is one of their usual wagons.
    fillFirstSeat(6, 'online');

    // Wagon 1 gets the next strongest suitable candidate; wagon 2 follows.
    fillFirstSeat(1, 'ticket');
    fillFirstSeat(2, 'ticket');

    // Wagons 4 and 5 normally take the lower-rated remaining candidates.
    [4, 5].forEach(wagonNo => fillFirstSeat(wagonNo, 'online'));

    // Optional second places are suggested only after the operator opens them:
    // wagons 1, 2, 4, 5, and 6. Wagon 3 always has two places by default.
    for (const wagonNo of optionalSecondWagons) {
      if (expandedSlots[dayId + '-' + wagonNo]) {
        fillSecondSeat(wagonNo, 'pair');
      }
    }

    return plan;
  };

  const getExtraPlacementRecommendation = (dayId: string) => {
    const dayAssignments = assignments.filter(item => item.practice_day_id === dayId);
    const firstSeatsFilled = [1, 2, 3, 4, 5, 6].every(wagonNo =>
      dayAssignments.some(item => item.wagon_no === wagonNo && item.slot === 1)
    );
    if (!firstSeatsFilled) return null;

    const freeTargets = [1, 2, 4, 5, 6].filter(wagonNo =>
      !dayAssignments.some(item => item.wagon_no === wagonNo && item.slot === 2)
    );
    if (!freeTargets.length) return null;

    const assignedIds = new Set(dayAssignments.map(item => item.conductor_id));
    const remaining = conductors
      .filter(person => !assignedIds.has(person.id))
      .map(person => ({
        person,
        stats: stats.find(item => item.conductorId === person.id),
      }))
      .filter(item => item.stats && item.stats.recommendationScore !== null && Number.isFinite(item.stats.recommendationScore)) as Array<{
        person: Conductor;
        stats: ConductorStats;
      }>;
    if (!remaining.length) return null;

    const dayDate = days.find(day => day.id === dayId)?.practice_date || '';
    const pastAssignments = assignments.filter(item => {
      const date = days.find(day => day.id === item.practice_day_id)?.practice_date || '';
      return date && date < dayDate;
    });
    const pastDays = days.filter(day => day.practice_date < dayDate).sort((a, b) => b.practice_date.localeCompare(a.practice_date));
    const previousShiftDate = pastDays.find(day =>
      pastAssignments.some(item => item.practice_day_id === day.id)
    )?.practice_date || '';
    const scoreOf = (id: string) => Number(remaining.find(item => item.person.id === id)?.stats.recommendationScore ??
      stats.find(item => item.conductorId === id)?.recommendationScore ?? 0);
    const wagonPreferenceBonus = (personId: string, wagonNo: number) => {
      const personalHistory = pastAssignments.filter(item => item.conductor_id === personId);
      const shiftsWorked = new Set(personalHistory.map(item => item.practice_day_id)).size;
      if (shiftsWorked < 2 || !personalHistory.length) return 0;
      const share = personalHistory.filter(item => item.wagon_no === wagonNo).length / personalHistory.length;
      return share * 58 * Math.min(1, shiftsWorked / 3);
    };
    const rotationPenalty = (personId: string, wagonNo: number) =>
      (previousShiftDate && pastAssignments.some(item =>
        item.conductor_id === personId &&
        item.wagon_no === wagonNo &&
        days.find(day => day.id === item.practice_day_id)?.practice_date === previousShiftDate
      ) ? 10 : 0) +
      Math.max(0, pastAssignments.filter(item => item.conductor_id === personId && item.wagon_no === wagonNo).length - 4) * 2;
    const pairRepeatPenalty = (firstId: string, secondId: string, wagonNo: number) => {
      const key = [firstId, secondId].sort().join('|');
      const previousPairDates = new Set<string>();
      for (const item of pastAssignments) {
        if (item.wagon_no !== wagonNo) continue;
        const matched = pastAssignments.some(other =>
          other.practice_day_id === item.practice_day_id &&
          other.wagon_no === wagonNo &&
          other.conductor_id !== item.conductor_id &&
          [item.conductor_id, other.conductor_id].sort().join('|') === key
        );
        if (matched) previousPairDates.add(item.practice_day_id);
      }
      return previousPairDates.size * 28;
    };

    const scores = stats.map(item => item.recommendationScore).filter((value): value is number => value !== null && Number.isFinite(value));
    const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 70;
    let best: { person: Conductor; wagonNo: number; pairAverage: number; adjusted: number } | null = null;
    for (const wagonNo of freeTargets) {
      const partnerId = dayAssignments.find(item => item.wagon_no === wagonNo && item.slot === 1)?.conductor_id;
      if (!partnerId) continue;
      for (const candidate of remaining) {
        const candidateScore = Number(candidate.stats.recommendationScore);
        const avg = (scoreOf(partnerId) + candidateScore) / 2;
        const balancedQuality = avg * 0.8 + (100 - Math.abs(avg - average)) * 0.2;
        const adjusted = balancedQuality +
          wagonPreferenceBonus(candidate.person.id, wagonNo) -
          rotationPenalty(candidate.person.id, wagonNo) -
          pairRepeatPenalty(partnerId, candidate.person.id, wagonNo);
        if (!best || adjusted > best.adjusted) {
          best = { person: candidate.person, wagonNo, pairAverage: avg, adjusted };
        }
      }
    }
    return best;
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
      recommendation.pairAverage !== null ? 'средний рейтинг пары ' + Math.round(recommendation.pairAverage) : '',
      recommendation.historyCount === 0 ? 'в этом вагоне ещё не был' : 'в этом вагоне ранее: ' + recommendation.historyCount + ' смен',
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
        {assignment && <button type="button" className="practice-clear-assignment" disabled={saving} onClick={() => void saveAssignment(day.id, wagonNo, slot, '')}>Очистить назначение</button>}
        {!assignment && recommendation && (
          <div className="practice-recommendation">
            <div className="practice-recommendation-copy">
              <span>{recommendation.tier === 'ticket' ? 'Продажа обычных билетов · нужен опыт' : recommendation.tier === 'online' ? 'Онлайн-продажи' : 'Подбор второго проводника'}</span>
              <b>{recommendation.person.name} <strong className={(recommendation.stats.recommendationScore ?? 0) > 80 ? 'rating-badge-high' : (recommendation.stats.recommendationScore ?? 0) > 50 ? 'rating-badge-medium' : 'rating-badge-low'}>{Math.round(recommendation.stats.recommendationScore ?? 0)}/100</strong></b>
              {recommendationDetails && <small>{recommendationDetails}</small>}
            </div>
            <button type="button" className="practice-recommend-button" disabled={saving} onClick={() => void saveAssignment(day.id, wagonNo, slot, recommendation.person.id)}>
              Поставить
            </button>
          </div>
        )}
        {!assignment && !recommendation && (
          <small className="practice-recommendation-empty">
            {wagonNo <= 3
              ? 'Для продажи обычных билетов лучше подходит проводник с более высоким рейтингом.'
              : 'Для онлайн-продаж подбирается свободный проводник из оставшихся.'}
          </small>
        )}
      </div>
    );
  };

  const renderExtraPlacementRecommendation = (day: PracticeDay) => {
    const suggestion = getExtraPlacementRecommendation(day.id);
    if (!suggestion) return null;
    return (
      <div className="practice-extra-suggestion">
        <div className="practice-extra-copy">
          <b>Все вагоны укомплектованы по одному проводнику</b>
          <span>Следующее предложение: вагон {suggestion.wagonNo} — {suggestion.person.name}</span>
          <small>Средний рейтинг пары: {Math.round(suggestion.pairAverage)}. Учитываются ротация по прошлым сменам и неповторение пары.</small>
        </div>
        <button
          type="button"
          className="practice-recommend-button"
          disabled={saving}
          onClick={() => {
            setExpandedSlots(previous => ({ ...previous, [day.id + '-' + suggestion.wagonNo]: true }));
            void saveAssignment(day.id, suggestion.wagonNo, 2, suggestion.person.id);
          }}
        >
          Добавить в вагон {suggestion.wagonNo}
        </button>
      </div>
    );
  };

  return (
    <section className="panel practice-panel">
      <div className="section-heading">
        <div>
          <h3>Журнал назначений на практику</h3>
          <p className="muted">Подбор учитывает рейтинг и историю назначений: сильных проводников сайт обычно предлагает в вагоны 3 и 1, а в вагон 6 может поставить опытного человека, если он чаще работает там. В вагоны 4 и 5 обычно идут остальные свободные проводники.</p>
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
                    {renderExtraPlacementRecommendation(day)}
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
                          {defaultSecondWagons.includes(wagonNo as 3) || assignments.some(item => item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === 2) || expandedSlots[day.id + '-' + wagonNo] ? (
                            renderSelect(day, wagonNo, 2)
                          ) : optionalSecondWagons.includes(wagonNo as 1 | 2 | 4 | 5 | 6) && assignments.some(item => item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === 1) ? (
                            <button
                              type="button"
                              className="practice-add-second"
                              disabled={saving}
                              onClick={() => setExpandedSlots(previous => ({ ...previous, [day.id + '-' + wagonNo]: true }))}
                            >
                              <Plus size={12} /> Добавить второго
                            </button>
                          ) : null}
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
            {renderExtraPlacementRecommendation(day)}
            <div className="practice-mobile-lnps">
              <strong>ЛНП</strong>
              <div>
                {lnps.slice(0, 2).map(lnp => <span key={lnp.id}>{lnp.display_name}{lnp.is_senior_conductor?' · ★ Старший проводник':''}</span>)}
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
                  {defaultSecondWagons.includes(wagonNo as 3) || assignments.some(item => item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === 2) || expandedSlots[day.id + '-' + wagonNo] || (optionalSecondWagons.includes(wagonNo as 1 | 2 | 4 | 5 | 6) && assignments.some(item => item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === 1)) ? (
                    <div className="practice-mobile-slot">
                      <small>Второй проводник</small>
                      {defaultSecondWagons.includes(wagonNo as 3) || assignments.some(item => item.practice_day_id === day.id && item.wagon_no === wagonNo && item.slot === 2) || expandedSlots[day.id + '-' + wagonNo] ? (
                        renderSelect(day, wagonNo, 2)
                      ) : (
                        <button
                          type="button"
                          className="practice-add-second"
                          disabled={saving}
                          onClick={() => setExpandedSlots(previous => ({ ...previous, [day.id + '-' + wagonNo]: true }))}
                        >
                          <Plus size={12} /> Добавить второго
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <p className="practice-legend"><b>Вагон 0</b> автоматически показывает оба аккаунта ЛНП. В вагоне 3 всегда два места. Второго проводника вручную можно добавить в вагоны 1, 2, 4, 5 и 6. Рекомендации учитывают рейтинг, привычные вагоны по прошлым назначениям и ротацию.</p>
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
