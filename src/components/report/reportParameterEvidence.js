import { firstStatedPrimitive } from '@/components/utils/renderSafe';
import { formatP7Degrees, isP7Number } from '@/components/utils/rp22/p7DisplayAuthority';

const normaliseLevel = value => String(value) === '0' ? 'FAIL' : /^[1-4]$/.test(String(value)) ? 'L' + value : value;
const rank = value => value === 'FAIL' ? 0 : /^L[1-4]$/.test(String(value)) ? Number(String(value).slice(1)) : -1;

// Select a complete source row. Never borrow its grade from an aggregate.
export function readReportParameter(summary, id, { scope = 'project', seatId = null } = {}) {
  // P18 has ONE authority: the canonical published room result. A stored
  // parameter_index row is a legacy copy and must never override it, or a report
  // could state a P18 grade and grading basis the publication does not.
  const canonicalRoomFirst = Number(id) === 18 && !!summary?.roomResultsByParameter?.[18];
  if (summary?.parameter_index && !canonicalRoomFirst) {
    const saved = summary.parameter_index['P' + id];
    const row = scope === 'per-seat' ? saved?.supporting_per_seat?.find(item => String(item.seat_id) === String(seatId)) : scope === 'primary' || scope === 'secondary' ? saved?.scopes?.[scope] : saved;
    return row ? { ...row, text: (scope === 'primary' ? 'Primary ' : scope === 'secondary' ? 'Secondary ' : '') + row.level + ' · ' + row.value } : { key:'P'+id, scope, value:'—', level:'—', source_type:'unavailable' };
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
  const origin = row?.authority_fingerprint ? row : summary?.reportAuthority;
  const level = normaliseLevel(row?.level) || '—';
  const rawValue = row?.value ?? row?.rawValue ?? null;
  const value = isP7Number(id)
    ? formatP7Degrees(rawValue ?? row?.formatted) ?? '—'
    : firstStatedPrimitive([row?.formatted, row?.valueFormatted, row?.hudLabel, rawValue], '—');
  return {
    key: 'P' + id, parameter_id: id, scope: resultScope,
    raw_value: rawValue, value, unit: row?.unit ?? (id === 10 || id === 20 ? 'dB' : null),
    level, limiting_group: row?.limitingGroup ?? row?.seatId ?? null,
    context: row?.detail ?? row?.note ?? (row?.seatId ? 'Limiting seat ' + row.seatId : resultScope),
    authority_fingerprint: origin?.authority_fingerprint ?? null,
    authority_timestamp: origin?.authority_timestamp ?? null,
    source_type: origin?.source_type ?? 'preview',
    text: (scope === 'primary' ? 'Primary ' : scope === 'secondary' ? 'Secondary ' : '')
      + level + ' · ' + value,
  };
}