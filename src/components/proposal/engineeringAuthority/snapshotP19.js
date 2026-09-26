/**
 * Passive proposal adapter for canonical P19 authority.
 *
 * P19 is RSP-only: max|smoothedRspResponse(f) − T(f)| over the assessment
 * band. There are no per-seat P19 grades, no Primary/Secondary/Project P19
 * floors, and no P19 FAIL seats. The sole P19 authority is the RSP result
 * in parameters.p19.
 */

export function buildSnapshotP19(engineeringSummary) {
  const p19Param = engineeringSummary?.parameterSummaries?.project?.p19 ?? null;
  const rsp = p19Param
    ? {
      level: p19Param.level ?? null,
      raw_value: p19Param.value ?? null,
      display_value: p19Param.valueFormatted ?? null,
      worst_frequency_hz: p19Param.worstFrequencyHz ?? null,
    }
    : null;
  return {
    rsp,
    // Deprecated — P19 is RSP-only. Retained as null for snapshot compatibility.
    primary_floor: null,
    secondary_floor: null,
    project_floor: null,
    per_seat: [],
    coverage_summary: rsp ? "RSP-only" : "NOT CALCULATED",
  };
}