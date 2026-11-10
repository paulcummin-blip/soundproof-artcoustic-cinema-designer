// extractModelSpecification
// ---------------------------------------------------------------------------
// Extracts specification facts for ONE exact model from ONE official source the
// admin has already chosen.
//
// Discipline enforced here:
//   - the official page is read directly; the model is given that text verbatim
//     and is not allowed to substitute general knowledge
//   - only known SpeakerSpecification field names are ever returned
//   - a value is returned only when the source states it (status "reported") or
//     states it ambiguously (status "ambiguous" — the admin must review)
//   - "not_found" fields come back blank: the database stays blank rather than
//     being filled with an inference
//   - no catalogue crawling, no sibling models, no dealer pages
// ---------------------------------------------------------------------------

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildExtractionRules, coerceSpecValue, readSource } from '../../shared/speakerSourceReading.js';

// P12/P13 parity fields only. The job is NOT to catalogue the speaker — it is to
// find the manufacturer-published evidence required to calculate this speaker's
// P12/P13 SPL capability on the same basis used for Artcoustic. Driver
// descriptions, crossover, dimensions, weight, dispersion, finishes,
// construction and certification are intentionally NOT extracted: they are not
// part of the P12/P13 comparison dataset.
const ALLOWED_FIELDS = [
  'sensitivity_db', 'sensitivity_basis', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w', 'long_term_iec_power_w', 'rated_iec_power_w',
  'aes_power_w', 'peak_power_w', 'power_handling_continuous_w', 'power_handling_peak_w',
  'frequency_response_low_hz', 'frequency_response_high_hz', 'frequency_response_tolerance',
  'frequency_response_tolerance_db', 'max_continuous_spl_db', 'max_peak_spl_db', 'max_spl_basis',
  'measurement_space',
];

// Only these fields are numbers. Everything else is copied verbatim as text,
// so a driver description like 3 x 1" is never turned into a number.
const NUMERIC_FIELDS = new Set([
  'sensitivity_db', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w', 'long_term_iec_power_w', 'rated_iec_power_w',
  'aes_power_w', 'peak_power_w', 'power_handling_continuous_w', 'power_handling_peak_w',
  'frequency_response_low_hz', 'frequency_response_high_hz', 'frequency_response_tolerance_db',
  'max_continuous_spl_db', 'max_peak_spl_db',
]);

const ENUMS = {
  sensitivity_basis: ['1W/1m', '2.83V/1m', 'unknown'],
  max_spl_basis: ['AES', 'IEC', 'continuous', 'peak', 'manufacturer unspecified', 'calculated', 'unknown'],
  measurement_space: ['free-space', 'half-space', 'in-room', 'unspecified'],
};

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    model_confirmed: { type: 'boolean' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          value: { type: 'string' },
          status: { type: 'string' },
          raw_text: { type: 'string' },
        },
      },
    },
    potential_unmapped: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          concept: { type: 'string' },
          raw_text: { type: 'string' },
        },
      },
    },
  },
};

// Reading one source (page text or PDF attachment) and the extraction rules
// everyone shares live in ../../shared/speakerSourceReading.js, so an official
// read and an admin-approved secondary read cannot drift apart.

// Canonical enum matching. Manufacturers write the same basis many ways
// ("2.83V1m", "2.83V/1m", "2.83 V / 1 m", "2.83V @ 1m", "2.83 volts/1m"), so both
// the published value and the enum option are compacted before comparison. Only
// spellings of a basis the source actually states are accepted — an unstated
// basis still comes back blank rather than being assumed.
// Value decoding (canonical enum matching and per-field number decoding) lives in
// ../../shared/speakerSourceReading.js, so every reading pass decodes identically.

function rulesFor(manufacturerName, model) {
  return buildExtractionRules({
    manufacturerName,
    model,
    rules: [
      `P12/P13 FIELD CHECKLIST. Search the source explicitly for each of these concepts and their common aliases. Do not rely on a single pass noticing whichever fields happen to be prominent — look for every concept listed, then return what you found:
  1. SENSITIVITY — aliases: "Sensitivity", "Efficiency", "SPL @ 1W/1m", "SPL @ 2.83V/1m", "dB / 1W / 1m", "dB / 2.83V / 1m"
  2. IMPEDANCE — aliases: "Nominal impedance", "Impedance", "Minimum impedance"
  3. POWER HANDLING — aliases: "Power Handling", "Continuous Power", "RMS Power", "AES Power", "IEC Power", "Long Term Power", "Rated Power", "Recommended Amplifier Power", "Amplifier Power"
  4. SPL — aliases: "Continuous SPL", "RMS SPL", "Maximum SPL", "Max SPL", "Peak SPL", "Peak Output"
  5. MEASUREMENT BASIS — aliases: "Half Space", "Full Space", "2π / 2pi", "4π / 4pi", "1 metre / 1 meter", measurement or test standard
Process the COMPLETE specification table before returning. Do not stop after the first few matched values — read every row of a spec table.`,
      `Report a value only if the source explicitly states it for "${model}".`,
      `Mark a field "ambiguous" only when the source genuinely leaves it unclear for this model — for example the figure is given for a range of models, or the sentence is contradictory. When the source states the value plainly for this model, mark it "reported".`,
      `If the source does not state the field, return status "not_found" with an EMPTY value. Never infer, never estimate, never borrow a value from a sibling model, another series, a predecessor, or your own general knowledge.`,
      `Never convert or normalise. Copy the published figure as stated, e.g. "92 dB", "4 Ω", "200 W". Text fields such as tweeter_description must be copied word for word from the source.`,
      `Answer sensitivity_basis, max_spl_basis and measurement_space only when the source states the basis/space; otherwise "unknown" or "unspecified" respectively. When the source states the sensitivity reference — "2.83V1m", "2.83 V / 1 m", "2.83V @ 1m", "1W/1m" — answer sensitivity_basis with the recognised equivalent "2.83V/1m" or "1W/1m".`,
      `Use only these exact field names: ${ALLOWED_FIELDS.join(', ')}.`,
      `Give the exact sentence or table cell the value came from in raw_text — this is the manufacturer's label and it is kept as evidence.`,
      `model_confirmed must be true only if the source names this exact model.`,
      `Look specifically for a technical specifications table, spec sheet, or "Specifications" section — that is where sensitivity, impedance, power handling and max SPL normally appear.`,
      `POWER CLASSIFICATION IS CRITICAL. Distinguish the manufacturer's power terminology literally and never convert one category into another merely because a value is in watts. Use the field that matches what the source actually says:`,
      `  - power_handling_continuous_w = the manufacturer's stated power handling figure. This includes "Power Handling: X Watts minimum; Y Watts maximum" — report the MAXIMUM (Y) here with status "reported". The minimum (X) is advisory; include the full range in raw_text. Also includes "Continuous Power", "RMS Power Handling", "Long-term Power Handling" — all reported, status "reported".`,
      `  - long_term_iec_power_w / rated_iec_power_w = an IEC long-term or rated continuous figure labelled "IEC".`,
      `  - aes_power_w = an AES continuous figure labelled "AES".`,
      `  - recommended_amp_min_w and recommended_amp_max_w = the MINIMUM and MAXIMUM of a stated RECOMMENDED AMPLIFIER RANGE — e.g. "Recommended amplifier: 25-150 W" → recommended_amp_min_w 25, recommended_amp_max_w 150. When only one amplifier figure is stated, use it for recommended_amp_max_w and leave recommended_amp_min_w blank. Preserve BOTH endpoints of the range, copied exactly as stated (e.g. "500W – 1,000W" → recommended_amp_min_w 500, recommended_amp_max_w 1000).`,
      `  - peak_power_w / power_handling_peak_w = a peak / short-term / maximum figure explicitly labelled "peak".`,
      `POWER HANDLING IS NEVER RECOMMENDED AMPLIFIER. A line labelled "Power Handling" is the speaker's own power rating — never a recommended amplifier range, even when it states a minimum and maximum. Only "Recommended amplifier" or "Amplifier power" wording maps to recommended_amp_min_w / recommended_amp_max_w. "Power Handling: 5 Watts minimum; 150 Watts maximum" → power_handling_continuous_w = 150, status "reported", raw_text preserves the full range. "Power Handling (RMS): 5 watts minimum; 150 watts maximum" → same: power_handling_continuous_w = 150, status "reported". A "Recommended amplifier power" range is recommended_amp_max_w, never a continuous rating.`,
      `For max SPL, distinguish the basis the manufacturer states. "Max SPL" or "Peak SPL" is NOT "continuous" — when the source labels a figure peak or maximum short-term, record max_peak_spl_db and set max_spl_basis to "peak". Only use max_continuous_spl_db when the source genuinely establishes a continuous/rated basis.`,
      `SPL CONTINUOUS vs PEAK MUST BE SPLIT. Manufacturers often state one combined figure such as "123 dB (Cont.) / 135 dB (Peak)", "Max SPL: 123 dB continuous / 135 dB peak" or "Measured Data 123 dB (Cont.) / 135 dB (Peak)". When the source states BOTH a continuous and a peak SPL, record BOTH fields: max_continuous_spl_db = the continuous figure (123) and max_peak_spl_db = the peak figure (135), and set max_spl_basis to "continuous" (the continuous figure is the graded capability). Never collapse the two into one field, and never drop the continuous figure because a peak figure also appears.`,
      `Recognise continuous qualifiers: "Cont.", "Continuous", "RMS", "long-term", "rated". Recognise peak qualifiers: "Peak", "Max SPL", "Maximum SPL", "short-term". A figure labelled only "Max SPL" or "Maximum SPL" with NO continuous qualifier is NOT continuous — record it in max_peak_spl_db and set max_spl_basis to "peak". Only a figure explicitly labelled continuous / Cont. / RMS / long-term / rated / AES / IEC enters max_continuous_spl_db. "Measured Data" before an SPL figure means the manufacturer measured it — record it in max_continuous_spl_db when a continuous qualifier is present, otherwise in max_peak_spl_db.`,
      `MEASUREMENT SPACE. "Half Space", "2π", "2 pi" mean half-space → measurement_space "half-space". "Full Space", "4π", "4 pi", "anechoic" mean free-space → measurement_space "free-space". When the source states the space (for sensitivity or for max SPL), answer measurement_space with the recognised value. Never leave it "unspecified" when the source explicitly states 2π / 4π / half space / full space.`,
      `POWER HANDLING AMBIGUITY. "Power Handling: N W" (a SINGLE value with no min/max range and no continuous/RMS/IEC/AES/peak qualifier and no "recommended amplifier" wording) is genuinely ambiguous: the manufacturer stated a figure but not the standard. Report it as power_handling_continuous_w with status "ambiguous". Do NOT report it as recommended_amp_max_w. Do NOT invent a continuous basis. NOTE: "Power Handling: X Watts minimum; Y Watts maximum" is NOT ambiguous — the manufacturer stated the power handling limits plainly. Report the maximum (Y) as power_handling_continuous_w with status "reported". Only a bare single-figure "Power Handling: N W" with no range and no qualifier is "ambiguous". When the source ALSO states a continuous/RMS/IEC/AES figure or a recommended amplifier range, report those in their own fields with status "reported".`,
      `UNMAPPED CONCEPTS. If you notice a P12/P13-relevant specification concept from the checklist above in the source that you cannot map to any allowed field — for example a "Power Handling" row you are unsure how to classify, or a sensitivity figure with an unfamiliar basis — add it to the potential_unmapped array with the concept name and the exact raw text. This flags it for human review rather than silently dropping it. An empty potential_unmapped array is correct when every concept you found was mapped.`,
    ],
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const manufacturerName = String(body?.manufacturerName || '').trim();
    const model = String(body?.model || '').trim();
    const sourceUrl = String(body?.sourceUrl || '').trim();
    const sourceType = String(body?.sourceType || 'Official Product Page').trim();

    if (!manufacturerName || !model || !sourceUrl) {
      return Response.json({ error: 'Manufacturer, model and source URL are required' }, { status: 400 });
    }

    const isPdf = /\.pdf(\?|#|$)/i.test(sourceUrl);
    const read = isPdf ? { ok: true, note: '', text: '' } : await readSource(sourceUrl);

    let raw = null;
    if (read.ok && read.text) {
      // The page text is supplied verbatim: no web search, no general knowledge.
      raw = await base44.integrations.Core.InvokeLLM({
        prompt: [
          rulesFor(manufacturerName, model),
          ``,
          `SOURCE: ${sourceType} at ${sourceUrl}`,
          `SOURCE TEXT (verbatim, read from that page — this is your only evidence):`,
          `"""`,
          read.text,
          `"""`,
        ].join('\n'),
        response_json_schema: EXTRACTION_SCHEMA,
      });
    } else if (isPdf) {
      // An official PDF is read as an attached document.
      raw = await base44.integrations.Core.InvokeLLM({
        prompt: [
          rulesFor(manufacturerName, model),
          ``,
          `SOURCE: ${sourceType} (official PDF) at ${sourceUrl}`,
          `Read the attached PDF and extract only from it.`,
        ].join('\n'),
        file_urls: [sourceUrl],
        response_json_schema: EXTRACTION_SCHEMA,
      });
    } else {
      // The page could not be read directly — fall back to a search restricted
      // to this one URL and the manufacturer's own domain.
      raw = await base44.integrations.Core.InvokeLLM({
        prompt: [
          rulesFor(manufacturerName, model),
          ``,
          `SOURCE: ${sourceType} at ${sourceUrl}`,
          `Read that specific URL. If it cannot be read, read the specification page for this exact model on the same manufacturer domain. Never use a dealer, retailer or review site.`,
        ].join('\n'),
        add_context_from_internet: true,
        model: 'gemini_3_flash',
        response_json_schema: EXTRACTION_SCHEMA,
      });
    }

    const reported = [];
    const ambiguous = [];
    const notFound = [];

    for (const item of Array.isArray(raw?.fields) ? raw.fields : []) {
      const field = String(item?.field || '').trim();
      if (!ALLOWED_FIELDS.includes(field)) continue;
      const status = ['reported', 'ambiguous', 'not_found'].includes(item?.status) ? item.status : 'not_found';
      const value = status === 'not_found' ? '' : coerceSpecValue(field, item?.value, item?.raw_text, {
        numericFields: NUMERIC_FIELDS,
        enums: ENUMS,
      });
      if (status === 'reported' && value !== '') reported.push({ field, value, raw_text: String(item?.raw_text || '').trim() });
      else if (status === 'ambiguous' && value !== '') ambiguous.push({ field, value, raw_text: String(item?.raw_text || '').trim() });
      else notFound.push(field);
    }

    return Response.json({
      model_confirmed: raw?.model_confirmed === true,
      source_url: sourceUrl,
      source_type: sourceType,
      source_date: new Date().toISOString().split('T')[0],
      source_read: read.ok,
      source_read_note: read.note || '',
      reported,
      ambiguous,
      not_found: notFound,
      potential_unmapped: Array.isArray(raw?.potential_unmapped) ? raw.potential_unmapped : [],
      extraction_source: 'Official source, human review required before approval',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}