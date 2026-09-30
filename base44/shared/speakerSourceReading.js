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
    if (/half/.test(compact)) return 'half-space';
    if (/free|full|anechoic/.test(compact)) return 'free-space';
    if (/inroom/.test(compact)) return 'in-room';
    if (/unspecified|unknown|notstated|none/.test(compact)) return 'unspecified';
    return '';
  }
  if (field === 'max_spl_basis') {
    if (/^aes/.test(compact)) return 'AES';
    if (/^iec/.test(compact)) return 'IEC';
    if (/unspecified/.test(compact)) return 'manufacturer unspecified';
    if (/^continuous/.test(compact)) return 'continuous';
    if (/^peak/.test(compact)) return 'peak';
    if (/^calculated/.test(compact)) return 'calculated';
    if (/unknown|notstated|none/.test(compact)) return 'unknown';
    return '';
  }
  return '';
}

/**
 * Decode one reported field into the shape the guards expect: the field's own
 * figure for a numeric field ("93dB" → 93, "24kHz" → 24000), a canonical option
 * for an enum, otherwise the text as published. Each caller supplies the field
 * sets it allows, so a secondary read and an official read decode identically.
 */
export function coerceSpecValue(field, value, rawText, { numericFields, enums }) {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (!raw) return '';
  if (enums?.[field]) return matchEnumValue(field, raw, enums);
  if (!numericFields?.has(field)) return raw;

  // Decode this field's own figure: comma decimals are read as published
  // (7,9 → 7.9) and a line such as "303 x 266 x 142 mm" yields 303, not a
  // concatenation of every number in the sentence.
  const context = `${raw} ${rawText || ''}`.toLowerCase();
  const normalised = raw.replace(/(\d),(\d)/g, '$1.$2');
  const firstNumber = normalised.match(/-?\d+(?:\.\d+)?/);
  if (!firstNumber) return '';
  const numeric = Number(firstNumber[0]);
  if (!Number.isFinite(numeric)) return '';
  if (/_hz$/.test(field) && numeric < 1000) {
    // kHz only applies to this field's own figure, never to a neighbour in the
    // same sentence (77 Hz–20 kHz must not turn 77 into 77,000).
    const khz = [...context.matchAll(/(\d+(?:[.,]\d+)?)\s*k\s*hz/gi)]
      .map((match) => Number(match[1].replace(',', '.')));
    if (khz.some((value) => value === numeric)) return Math.round(numeric * 1000);
  }
  return numeric;
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