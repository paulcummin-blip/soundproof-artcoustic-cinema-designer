/**
 * Passive proposal/PDF adapter for the already-published RP23 viewing summary.
 * No grading, grouping, floor calculation, or seat-priority interpretation is
 * permitted here.
 */
export function buildSnapshotViewing(engineeringSummary) {
  const viewing = engineeringSummary?.viewing || null;
  if (!viewing) {
    return {
      available: false,
      per_seat: [],
      primary_floor: null,
      secondary_floor: null,
      project_floor: null,
      summary: 'Viewing angles not calculated.',
    };
  }

  return {
    available: viewing.available === true,
    per_seat: Array.isArray(viewing.per_seat) ? viewing.per_seat : [],
    primary_floor: viewing.primary_floor ?? null,
    secondary_floor: viewing.secondary_floor ?? null,
    project_floor: viewing.project_floor ?? null,
    summary: viewing.summary || 'Viewing angles not calculated.',
  };
}
