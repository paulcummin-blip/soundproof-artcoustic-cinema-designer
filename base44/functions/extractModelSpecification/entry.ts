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

const ALLOWED_FIELDS = [
  'cabinet_type', 'mounting_type', 'woofer_count', 'woofer_size', 'midrange_count', 'midrange_size',
  'tweeter_description', 'compression_driver', 'coaxial', 'height_mm', 'width_mm', 'depth_mm', 'weight_kg',
  'sensitivity_db', 'sensitivity_basis', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w', 'long_term_iec_power_w', 'rated_iec_power_w',
  'aes_power_w', 'peak_power_w', 'power_handling_continuous_w', 'power_handling_peak_w',
  'frequency_response_low_hz', 'frequency_response_high_hz', 'frequency_response_tolerance',
  'frequency_response_tolerance_db', 'max_continuous_spl_db', 'max_peak_spl_db', 'max_spl_basis',
  'measurement_space', 'horizontal_dispersion_deg', 'vertical_dispersion_deg', 'thx_certification',
];

// Only these fields are numbers. Everything else is copied verbatim as text,
// so a driver description like 3 x 1" is never turned into a number.
const NUMERIC_FIELDS = new Set([
  'woofer_count', 'midrange_count', 'height_mm', 'width_mm', 'depth_mm', 'weight_kg',
  'sensitivity_db', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w', 'long_term_iec_power_w', 'rated_iec_power_w',
  'aes_power_w', 'peak_power_w', 'power_handling_continuous_w', 'power_handling_peak_w',
  'frequency_response_low_hz', 'frequency_response_high_hz', 'frequency_response_tolerance_db',
  'max_continuous_spl_db', 'max_peak_spl_db', 'horizontal_dispersion_deg', 'vertical_dispersion_deg',
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
      `Report a value only if the source explicitly states it for "${model}".`,
      `Mark a field "ambiguous" only when the source genuinely leaves it unclear for this model — for example the figure is given for a range of models, or the sentence is contradictory. When the source states the value plainly for this model, mark it "reported".`,
      `If the source does not state the field, return status "not_found" with an EMPTY value. Never infer, never estimate, never borrow a value from a sibling model, another series, a predecessor, or your own general knowledge.`,
      `Never convert or normalise. Copy the published figure as stated, e.g. "92 dB", "4 Ω", "200 W". Text fields such as tweeter_description must be copied word for word from the source.`,
      `Answer sensitivity_basis, max_spl_basis and measurement_space only when the source states the basis/space; otherwise "unknown" or "unspecified" respectively. When the source states the sensitivity reference — "2.83V1m", "2.83 V / 1 m", "2.83V @ 1m", "1W/1m" — answer sensitivity_basis with the recognised equivalent "2.83V/1m" or "1W/1m".`,
      `Use only these exact field names: ${ALLOWED_FIELDS.join(', ')}.`,
      `Give the exact sentence or table cell the value came from in raw_text.`,
      `model_confirmed must be true only if the source names this exact model.`,
      `Look specifically for a technical specifications table, spec sheet, or "Specifications" section — that is where sensitivity, impedance, power handling, max SPL and dispersion normally appear.`,
      `cabinet_type is the enclosure (sealed, ported, passive radiator) and mounting_type is how it is installed (on-wall, in-wall, in-ceiling, freestanding). A phrase like "On-Wall Speaker" describes mounting_type only, so leave cabinet_type not_found unless the enclosure itself is described.`,
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
      extraction_source: 'Official source, human review required before approval',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}