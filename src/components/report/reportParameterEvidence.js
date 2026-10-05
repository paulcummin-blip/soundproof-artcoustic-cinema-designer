import { firstStatedPrimitive } from '@/components/utils/renderSafe';
import { formatP7Degrees, isP7Number } from '@/components/utils/rp22/p7DisplayAuthority';

// The Technical Report and saved evidence share this passive presentation read.
export function readReportParameter(engineeringSummary, id) {
  const key = `p${id}`;
  const room = engineeringSummary?.roomResultsByParameter?.[id];
  const level = engineeringSummary?.parameterSummaries?.project?.[key]?.level || room?.level || '—';
  let value;
  if (room) {
    value = isP7Number(id) ? formatP7Degrees(room.value ?? room.deviation ?? room.formatted) : null;
    value = value ?? firstStatedPrimitive([room.formatted, room.hudLabel, room.value], '—');
  } else if (id === 19) {
    value = engineeringSummary?.p19SeatAuthority?.project?.coverageSummary
      ?? engineeringSummary?.project?.coverage?.sentence ?? 'NOT CALCULATED';
  } else {
    const seatId = engineeringSummary?.primary?.seatIds?.[0] ?? engineeringSummary?.project?.seatIds?.[0] ?? '';
    const seat = (engineeringSummary?.project?.reportCounts?.seatResultsByParameter?.[key] || [])
      .find((row) => String(row.seatId) === String(seatId));
    value = firstStatedPrimitive([seat?.valueFormatted, seat?.value], 'Seat results');
  }
  return { parameter_id: id, level, value, text: `${level} · ${value}` };
}