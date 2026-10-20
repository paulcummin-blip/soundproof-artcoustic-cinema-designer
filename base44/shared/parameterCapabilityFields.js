// The authoritative capability fields a frozen parameter row can carry, read
// from the row itself or from its saved source_row. Each field is carried only
// where the evidence states it: an absent field stays absent, and nothing here
// is calculated, inferred or defaulted (in particular, no headroom is derived
// for Parameters 12 or 13).

const FIELD_SOURCES = Object.freeze([
  ['achieved_capability_db', ['achieved_capability_db', 'achievedCapabilityDb']],
  ['selected_target_db', ['selected_target_db', 'requestedTargetDb']],
  ['achieved_level', ['achieved_level_number', 'achievedLevel']],
  ['selected_level', ['selected_level', 'selectedLevel']],
  ['assessment_basis', ['assessment_basis', 'targetBasisLabel', 'targetBasis']],
  ['headroom_or_shortfall_db', ['headroom_or_shortfall_db', 'headroomOrShortfallDb']],
  ['limiting_speaker_group', ['limiting_speaker_group', 'limiting_group', 'limitingGroup']],
]);

function stated(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

/**
 * The capability fields a parameter row states, as an object holding only the
 * fields that are present. Reads the row first, then its source_row.
 */
export function readCapabilityFields(row) {
  if (!row || typeof row !== 'object') return {};
  const sources = [row, row.source_row].filter((item) => item && typeof item === 'object');
  const out = {};
  for (const [field, names] of FIELD_SOURCES) {
    for (const holder of sources) {
      const name = names.find((candidate) => stated(holder[candidate]));
      if (name) { out[field] = holder[name]; break; }
    }
  }
  return out;
}

/** Copies the capability fields of a source row onto a projected entry. */
export function withCapabilityFields(entry, source) {
  return { ...entry, ...readCapabilityFields(source) };
}