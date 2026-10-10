import { firstStatedPrimitive } from '@/components/utils/renderSafe';
import { formatP7Degrees, isP7Number } from '@/components/utils/rp22/p7DisplayAuthority';

const normaliseLevel = value => String(value) === '0' ? 'FAIL' : /^[1-4]$/.test(String(value)) ? 'L' + value : value;
const rank = value => value === 'FAIL' ? 0 : /^L[1-4]$/.test(String(value)) ? Number(String(value).slice(1)) : -1;

/**
 * The parameter's own terminal state — scored, provisional, assumed, not
 * applicable or unresolved — read from the canonical parameter authority first,
 * so the state travels WITH the result instead of being re-inferred downstream
 * from the presence of a level. A level and a terminal state are different
 * facts: a provisional result carries a level too.
 */
function parameterState(summary, id, row) {
  const authorityState = summary?.parameterAuthority?.['p' + id]?.state ?? null;
  const stated = authorityState ?? row?.state ?? null;
  return stated ? String(stated).trim().toLowerCase() : null;
}

// Select a complete source row. Never borrow its grade from an aggregate.
export function readReportParameter(summary, id, { scope = 'project', seatId = null } = {}) {
  // P18 has ONE authority: the canonical published room result. A stored
  // parameter_index row is a legacy copy and must never override it, or a report
  // could state a P18 grade and grading basis the publication does not.
  const canonicalRoomFirst = Number(id) === 18 && !!summary?.roomResultsByParameter?.[18];
  if (summary?.parameter_index && !canonicalRoomFirst) {
    const saved = summary.parameter_index['P' + id];
    // P5's legacy MLP room headline is not its seat-scoped authority. Read an
    // existing published limiting seat row, without recalculation or regrading.
    if (Number(id) === 5 && scope === 'project' && saved?.supporting_per_seat?.length) {
      const seat = [...saved.supporting_per_seat].sort((a, b) => rank(a.level) - rank(b.level))[0];
      return { ...seat, scope: 'project', state: parameterState(summary, id, saved),
        supporting_per_seat: saved.supporting_per_seat,
        scopes: saved.scopes, text: seat.level + ' · ' + seat.value };
    }
    const row = scope === 'per-seat' ? saved?.supporting_per_seat?.find(item => String(item.seat_id) === String(seatId)) : scope === 'primary' || scope === 'secondary' ? saved?.scopes?.[scope] : saved;
    return row
      ? { ...row, state: parameterState(summary, id, row), text: (scope === 'primary' ? 'Primary ' : scope === 'secondary' ? 'Secondary ' : '') + row.level + ' · ' + row.value }
      : { key:'P'+id, scope, value:'—', level:'—', state:'unavailable', source_type:'unavailable' };
  }
  const key = 'p' + id;
  const room = summary?.roomResultsByParameter?.[id];
  let row = room || null;
  let resultScope = room ? (id === 19 ? 'rsp' : 'room') : scope;
  if (!room || id === 20) {
    const rows = summary?.project?.reportCounts?.seatResultsByParameter?.[key] || [];
    const selected = rows.filter(entry => {
      if (scope === 'per-seat') return String(entry.seatId) === String(seatId);
      if (scope === 'primary') return entry.isPrimary === true || entry.priority === 'primary';
      if (scope === 'secondary') return entry.isPrimary === false || entry.priority === 'secondary';
      return true;
    });
    // The lowest published seat grade is the all-seat floor. The associated
    // value/context remain on that very same row, not the first primary seat.
    row = [...selected].sort((a, b) => rank(normaliseLevel(a.level)) - rank(normaliseLevel(b.level)))[0] || null;
    resultScope = scope;
  }
  const origin = canonicalRoomFirst && summary?.parameter_index?.P18
    ? summary.parameter_index.P18 : row?.authority_fingerprint ? row : summary?.reportAuthority;
  const level = normaliseLevel(row?.level) || '—';
  const rawValue = row?.value ?? row?.rawValue ?? null;
  const value = isP7Number(id)
    ? formatP7Degrees(rawValue ?? row?.formatted) ?? '—'
    : firstStatedPrimitive([row?.formatted, row?.valueFormatted, row?.hudLabel, rawValue], '—');
  return {
    key: 'P' + id, parameter_id: id, scope: resultScope,
    raw_value: rawValue, value, unit: row?.unit ?? (id === 10 || id === 20 ? 'dB' : null),
    level, state: parameterState(summary, id, row),
    limiting_group: row?.limitingGroup ?? row?.seatId ?? null,
    context: row?.detail ?? row?.note ?? (row?.seatId ? 'Limiting seat ' + row.seatId : resultScope),
    authority_fingerprint: origin?.authority_fingerprint ?? summary?.reportAuthority?.authority_fingerprint ?? null,
    authority_timestamp: origin?.authority_timestamp ?? summary?.reportAuthority?.authority_timestamp ?? null,
    source_type: origin?.source_type ?? summary?.reportAuthority?.source_type ?? 'preview',
    text: (scope === 'primary' ? 'Primary ' : scope === 'secondary' ? 'Secondary ' : '')
      + level + ' · ' + value,
  };
}