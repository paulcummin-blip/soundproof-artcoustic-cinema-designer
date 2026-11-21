// speakerSourceReading.js
// ---------------------------------------------------------------------------
// Reading ONE source document for a reporting pass. Shared by every function
// that reads a page or PDF for speaker specification facts, so an official read
// and an admin-approved secondary read cannot drift apart.
//
// Nothing here decides what is official and nothing here writes: it fetches a
// URL, turns it into readable text, and assembles the extraction rules.
// ---------------------------------------------------------------------------

export function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch a page and return its readable text. A PDF is not fetched here — it is
 * attached to the reporting pass instead, so it comes back as { ok: true, text: '' }.
 */
export async function readSource(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SoundProofSpeakerDatabase/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/pdf',
      },
    });
    if (!response.ok) return { ok: false, note: `The source returned ${response.status}.`, text: '' };
    const body = await response.text();
    const text = htmlToText(body);
    if (text.length < 200) return { ok: false, note: 'The source contained no readable specification text.', text: '' };
    // Specification tables usually sit low on the page, so keep the start and
    // the end rather than truncating the tail away.
    const prepared = text.length <= 60000
      ? text
      : `${text.slice(0, 25000)}\n…\n${text.slice(-35000)}`;
    return { ok: true, note: '', text: prepared };
  } catch (error) {
    return { ok: false, note: `The source could not be read (${error.message}).`, text: '' };
  }
}

/**
 * Canonical enum matching. Manufacturers write the same basis many ways
 * ("2.83V1m", "2.83V/1m", "2.83 V / 1 m", "2.83V @ 1m", "2.83 volts/1m"), so both
 * the published value and the enum option are compacted before comparison. Only
 * spellings of a basis the source actually states are accepted — an unstated
 * basis still comes back blank rather than being assumed.
 */
export function compactEnumValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/π/g, 'pi')
    .replace(/@/g, '/')
    .replace(/per/g, '/')
    .replace(/volts?/g, 'v')
    .replace(/watts?/g, 'w')
    .replace(/,/g, '.');
}

/** Match one reported basis/space against the field's own allowed values. */
export function matchEnumValue(field, raw, enums) {
  const compact = compactEnumValue(raw);
  const exact = (enums?.[field] || []).find((option) => compactEnumValue(option) === compact);
  if (exact) return exact;

  if (field === 'sensitivity_basis') {
    if (/^2\.83v/.test(compact)) return '2.83V/1m';
    if (/^1w/.test(compact)) return '1W/1m';
    if (/unknown|notstated|notspecified|unspecified|none|n\/a/.test(compact)) return 'unknown';
    return '';
  }
  if (field === 'measurement_space') {
    // Half Space is 2π and Full Space is 4π. Manufacturers state the solid
    // angle directly ("2 pi", "2π", "4π") as often as they state the name, so
    // both forms are recognised. A stated 2π must never fall through to the
    // "assumed half space" path — it is a reported half space.
    //
    // "Anechoic" is deliberately NOT mapped to free-space. A datasheet that
    // says "Anechoic Frequency Response" is describing how the
    // frequency-response curve was measured, not the space in which
    // sensitivity or maximum SPL was measured. Only an explicit "Full Space"
    // or "4π" declaration establishes free-space for the SPL/sensitivity
    // measurement.
    if (/2pi/.test(compact)) return 'half-space';
    if (/4pi/.test(compact)) return 'free-space';
    if (/half/.test(compact)) return 'half-space';
    if (/free|full/.test(compact)) return 'free-space';
    if (/inroom/.test(compact)) return 'in-room';
    if (/unspecified|unknown|notstated|none/.test(compact)) return 'unspecified';
    return '';
  }
  if (field === 'max_spl_basis') {
    if (/^aes/.test(compact)) return 'AES';
    if (/^iec/.test(compact)) return 'IEC';
    if (/unspecified/.test(compact)) return 'manufacturer unspecified';
    // "RMS" is a continuous-duration qualifier (manufacturer terminology for
    // the same continuous basis), so it maps to 'continuous'.
    if (/^continuous|^rms/.test(compact)) return 'continuous';
    if (/^peak/.test(compact)) return 'peak';
    if (/^calculated/.test(compact)) return 'calculated';
    if (/unknown|notstated|none/.test(compact)) return 'unknown';
    return '';
  }
  return '';
}

/**
 * Normalise a manufacturer-formatted numeric literal into a Number, correctly
 * handling thousands separators (comma, space, dot) and decimal separators
 * (dot, comma), so "1,000" is 1000, never 1.
 *
 * Heuristics (English speaker-spec domain):
 *  - Both "," and "." present → the LAST separator is the decimal; the other is
 *    thousands. "1,234.56" → 1234.56 ; "1.234,56" → 1234.56.
 *  - Only "," present:
 *      - comma group of exactly 3 digits with ≥1 digit before → thousands:
 *        "1,000"→1000, "10,000"→10000, "1,234,567"→1234567.
 *      - otherwise (1-2 digits after the comma) → decimal: "7,9"→7.9, "93,5"→93.5.
 *  - Only "." present:
 *      - dot group of exactly 3 digits with ≥2 digits before, or multiple dots
 *        → European thousands: "10.000"→10000, "1.234.567"→1234567.
 *      - otherwise → decimal: "2.83"→2.83, "8.0"→8, "1.000"→1 (default decimal;
 *        the plausibility guard rejects an implausible 1 W).
 *  - Space between digit groups → thousands: "1 000"→1000.
 *  - Plain digits → as-is.
 *
 * Returns null when no number can be read.
 */
export function normaliseNumber(literal) {
  if (literal === null || literal === undefined) return null;
  let s = String(literal).trim();
  if (!s) return null;
  // Strip leading currency symbols and spaces.
  s = s.replace(/^[\s£$€]+/, '');
  // Extract the numeric core: digits, comma, dot and space (thousands) only.
  // A line such as "303 x 266 x 142 mm" yields 303, not a concatenation.
  const coreMatch = s.match(/-?\d[\d.,\s]*\d|-?\d/);
  if (!coreMatch) return null;
  let core = coreMatch[0].replace(/\s+/g, '');
  if (!core || !/\d/.test(core)) return null;

  const hasComma = core.includes(',');
  const hasDot = core.includes('.');

  if (hasComma && hasDot) {
    // The LAST separator is the decimal; the other is thousands.
    const lastComma = core.lastIndexOf(',');
    const lastDot = core.lastIndexOf('.');
    if (lastComma > lastDot) {
      core = core.replace(/\./g, '').replace(',', '.');
    } else {
      core = core.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = core.split(',');
    const last = parts[parts.length - 1];
    if (parts.length > 2 || (parts.length === 2 && last.length === 3 && parts[0].length >= 1)) {
      // Thousands separator: "1,000", "10,000", "1,234,567".
      core = parts.join('');
    } else {
      // Decimal separator: "7,9", "93,5".
      core = parts.join('.');
    }
  } else if (hasDot) {
    const parts = core.split('.');
    const last = parts[parts.length - 1];
    if (parts.length > 2 || (parts.length === 2 && last.length === 3 && parts[0].length >= 2)) {
      // European thousands: "10.000", "1.234.567".
      core = parts.join('');
    }
    // otherwise keep the dot as a decimal: "2.83", "8.0".
  }

  const numeric = Number(core);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

/** Extract every numeric token from a text using normaliseNumber. */
export function extractAllNumbers(text) {
  if (!text) return [];
  // The negative lookbehind (?<!\d) prevents a hyphen between two digits
  // ("110-450") from being treated as a minus sign — a range-separator dash
  // is never a negative-sign, so "110-450" yields [110, 450], not [110, -450].
  const tokens = String(text).match(/(?<!\d)-?\d[\d.,\s]*\d|(?<!\d)-?\d/g) || [];
  const out = [];
  for (const token of tokens) {
    const n = normaliseNumber(token);
    if (n !== null) out.push(n);
  }
  return out;
}

/**
 * Parse a manufacturer range literal ("500W – 1,000W", "500-1000 W",
 * "500 to 1000 watts") into { min, max }, or null when it is not a range.
 * A leading minus sign is never read as a separator.
 */
export function parseRangeEndpoints(literal) {
  const s = String(literal ?? '').trim();
  if (!s) return null;
  // Normalise en/em dashes to a hyphen.
  const norm = s.replace(/[–—]/g, '-');

  // Verbal "minimum / maximum" form: "5 watts minimum; 70 watts maximum" or
  // "5W min, 70W max". The number precedes each keyword. Semicolons, commas
  // and newlines between the two halves are tolerated.
  const minMaxMatch = norm.match(/(-?\d[\d.,\s]*\d|-?\d)[\s\S]{0,40}?\b(?:minimum|min)\b[\s\S]{0,80}?(-?\d[\d.,\s]*\d|-?\d)[\s\S]{0,40}?\b(?:maximum|max)\b/i);
  if (minMaxMatch) {
    const lo = normaliseNumber(minMaxMatch[1]);
    const hi = normaliseNumber(minMaxMatch[2]);
    if (lo !== null && hi !== null) return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }

  // Capture the NUMBER immediately before and after the separator, not the
  // whole prefix — an unrelated figure earlier in the sentence (e.g. "8Ω" in
  // "...into 8Ω ... 500W – 1,000W") must not become the range minimum. Unit
  // letters / spaces between a number and the separator are tolerated.
  const dashMatch = norm.match(/(-?\d[\d.,\s]*\d|-?\d)[^\d-]*\s*-\s*[^\d]*(-?\d[\d.,\s]*\d|-?\d)/);
  if (dashMatch) {
    const lo = normaliseNumber(dashMatch[1]);
    const hi = normaliseNumber(dashMatch[2]);
    if (lo !== null && hi !== null) return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }
  const toMatch = s.match(/(-?\d[\d.,\s]*\d|-?\d)[^\d]*\s+to\s+[^\d]*(-?\d[\d.,\s]*\d|-?\d)/i);
  if (toMatch) {
    const lo = normaliseNumber(toMatch[1]);
    const hi = normaliseNumber(toMatch[2]);
    if (lo !== null && hi !== null) return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }
  return null;
}

// Plausibility floors for extraction validation only. This is NOT an acoustic
// engine rule — it is a backstop so a mis-parsed thousands figure (e.g. "1,000"
// read as 1 W) is never saved. Only power fields carry a floor, per the
// request: cinema speakers in this library do not publish < 5 W.
const PLAUSIBILITY_FLOOR_W = 5;
const PLAUSIBILITY_FLOORS = {
  recommended_amp_min_w: PLAUSIBILITY_FLOOR_W,
  recommended_amp_max_w: PLAUSIBILITY_FLOOR_W,
  long_term_iec_power_w: PLAUSIBILITY_FLOOR_W,
  rated_iec_power_w: PLAUSIBILITY_FLOOR_W,
  aes_power_w: PLAUSIBILITY_FLOOR_W,
  peak_power_w: PLAUSIBILITY_FLOOR_W,
  power_handling_continuous_w: PLAUSIBILITY_FLOOR_W,
  power_handling_peak_w: PLAUSIBILITY_FLOOR_W,
};

/**
 * Extraction-validation guard: reject a parsed value that is below its field's
 * plausibility floor, and confirm the value can be reconstructed from its
 * quoted evidence. When the parsed value fails, recover the plausible figure
 * from the quotation; when none exists, return null so the field stays blank
 * rather than saving an obviously wrong number. Never invoked for fields
 * without a floor (frequencies, SPL, etc. use the corrected parser directly).
 */
function isPowerField(field) {
  return /_w$/.test(field) || /power/i.test(field);
}

function isSplField(field) {
  return /spl/i.test(field) || /_db$/.test(field);
}

/**
 * Numbers that appear in the quote adjacent to a watt unit (W, watts), so a
 * standard-identifier number like the 426 in "CTA 426-B" is never mistaken for
 * a wattage. Range endpoints before the unit are included ("110-450 W" → 110,
 * 450), but a number that only appears inside a standard identifier is not.
 */
function extractWattageNumbers(text) {
  if (!text) return [];
  const s = String(text).replace(/[–—]/g, '-');
  const matches = [...s.matchAll(/(\d[\d.,\s]*\d|\d)\s*(?:-\s*(\d[\d.,\s]*\d|\d))?\s*(?:W|watts?|watt)\b/gi)];
  const out = [];
  for (const m of matches) {
    const n1 = normaliseNumber(m[1]);
    if (n1 !== null) out.push(n1);
    if (m[2]) {
      const n2 = normaliseNumber(m[2]);
      if (n2 !== null) out.push(n2);
    }
  }
  return out;
}

/**
 * Numbers that appear in the quote adjacent to a decibel unit (dB), so a
 * standard-identifier number like the 75 in "AES75" is never mistaken for an
 * SPL figure. Range endpoints before the unit are included.
 */
function extractDecibelNumbers(text) {
  if (!text) return [];
  const s = String(text).replace(/[–—]/g, '-');
  const matches = [...s.matchAll(/(\d[\d.,\s]*\d|\d)\s*(?:-\s*(\d[\d.,\s]*\d|\d))?\s*(?:dB|db)\b/gi)];
  const out = [];
  for (const m of matches) {
    const n1 = normaliseNumber(m[1]);
    if (n1 !== null) out.push(n1);
    if (m[2]) {
      const n2 = normaliseNumber(m[2]);
      if (n2 !== null) out.push(n2);
    }
  }
  return out;
}

/**
 * Numbers that appear inside a specification standard identifier such as
 * "CTA 426-B", "AES75", "IEC 60268-5" or "EN 60268-5". These are the names of
 * measurement standards, never engineering values, so they must never be
 * accepted as a wattage or SPL figure.
 */
function extractStandardIdentifierNumbers(text) {
  if (!text) return [];
  const s = String(text).replace(/[–—]/g, '-');
  const matches = [...s.matchAll(/\b(?:CTA|AES|IEC|EN|ANSI|EIA|CEA|DIN|JIS|ISO|IEEE)[\s-]*\d+(?:-\w+)?/gi)];
  const out = [];
  for (const m of matches) {
    const nums = [...m[0].matchAll(/\d+/g)].map((x) => Number(x[0]));
    out.push(...nums);
  }
  return out;
}

/**
 * Extraction-validation guard: reject a parsed value that is below its field's
 * plausibility floor, and confirm the value can be reconstructed from its
 * quoted evidence. A standard-identifier number (the 426 in "CTA 426-B", the
 * 75 in "AES75") is never accepted as a power or SPL value — the actual
 * engineering figure is recovered from the quote, and when none exists the
 * field stays blank for manual review.
 */
function applyNumericGuard(field, numeric, rawText) {
  if (!Number.isFinite(numeric)) return null;

  // Standard-identifier guard (power and SPL fields): never accept a number
  // that only appears in the quote as part of a standard identifier such as
  // CTA 426-B, AES75 or IEC 60268-5. Recover the actual engineering value from
  // the quote; when none exists, reject so the field stays blank for review.
  if (isPowerField(field) || isSplField(field)) {
    const standardNums = extractStandardIdentifierNumbers(rawText);
    if (standardNums.length > 0) {
      const unitNums = isPowerField(field)
        ? extractWattageNumbers(rawText)
        : extractDecibelNumbers(rawText);
      const closeStd = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(a) * 0.001);
      const isStandardOnly = standardNums.some((n) => closeStd(n, numeric))
        && !unitNums.some((n) => closeStd(n, numeric));
      if (isStandardOnly) {
        const floor = PLAUSIBILITY_FLOORS[field];
        const plausible = floor !== undefined
          ? unitNums.filter((n) => n >= floor)
          : unitNums.filter((n) => n > 0);
        if (plausible.length > 0) return Math.max(...plausible);
        return null;
      }
    }
  }

  const floor = PLAUSIBILITY_FLOORS[field];
  if (floor === undefined) return numeric;
  const quoteNums = extractAllNumbers(rawText);
  const close = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(a) * 0.001);
  if (numeric >= floor) {
    if (quoteNums.length > 0 && !quoteNums.some((n) => close(n, numeric))) {
      // Parsed value is not reconstructable from the quote — the comma bug.
      const plausible = quoteNums.filter((n) => n >= floor);
      if (plausible.length > 0) return Math.max(...plausible);
      return null;
    }
    return numeric;
  }
  // Below floor: recover from the quote, else reject.
  const plausible = quoteNums.filter((n) => n >= floor);
  if (plausible.length > 0) return Math.max(...plausible);
  return null;
}

/**
 * Decode one reported field into the shape the guards expect: the field's own
 * figure for a numeric field ("93dB" → 93, "1,000W" → 1000, "24kHz" → 24000),
 * a canonical option for an enum, otherwise the text as published. Each caller
 * supplies the field sets it allows, so a secondary read and an official read
 * decode identically. Recommended-amplifier ranges are split into their min and
 * max endpoints so both are preserved.
 */
export function coerceSpecValue(field, value, rawText, { numericFields, enums }) {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (!raw) return '';
  if (enums?.[field]) return matchEnumValue(field, raw, enums);
  if (!numericFields?.has(field)) return raw;

  const isMinField = /_min_w$/.test(field);
  const isMaxField = /_max_w$/.test(field);
  // power_handling_continuous_w holds the manufacturer's stated maximum power
  // handling. When the source expresses it as a range ("5 W minimum; 70 W
  // maximum"), the MAXIMUM endpoint is the continuous figure; the minimum is
  // advisory and preserved only in the raw_text evidence.
  const isContinuousPower = field === 'power_handling_continuous_w';
  // A stated range is split into its endpoints: the min field takes the low end,
  // the max field (and continuous power handling) takes the high end.
  const range = parseRangeEndpoints(raw) || parseRangeEndpoints(rawText);
  if (range) {
    if (isMinField) {
      const guarded = applyNumericGuard(field, range.min, rawText);
      if (guarded !== null) return guarded;
    }
    if (isMaxField || isContinuousPower) {
      const guarded = applyNumericGuard(field, range.max, rawText);
      if (guarded !== null) return guarded;
    }
  }

  const numeric = normaliseNumber(raw);
  if (numeric === null) return '';

  // kHz applies only to THIS field's own figure, never to a neighbour in the
  // same sentence (the low end "20 Hz" must not become 20000 because "20 kHz"
  // appears elsewhere in a "20 Hz – 20 kHz" range). Check the field's own value
  // text first, then the raw_text evidence for a kHz unit adjacent to this
  // exact figure — the LLM often strips the unit from the value field, returning
  // just "24" while the raw_text says "24 kHz".
  //
  // The rawText fallback is restricted to the HIGH endpoint only: low
  // frequencies are always in Hz, so a low-end value matching a kHz figure in
  // the raw text is cross-contamination from the high end of the same range
  // (e.g. "20Hz – 20kHz" must not convert the 20 Hz low end to 20000).
  if (/_hz$/.test(field) && numeric < 1000) {
    const own = raw.toLowerCase();
    const khz = [...own.matchAll(/(\d+(?:[.,]\d+)?)\s*k\s*hz/gi)]
      .map((match) => Number(match[1].replace(',', '.')));
    if (khz.some((v) => v === numeric)) return Math.round(numeric * 1000);
    // Fallback for the high endpoint only: scan the raw_text evidence for
    // this figure immediately before "kHz".
    if (field === 'frequency_response_high_hz') {
      const quote = String(rawText || '').toLowerCase();
      const adjacent = new RegExp(`\\b${numeric.toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*k\\s*hz`, 'i');
      if (adjacent.test(quote)) return Math.round(numeric * 1000);
    }
  }

  const guarded = applyNumericGuard(field, numeric, rawText);
  return guarded === null ? '' : guarded;
}
export function buildExtractionRules({ manufacturerName, model, rules, contextLines = [] }) {
  return [
    `You are extracting loudspeaker specification facts for ONE exact model.`,
    ``,
    `Manufacturer: ${manufacturerName}`,
    `Exact model: "${model}"`,
    ``,
    ...contextLines,
    ...(contextLines.length > 0 ? [``] : []),
    `Hard rules:`,
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    ``,
    `Return JSON only.`,
  ].join('\n');
}