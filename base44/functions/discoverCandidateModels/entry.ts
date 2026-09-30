// discoverCandidateModels/entry.ts
// ---------------------------------------------------------------------------
// Candidate model discovery for one manufacturer — the review step BEFORE
// anything reaches the Speaker Database.
//
// Scope discipline (enforced in code, not only in the prompt):
//   - one manufacturer, one official domain, discovered from that domain only
//   - every candidate whose product URL is not on the official domain is dropped
//   - cinema / architectural / in-wall / on-wall / LCR / surround / height /
//     install / home-theatre products are preferred; headphones, wireless
//     lifestyle speakers, soundbars, electronics, amplifiers, subwoofers,
//     accessories and discontinued models are excluded (discontinued models are
//     returned only when nothing current exists)
//   - nothing is created, approved or published: this function performs no
//     database writes at all. The admin selects the models to add.
//   - every reported value must be published in the official source text. A
//     value that is not stated stays null — never estimated, never inferred.
// ---------------------------------------------------------------------------

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { hostOf, normaliseDomain, isOfficialHost } from '../../shared/officialDomain.js';

const MAX_CANDIDATES = 30;

const ROLE_GUESSES = ['LCR', 'Surround', 'Wide', 'Height', 'Flexible', 'Both', 'Unknown'];
const CATEGORIES = ['On Wall', 'In Wall', 'Freestanding', 'Other'];
const SENSITIVITY_BASES = ['1W/1m', '2.83V/1m', 'unknown'];
const SPACES = ['half-space', 'free-space', 'in-room', 'unspecified'];
const SPL_BASES = ['AES', 'IEC', 'continuous', 'peak', 'manufacturer unspecified', 'calculated', 'unknown'];

// Exclusions for this P12/P13 speaker-capability section.
const EXCLUSIONS = [
  { reason: 'Subwoofer', test: /\bsub ?woofers?\b|\bsub[ -]?\d|\bsub\b/i },
  { reason: 'Headphones', test: /headphone|headset|earphone|earbud|\bin-?ear\b/i },
  { reason: 'Soundbar', test: /sound ?bar/i },
  { reason: 'Wireless lifestyle speaker', test: /portable|bluetooth|wireless speaker|smart speaker|voice assistant/i },
  { reason: 'Electronics / amplifier', test: /amplifier|receiver|processor|\bavr\b|\bdac\b|electronic|streamer/i },
  { reason: 'Accessory', test: /accessor|bracket|cable|mount kit|grille|speaker stand|spike|back ?box|recessed ?box/i },
  { reason: 'Installation package', test: /\bpackage\b|\bbundle\b|complete system|speaker system/i },
  { reason: 'Outdoor', test: /outdoor|landscape|marine/i },
];

const SPEC_FIELDS = [
  'sensitivity_db', 'sensitivity_basis', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w', 'power_handling_continuous_w',
  'long_term_iec_power_w', 'rated_iec_power_w', 'aes_power_w',
  'max_continuous_spl_db', 'max_spl_basis', 'max_peak_spl_db',
  'frequency_response_low_hz', 'frequency_response_high_hz', 'frequency_response_tolerance',
  'measurement_space', 'cabinet_type', 'mounting_type',
  'horizontal_dispersion_deg', 'vertical_dispersion_deg',
  'woofer_count', 'woofer_size', 'midrange_count', 'midrange_size', 'tweeter_description',
];

const NUMERIC_SPEC_FIELDS = new Set([
  'sensitivity_db', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w', 'power_handling_continuous_w',
  'long_term_iec_power_w', 'rated_iec_power_w', 'aes_power_w',
  'max_continuous_spl_db', 'max_peak_spl_db',
  'frequency_response_low_hz', 'frequency_response_high_hz',
  'horizontal_dispersion_deg', 'vertical_dispersion_deg',
  'woofer_count', 'midrange_count',
]);

// Plausibility guards. A value still has to be stated by the official source,
// but a reporting pass can collapse a column — one figure landing in several
// fields. An implausible figure is discarded rather than written, and every
// discard is reported to the admin for review.
const FIELD_LIMITS: Record<string, [number, number]> = {
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
  horizontal_dispersion_deg: [10, 360],
  vertical_dispersion_deg: [10, 360],
  woofer_count: [1, 12],
  midrange_count: [1, 12],
};

const POWER_FIELDS = [
  'power_handling_continuous_w',
  'long_term_iec_power_w',
  'rated_iec_power_w',
  'aes_power_w',
];

const specProperties = {};
for (const field of SPEC_FIELDS) {
  if (field === 'sensitivity_basis') specProperties[field] = { type: 'string', enum: SENSITIVITY_BASES };
  else if (field === 'measurement_space') specProperties[field] = { type: 'string', enum: SPACES };
  else if (field === 'max_spl_basis') specProperties[field] = { type: 'string', enum: SPL_BASES };
  else if (NUMERIC_SPEC_FIELDS.has(field)) specProperties[field] = { type: 'number' };
  else specProperties[field] = { type: 'string' };
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          model: { type: 'string' },
          series: { type: 'string' },
          role_guess: { type: 'string', enum: ROLE_GUESSES },
          product_category: { type: 'string', enum: CATEGORIES },
          product_url: { type: 'string' },
          datasheet_url: { type: 'string' },
          spec_source_type: { type: 'string', enum: ['Official Product Page', 'Official PDF'] },
          is_discontinued: { type: 'boolean' },
          source_quote: { type: 'string' },
          specification: { type: 'object', properties: specProperties },
        },
      },
    },
  },
};

// Free-text values a reporting pass sometimes emits in place of a stated figure.
const STRING_NOISE = new Set([
  'null', 'undefined', 'n/a', 'na', 'none', '-', '—', 'unspecified',
  'not specified', 'not stated', 'unknown', 'tbd',
]);

function text(value: any) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function numberOrNull(value: any) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseSpecification(raw: any) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const spec: Record<string, any> = {};
  const discarded: string[] = [];
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
    if (field === 'sensitivity_basis') {
      const match = SENSITIVITY_BASES.find((option) => option.toLowerCase() === String(value).trim().toLowerCase());
      spec[field] = match || 'unknown';
      continue;
    }
    if (field === 'measurement_space') {
      const match = SPACES.find((option) => option.toLowerCase() === String(value).trim().toLowerCase());
      spec[field] = match || 'unspecified';
      continue;
    }
    if (field === 'max_spl_basis') {
      const match = SPL_BASES.find((option) => option.toLowerCase() === String(value).trim().toLowerCase());
      spec[field] = match || 'unknown';
      continue;
    }
    const cleaned = text(value);
    if (STRING_NOISE.has(cleaned.toLowerCase())) continue;
    spec[field] = cleaned;
  }

  // A published frequency band must be ordered.
  if (spec.frequency_response_low_hz !== undefined && spec.frequency_response_high_hz !== undefined
    && spec.frequency_response_low_hz >= spec.frequency_response_high_hz) {
    discarded.push('frequency_response_low_hz / frequency_response_high_hz (band not ordered)');
    delete spec.frequency_response_low_hz;
    delete spec.frequency_response_high_hz;
  }

  // Column collapse: the same figure repeated across three or more power fields is
  // one figure, not three ratings. Keep the authority the comparison uses and drop
  // the repeats.
  const presentPower = POWER_FIELDS.filter((field) => spec[field] !== undefined);
  if (presentPower.length >= 3 && new Set(presentPower.map((field) => spec[field])).size === 1) {
    for (const field of presentPower.slice(1)) {
      discarded.push(`${field} (repeated ${spec[field]} W)`);
      delete spec[field];
    }
  }

  return { spec, discarded };
}

function exclusionFor(candidate: any) {
  const haystack = `${text(candidate?.model)} ${text(candidate?.series)}`;
  for (const rule of EXCLUSIONS) {
    if (rule.test.test(haystack)) return rule.reason;
  }
  return null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const manufacturerName = text(body?.manufacturerName);
    const domain = normaliseDomain(body?.manufacturerDomain || body?.website);

    if (!manufacturerName) {
      return Response.json({ error: 'Manufacturer is required' }, { status: 400 });
    }
    if (!domain) {
      return Response.json({
        error: 'This manufacturer has no official website recorded, so there is no authority domain to search. Add the website first.',
        candidates: [],
      }, { status: 400 });
    }

    const prompt = [
      `You are compiling a review list of loudspeaker models for a professional home cinema engineering database.`,
      ``,
      `Manufacturer: ${manufacturerName}`,
      `Official manufacturer domain: ${domain}`,
      ``,
      `Find the manufacturer's current loudspeaker models for discrete home cinema and architectural install use.`,
      ``,
      `Rules you must follow exactly:`,
      `1. Use ONLY pages on ${domain} (including its subdomains). Never use dealer, retailer, distributor, marketplace, forum or review sites — if a value is only published on such a site, leave it out.`,
      `2. PREFER products described as cinema, home theatre, architectural, in-wall, on-wall, LCR, surround, wide, height, install or custom installation.`,
      `3. EXCLUDE headphones, headsets, wireless or portable lifestyle speakers, smart speakers, soundbars, electronics, amplifiers, receivers, processors, subwoofers, accessories (brackets, mounts, grilles, back boxes), and complete packages/systems.`,
      `4. Every specification value must be explicitly published in the official source text for THAT model. If a value is not stated, return null for it. NEVER estimate, NEVER infer a value from a sibling model, a series, or a similar product, and NEVER copy a value from another manufacturer.`,
      `4a. Every number must be plausible for a loudspeaker and must belong to the field it is reported in: sensitivity 70-110 dB, impedance 1-32 ohms, power 5-5000 W, maximum SPL 80-150 dB, dispersion 10-360 degrees, driver counts 1-12. Never repeat one figure across several fields — when the source states a single power rating, report it once in the field the source names (continuous, AES, IEC, or recommended amplifier range) and leave the other power fields null.`,
      `5. For each candidate give the exact model name as published, the series, the most likely role (one of ${ROLE_GUESSES.join(', ')}), the product_category (one of ${CATEGORIES.join(', ')}), the full absolute product URL, the official specification PDF URL when one exists (otherwise null), spec_source_type (Official PDF when the values came from the official PDF, otherwise Official Product Page), is_discontinued (true only when the manufacturer states it is discontinued), and source_quote: the exact sentence or short passage from the official page that carries the specification values (empty string when nothing was published).`,
      `6. Specification fields — sensitivity_db and sensitivity_basis (1W/1m, 2.83V/1m or unknown exactly as published), nominal_impedance_ohm, minimum_impedance_ohm, recommended_amp_min_w, recommended_amp_max_w, power_handling_continuous_w, long_term_iec_power_w, rated_iec_power_w, aes_power_w, max_continuous_spl_db, max_spl_basis (AES, IEC, continuous, peak, manufacturer unspecified, calculated or unknown), max_peak_spl_db, frequency_response_low_hz, frequency_response_high_hz, frequency_response_tolerance, measurement_space (half-space, free-space, in-room or unspecified), cabinet_type, mounting_type, horizontal_dispersion_deg, vertical_dispersion_deg, woofer_count, woofer_size, midrange_count, midrange_size, tweeter_description.`,
      `7. Return at most ${MAX_CANDIDATES} candidates. Do not return catalogue or category index pages as products, and do not return the same model twice.`,
      ``,
      `Return JSON only.`,
    ].join('\n');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      response_json_schema: RESPONSE_SCHEMA,
    });

    const raw = Array.isArray(result?.candidates) ? result.candidates : [];
    const seen = new Set<string>();
    const kept: any[] = [];
    const discontinued: any[] = [];
    const excluded: any[] = [];
    const rejected: any[] = [];

    for (const item of raw) {
      const productUrl = text(item?.product_url);
      const host = hostOf(productUrl);
      if (!isOfficialHost(host, domain)) {
        if (productUrl) rejected.push({ model: text(item?.model), url: productUrl, reason: `Not on ${domain}` });
        continue;
      }

      const model = text(item?.model);
      if (!model) continue;

      const key = model.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const datasheetUrl = text(item?.datasheet_url);
      const { spec, discarded } = normaliseSpecification(item?.specification);
      const candidate = {
        model,
        series: text(item?.series),
        role_guess: ROLE_GUESSES.includes(text(item?.role_guess)) ? text(item?.role_guess) : 'Unknown',
        product_category: CATEGORIES.includes(text(item?.product_category)) ? text(item?.product_category) : 'Other',
        product_url: productUrl,
        datasheet_url: isOfficialHost(hostOf(datasheetUrl), domain) ? datasheetUrl : '',
        spec_source_type: text(item?.spec_source_type) === 'Official PDF' ? 'Official PDF' : 'Official Product Page',
        source_quote: text(item?.source_quote),
        is_discontinued: item?.is_discontinued === true,
        specification: spec,
        discarded_values: discarded,
      };

      const exclusion = exclusionFor(candidate);
      if (exclusion) {
        excluded.push({ model: candidate.model, series: candidate.series, url: candidate.product_url, reason: exclusion });
        continue;
      }

      if (candidate.is_discontinued) {
        discontinued.push({ ...candidate, exclusion_note: 'Discontinued' });
        continue;
      }

      kept.push(candidate);
    }

    // Discontinued models are offered only when no current option exists.
    const noCurrentOptions = kept.length === 0 && discontinued.length > 0;
    const candidates = (noCurrentOptions ? discontinued : kept)
      .slice(0, MAX_CANDIDATES)
      .map((candidate) => ({ ...candidate, is_discontinued: candidate.is_discontinued === true }));

    return Response.json({
      candidates,
      excluded,
      rejected,
      searched_domain: domain,
      official_only: true,
      no_current_options_found: noCurrentOptions,
      candidate_count: candidates.length,
      excluded_count: excluded.length,
      note: noCurrentOptions
        ? 'No current models were found on the official domain, so discontinued models are shown instead.'
        : 'Nothing has been created. Select the models to add.',
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}