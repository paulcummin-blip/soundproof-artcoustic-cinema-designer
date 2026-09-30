// fetchSecondaryEvidence
// ---------------------------------------------------------------------------
// Reads ONE admin-supplied document that is NOT necessarily hosted on the
// manufacturer's own domain, so the admin can decide whether to accept it as
// SECONDARY evidence.
//
// This function never writes to the database, never approves and never
// publishes. It fetches the URL, states what it appears to be and who hosts it,
// and returns only the P12/P13 values the document clearly states, each with the
// sentence it came from.
//
// The official-domain rule is unchanged: dealer and distributor sources are not
// automatic evidence. They only become evidence when an admin explicitly
// accepts them, which is recorded against the specification (and capped at C).
// ---------------------------------------------------------------------------

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { normaliseSpecification } from '../../shared/speakerSpecGuards.js';
import { buildExtractionRules, coerceSpecValue, readSource } from '../../shared/speakerSourceReading.js';
import { hostOf, isOfficialUrl, normaliseDomain } from '../../shared/officialDomain.js';

// The fields a P12/P13 comparison consumes, plus the source's own date.
const P12_P13_FIELDS = [
  'sensitivity_db', 'sensitivity_basis',
  'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w',
  'power_handling_continuous_w', 'long_term_iec_power_w', 'rated_iec_power_w', 'aes_power_w',
  'max_continuous_spl_db', 'max_peak_spl_db', 'max_spl_basis',
  'frequency_response_low_hz', 'frequency_response_high_hz', 'frequency_response_tolerance',
  'measurement_space',
  'horizontal_dispersion_deg', 'vertical_dispersion_deg',
  'source_date',
];

const ENUMS: Record<string, string[]> = {
  sensitivity_basis: ['1W/1m', '2.83V/1m', 'unknown'],
  max_spl_basis: ['AES', 'IEC', 'continuous', 'peak', 'manufacturer unspecified', 'calculated', 'unknown'],
  measurement_space: ['free-space', 'half-space', 'in-room', 'unspecified'],
};

// Fields whose reported value is a figure: decoded from the field's own number
// before the plausibility guards see it ("93dB" → 93, "24kHz" → 24000).
const NUMERIC_FIELDS = new Set([
  'sensitivity_db', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w',
  'power_handling_continuous_w', 'long_term_iec_power_w', 'rated_iec_power_w', 'aes_power_w',
  'max_continuous_spl_db', 'max_peak_spl_db',
  'frequency_response_low_hz', 'frequency_response_high_hz',
  'horizontal_dispersion_deg', 'vertical_dispersion_deg',
]);

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    model_confirmed: { type: 'boolean' },
    document_kind: { type: 'string' },
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

const DOCUMENT_LABELS: Record<string, string> = {
  manufacturer_product_sheet: 'Manufacturer product sheet',
  manufacturer_manual: 'Manufacturer manual',
  manufacturer_brochure: 'Manufacturer brochure',
  dealer_page: 'Dealer page',
  distributor_page: 'Distributor page',
  unknown: 'Unknown',
};

function text(value: any) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * What the supplied link appears to be. Deterministic signals only: the address
 * itself, and — for a page — the words the page uses about itself.
 */
function classifyDocument(url: string, isOfficial: boolean, bodyText: string) {
  const lowerUrl = String(url || '').toLowerCase();
  const isPdf = /\.pdf(\?|#|$)/i.test(lowerUrl);
  const signals = `${lowerUrl} ${String(bodyText || '').slice(0, 4000).toLowerCase()}`;

  if (/brochure|catalogue|catalog/.test(signals)) return 'manufacturer_brochure';
  if (/manual|installation|owner.?s.?(guide|manual)|user.?guide|instruction/.test(signals)) return 'manufacturer_manual';
  if (/spec(ification)?s?[._-]?(sheet|pdf)|datasheet|data[._-]?sheet|technical[._-]?(data|sheet)|product[._-]?sheet/.test(signals)) {
    return 'manufacturer_product_sheet';
  }
  if (isPdf) return 'manufacturer_product_sheet';
  if (isOfficial) return 'unknown';

  const page = String(bodyText || '').toLowerCase();
  const dealerHits = (page.match(/\b(dealer|retailer|shop|store|reseller|buy online)\b/g) || []).length;
  const distributorHits = (page.match(/\b(distributor|distribution|wholesale|trade partner)\b/g) || []).length;
  if (distributorHits > dealerHits && distributorHits > 0) return 'distributor_page';
  if (dealerHits > 0) return 'dealer_page';
  return 'unknown';
}

function rulesFor(manufacturerName: string, model: string, host: string) {
  return buildExtractionRules({
    manufacturerName,
    model,
    contextLines: [`The document is hosted at: ${host} — this is NOT the manufacturer's own website.`],
    rules: [
      `Report a value only if THIS document explicitly states it for "${model}".`,
      `Mark a field "ambiguous" only when the document genuinely leaves it unclear for this model — for example the figure is given for a range of models. When the value is stated plainly, mark it "reported".`,
      `If the document does not state the field, return status "not_found" with an EMPTY value. Never infer, never estimate, never borrow a value from a sibling model, another series or your own general knowledge.`,
      `Never convert or normalise. Copy the published figure as stated, e.g. "93 dB", "4 Ω", "500 W".`,
      `Answer sensitivity_basis, max_spl_basis and measurement_space only when the document states the basis/space; otherwise "unknown" or "unspecified" respectively.`,
      `Use only these exact field names: ${P12_P13_FIELDS.join(', ')}.`,
      `Give the exact sentence or table cell the value came from in raw_text — the admin will read it.`,
      `model_confirmed must be true only if the document names this exact model.`,
      `document_kind is what this document is: "product sheet", "manual", "brochure", "dealer page", "distributor page" or "unknown".`,
    ],
  });
}

export default async function (req: any) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const url = text(body?.url);
    const manufacturerName = text(body?.manufacturerName);
    const model = text(body?.model);
    const manufacturerWebsite = text(body?.manufacturerWebsite);

    if (!url || !manufacturerName || !model) {
      return Response.json({ error: 'A URL, manufacturer and model are required' }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(url)) {
      return Response.json({ error: 'The URL must start with http:// or https://' }, { status: 400 });
    }

    const host = hostOf(url);
    const domain = normaliseDomain(manufacturerWebsite);
    const isOfficial = isOfficialUrl(url, [domain].filter(Boolean));

    const isPdf = /\.pdf(\?|#|$)/i.test(url);
    const read = isPdf ? { ok: true, note: '', text: '' } : await readSource(url);

    let raw: any = null;
    if (read.ok && read.text) {
      // The document text is supplied verbatim: no web search, no general knowledge.
      raw = await base44.integrations.Core.InvokeLLM({
        prompt: [
          rulesFor(manufacturerName, model, host),
          ``,
          `DOCUMENT TEXT (verbatim, read from that address — this is your only evidence):`,
          `"""`,
          read.text,
          `"""`,
        ].join('\n'),
        response_json_schema: EXTRACTION_SCHEMA,
      });
    } else if (isPdf) {
      raw = await base44.integrations.Core.InvokeLLM({
        prompt: [
          rulesFor(manufacturerName, model, host),
          ``,
          `Read the attached PDF and extract only from it.`,
        ].join('\n'),
        file_urls: [url],
        response_json_schema: EXTRACTION_SCHEMA,
      });
    } else {
      raw = await base44.integrations.Core.InvokeLLM({
        prompt: [
          rulesFor(manufacturerName, model, host),
          ``,
          `Read this specific document: ${url}`,
          `Never use a different document, and never use your own general knowledge.`,
        ].join('\n'),
        add_context_from_internet: true,
        model: 'gemini_3_flash',
        response_json_schema: EXTRACTION_SCHEMA,
      });
    }

    // The same plausibility guards every official read passes: one figure cannot
    // occupy unrelated dimensions, ranges must be ordered, values must be in range.
    const rawSpec: Record<string, any> = {};
    const quotes: Record<string, string> = {};
    const ambiguousFields: string[] = [];
    for (const item of Array.isArray(raw?.fields) ? raw.fields : []) {
      const field = text(item?.field);
      if (!P12_P13_FIELDS.includes(field)) continue;
      const status = ['reported', 'ambiguous', 'not_found'].includes(item?.status) ? item.status : 'not_found';
      if (status === 'not_found') continue;
      const value = item?.value;
      if (value === null || value === undefined || String(value).trim() === '') continue;
      const coerced = coerceSpecValue(field, value, item?.raw_text, { numericFields: NUMERIC_FIELDS, enums: ENUMS });
      if (coerced === '' || coerced === null || coerced === undefined) continue;
      rawSpec[field] = coerced;
      const quote = text(item?.raw_text);
      if (quote) quotes[field] = quote.slice(0, 400);
      if (status === 'ambiguous') ambiguousFields.push(field);
    }

    const guarded = normaliseSpecification(rawSpec);
    const fields = Object.entries(guarded.spec).map(([field, value]) => ({
      field,
      value,
      status: ambiguousFields.includes(field) ? 'ambiguous' : 'reported',
      source_quote: quotes[field] || '',
      enum_options: ENUMS[field] || null,
    }));

    // What the address itself says, and — when the host refused our direct read —
    // what the reading pass found when it opened the document.
    let documentType = classifyDocument(url, isOfficial, read.text);
    const reportedKind = text(raw?.document_kind).toLowerCase();
    if (documentType === 'unknown' && reportedKind) {
      if (/product sheet|spec/.test(reportedKind)) documentType = 'manufacturer_product_sheet';
      else if (/manual/.test(reportedKind)) documentType = 'manufacturer_manual';
      else if (/brochure/.test(reportedKind)) documentType = 'manufacturer_brochure';
      else if (/distributor/.test(reportedKind)) documentType = 'distributor_page';
      else if (/dealer|retail/.test(reportedKind)) documentType = 'dealer_page';
    }

    return Response.json({
      url,
      host,
      is_official: isOfficial,
      official_domain: domain,
      document_type: documentType,
      document_type_label: DOCUMENT_LABELS[documentType] || DOCUMENT_LABELS.unknown,
      document_kind_reported: text(raw?.document_kind),
      model_confirmed: raw?.model_confirmed === true,
      source_read: read.ok,
      source_read_note: read.note || '',
      fields,
      discarded: guarded.discarded,
      ambiguous_fields: ambiguousFields,
      warning: isOfficial
        ? ''
        : 'This is not hosted on the official manufacturer domain.',
      extraction_source: 'Admin-supplied secondary source — human review and explicit acceptance required',
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}