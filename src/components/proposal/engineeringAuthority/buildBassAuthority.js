/**
 * Passive bass proposal adapter.
 *
 * P14/P18 are direct reads from the canonical room-result publication.
 * P19/P20 per-seat values and floors are adapted separately from the same
 * canonical engineering summary. No bass grading or interpretation occurs.
 */

function adaptRoomResult(id, result) {
  return {
    parameter_id: id,
    parameter_key: `p${id}`,
    achieved_level: result?.level || "N/A",
    raw_value: result?.value ?? null,
    formatted_value: result?.formatted ?? null,
    status: result?.status ?? null,
    detail: result?.detail ?? null,
  };
}

export function buildBassAuthority(engineeringSummary) {
  const p14Result = engineeringSummary?.roomResultsByParameter?.[14] || null;
  const p18Result = engineeringSummary?.roomResultsByParameter?.[18] || null;
  const p19Rows = engineeringSummary?.project?.reportCounts?.seatResultsByParameter?.p19 || [];
  const p20Rows = engineeringSummary?.project?.reportCounts?.seatResultsByParameter?.p20 || [];
  const available = !!engineeringSummary && (
    p14Result?.level || p18Result?.level || p19Rows.length > 0 || p20Rows.length > 0
  );

  return {
    available,
    p14: adaptRoomResult(14, p14Result),
    p18: adaptRoomResult(18, p18Result),
    p19: {
      parameter_id: 19,
      parameter_key: "p19",
      achieved_level: engineeringSummary?.parameterSummaries?.project?.p19?.level || "N/A",
      per_seat: p19Rows,
    },
    p20: {
      parameter_id: 20,
      parameter_key: "p20",
      achieved_level: engineeringSummary?.parameterSummaries?.project?.p20?.level || "N/A",
      per_seat: p20Rows,
    },
    subwoofer_strategy_summary: available ? "Authoritative published bass result." : "Bass analysis not available.",
  };
}
