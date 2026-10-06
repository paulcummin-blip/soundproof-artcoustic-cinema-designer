// speakerSpecGuards.js
// ---------------------------------------------------------------------------
// Deterministic guards for a specification read from an official source.
//
// A reporting pass is allowed to read a document, but it must not be trusted to
// keep its columns straight: one figure can land in several unrelated fields
// (400 W becoming "max SPL 400 dB"). Nothing here estimates a value. Every guard
// either keeps a value the source states, or discards it and RECORDS the discard
// so the admin sees exactly what was rejected and why.
//
// Guards:
//   1. per-field plausibility ranges (an angle is never a power rating)
//   2. cross-dimension collapse — one figure occupying fields from unrelated
//      dimensions is one figure, not a specification
//   3. repeated power ratings — the same wattage in three or more power fields
//   4. ordering — a frequency band must be ordered, an amplifier range must
//      ascend, peak SPL cannot be below continuous SPL
// ---------------------------------------------------------------------------

export const SENSITIVITY_BASES = ['1W/1m', '2.83V/1m', 'unknown'];
export const SPACES = ['half-space', 'free-space', 'in-room', 'unspecified'];
export const SPL_BASES = ['AES', 'IEC', 'continuous', 'peak', 'manufacturer unspecified', 'calculated', 'unknown'];

// Every field the guards accept. source_date is the source document's own date.
export const SPEC_FIELDS = [
  'sensitivity_db', 'sensitivity_basis', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w', 'power_handling_continuous_w',
  'long_term_iec_power_w', 'rated_iec_power_w', 'aes_power_w',
  'max_continuous_spl_db', 'max_spl_basis', 'max_peak_spl_db',
  'frequency_response_low_hz', 'frequency_response_high_hz', 'frequency_response_tolerance',
  'measurement_space', 'cabinet_type', 'mounting_type',
  'horizontal_dispersion_deg', 'vertical_dispersion_deg',
  'woofer_count', 'woofer_size', 'midrange_count', 'midrange_size', 'tweeter_description',
  'source_date',
];

export const NUMERIC_SPEC_FIELDS = new Set([
  'sensitivity_db', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w', 'power_handling_continuous_w',
  'long_term_iec_power_w', 'rated_iec_power_w', 'aes_power_w',
  'max_continuous_spl_db', 'max_peak_spl_db',
  'frequency_response_low_hz', 'frequency_response_high_hz',
  'horizontal_dispersion_deg', 'vertical_dispersion_deg',
  'woofer_count', 'midrange_count',
]);

const ENUM_SPEC_FIELDS = {
  sensitivity_basis: SENSITIVITY_BASES,
  measurement_space: SPACES,
  max_spl_basis: SPL_BASES,
};

const FIELD_LIMITS = {
  sensitivity_db: [70, 110],
  nominal_impedance_ohm: [1, 32],
  minimum_impedance_ohm: [1, 32],
  recommended_amp_min_w: [5, 5000],
  recommended_amp_max_w: [5, 5000],
  power_handling_continuous_w: [5, 5000],
  long_term_iec_power_w: [5, 5000],
  rated_iec_power_w: [5, 5000],
  aes_power_w: [5, 5000],
  max_continuous_spl_db: [80, 150],
  max_peak_spl_db: [80, 160],
  frequency_response_low_hz: [10, 500],
  frequency_response_high_hz: [1000, 60000],
  horizontal_dispersion_deg: [5, 180],
  vertical_dispersion_deg: [5, 180],
  woofer_count: [1, 12],
  midrange_count: [1, 12],
};

// Which physical quantity each field belongs to, and which field wins when one
// figure has been copied across dimensions.
const DIMENSIONS = {
  sensitivity_db: 'sensitivity',
  nominal_impedance_ohm: 'impedance',
  minimum_impedance_ohm: 'impedance',
  recommended_amp_min_w: 'power',
  recommended_amp_max_w: 'power',
  power_handling_continuous_w: 'power',
  long_term_iec_power_w: 'power',
  rated_iec_power_w: 'power',
  aes_power_w: 'power',
  max_continuous_spl_db: 'spl',
  max_peak_spl_db: 'spl',
  frequency_response_low_hz: 'frequency',
  frequency_response_high_hz: 'frequency',
  horizontal_dispersion_deg: 'dispersion',
  vertical_dispersion_deg: 'dispersion',
  woofer_count: 'count',
  midrange_count: 'count',
};

// An angle can only be an angle; a dB figure can only be a sensitivity or an
// SPL; watts are the least specific (any number from 5 to 5000), so power is
// discarded last.
const DIMENSION_PRIORITY = ['dispersion', 'sensitivity', 'impedance', 'spl', 'frequency', 'count', 'power'];

const POWER_FIELDS = [
  'power_handling_continuous_w',
  'long_term_iec_power_w',
  'rated_iec_power_w',
  'aes_power_w',
];

// Free-text values a reporting pass sometimes emits in place of a stated figure.
const STRING_NOISE = new Set([
  'null', 'undefined', 'n/a', 'na', 'none', '-', '—', 'unspecified',
  'not specified', 'not stated', 'unknown', 'tbd',
]);

export function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A source date, normalised to YYYY-MM-DD; anything unparsable is dropped. */
function normaliseSourceDate(value) {
  const raw = text(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  if (year < 1990 || year > new Date().getFullYear() + 1) return '';
  return parsed.toISOString().split('T')[0];
}

/** One figure occupying fields from unrelated dimensions is one figure. */
function applyCollapseGuard(spec, discarded) {
  const byValue = new Map();
  for (const [field, value] of Object.entries(spec)) {
    if (typeof value !== 'number' || !DIMENSIONS[field]) continue;
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(field);
  }

  for (const [value, fields] of byValue) {
    if (fields.length < 2) continue;
    const dimensions = new Set(fields.map((field) => DIMENSIONS[field]));
    if (dimensions.size < 2) continue;

    const hasDispersion = fields.some((field) => DIMENSIONS[field] === 'dispersion');
    const looksLikeAngle = value <= 180 && Number.isInteger(value);
    // Three or more fields sharing a number is a collapsed column. Two fields only
    // count when an angle has been copied into another dimension ("60° is not 60 W").
    const collapsed = fields.length >= 3 || (hasDispersion && looksLikeAngle);
    if (!collapsed) continue;

    const keep = [...fields].sort(
      (a, b) => DIMENSION_PRIORITY.indexOf(DIMENSIONS[a]) - DIMENSION_PRIORITY.indexOf(DIMENSIONS[b]),
    )[0];
    for (const field of fields) {
      if (field === keep) continue;
      discarded.push(`${field} (${value} repeated from ${keep})`);
      delete spec[field];
    }
  }
}

/**
 * The published band, recovered from a stated range the reporter left in the
 * tolerance field ("-6dB at 34Hz and 40kHz"). The numbers come from the source;
 * only their placement is corrected, so the band is never invented.
 */
function deriveFrequencyBand(spec) {
  if (spec.frequency_response_low_hz !== undefined || spec.frequency_response_high_hz !== undefined) return;
  const raw = text(spec.frequency_response_tolerance);
  if (!raw || !/hz/i.test(raw)) return;

  const values = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*(k)?\s*hz/gi)]
    .map((match) => Number(match[1]) * (match[2] ? 1000 : 1))
    .filter((value) => Number.isFinite(value));
  if (values.length < 2) return;

  const low = Math.min(...values);
  const high = Math.max(...values);
  const [lowMin, lowMax] = FIELD_LIMITS.frequency_response_low_hz;
  const [highMin, highMax] = FIELD_LIMITS.frequency_response_high_hz;
  if (low < lowMin || low > lowMax || high < highMin || high > highMax) return;

  const tolerance = raw.match(/(?:±|\+|-)?\s*\d+(?:\.\d+)?\s*dB/i);
  spec.frequency_response_low_hz = low;
  spec.frequency_response_high_hz = high;
  if (tolerance) spec.frequency_response_tolerance = tolerance[0].replace(/\s+/g, '');
  else delete spec.frequency_response_tolerance;
}

function applyOrderingGuards(spec, discarded) {
  // A published frequency band must be ordered.
  if (spec.frequency_response_low_hz !== undefined && spec.frequency_response_high_hz !== undefined
    && spec.frequency_response_low_hz >= spec.frequency_response_high_hz) {
    discarded.push('frequency_response_low_hz / frequency_response_high_hz (band not ordered)');
    delete spec.frequency_response_low_hz;
    delete spec.frequency_response_high_hz;
  }

  // A recommended amplifier range ascends.
  if (spec.recommended_amp_min_w !== undefined && spec.recommended_amp_max_w !== undefined
    && spec.recommended_amp_min_w >= spec.recommended_amp_max_w) {
    discarded.push(`recommended_amp_min_w (${spec.recommended_amp_min_w}, not below the maximum)`);
    delete spec.recommended_amp_min_w;
  }

  // Peak SPL cannot be below continuous SPL.
  if (spec.max_peak_spl_db !== undefined && spec.max_continuous_spl_db !== undefined
    && spec.max_peak_spl_db < spec.max_continuous_spl_db) {
    discarded.push(`max_peak_spl_db (${spec.max_peak_spl_db}, below continuous SPL)`);
    delete spec.max_peak_spl_db;
  }

  // One wattage repeated across three or more power fields is one rating, not three.
  const presentPower = POWER_FIELDS.filter((field) => spec[field] !== undefined);
  if (presentPower.length >= 3 && new Set(presentPower.map((field) => spec[field])).size === 1) {
    for (const field of presentPower.slice(1)) {
      discarded.push(`${field} (${spec[field]} W repeated)`);
      delete spec[field];
    }
  }
}

/**
 * Guard one specification read from an official source.
 * @returns {{ spec: object, discarded: string[] }} the values that survive, and
 *   every value that was rejected (reported to the admin, never silently lost).
 */
export function normaliseSpecification(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const spec = {};
  const discarded = [];

  for (const field of SPEC_FIELDS) {
    const value = source[field];
    if (value === null || value === undefined || String(value).trim() === '') continue;

    if (NUMERIC_SPEC_FIELDS.has(field)) {
      const parsed = numberOrNull(value);
      if (parsed === null || parsed === 0) continue;
      const limits = FIELD_LIMITS[field];
      if (limits && (parsed < limits[0] || parsed > limits[1])) {
        discarded.push(`${field} (${parsed})`);
        continue;
      }
      spec[field] = parsed;
      continue;
    }

    if (ENUM_SPEC_FIELDS[field]) {
      const match = ENUM_SPEC_FIELDS[field].find(
        (option) => option.toLowerCase() === String(value).trim().toLowerCase(),
      );
      spec[field] = match || ENUM_SPEC_FIELDS[field][ENUM_SPEC_FIELDS[field].length - 1];
      continue;
    }

    if (field === 'source_date') {
      const date = normaliseSourceDate(value);
      if (date) spec[field] = date;
      continue;
    }

    const cleaned = text(value);
    if (STRING_NOISE.has(cleaned.toLowerCase())) continue;
    spec[field] = cleaned;
  }

  deriveFrequencyBand(spec);
  applyCollapseGuard(spec, discarded);
  applyOrderingGuards(spec, discarded);
  applyOrderingGuards(spec, discarded);

  return { spec, discarded };
}

/** JSON schema for the specification object returned by a reporting pass. */
export function buildSpecificationSchema() {
  const properties = {};
  for (const field of SPEC_FIELDS) {
    if (ENUM_SPEC_FIELDS[field]) properties[field] = { type: 'string', enum: ENUM_SPEC_FIELDS[field] };
    else if (NUMERIC_SPEC_FIELDS.has(field)) properties[field] = { type: 'number' };
    else properties[field] = { type: 'string' };
  }
  return properties;
}