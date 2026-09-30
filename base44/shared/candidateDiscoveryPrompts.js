// candidateDiscoveryPrompts.js
// ---------------------------------------------------------------------------
// The reporting passes used by discoverCandidateModels:
//
//   1. DISCOVERY  which models exist on the manufacturer's official domain.
//                 IDENTITY ONLY — model, series, role, category, URLs. Asking a
//                 search to also write a full specification for every model
//                 truncates the list (the specification object is larger than
//                 the model list itself), so the values are read separately.
//   2. DOCUMENTS  the P12/P13 values for the discovered models, read from the
//                 official product sheet / datasheet / manual / installation
//                 guide, and from the product page when no document exists.
//
// Every pass may only use the manufacturer's own hosts, must state the source of
// every value, and leaves a value empty rather than estimating it. The
// deterministic guards in speakerSpecGuards.js re-check every number afterwards.
// ---------------------------------------------------------------------------

import { DOCUMENT_TYPES } from './officialDocumentHarvest.js';

// Supporting documentation searched per model — the places specification data
// usually lives, rather than the marketing page.
export const SUPPORTING_DOCUMENTS = [
  'product sheet', 'specification sheet', 'spec sheet', 'data sheet', 'datasheet',
  'technical sheet', 'technical document', 'manual', 'installation manual',
  'install guide', 'installation guide', 'owner manual', 'user guide', 'brochure',
  'downloads', 'PDF', 'info sheet', 'cut sheet', 'architectural specification',
  'CI specification', 'support', 'documents',
];

// High-end cinema and custom-install products come first: these are the ranges a
// P12/P13 comparison is actually built from.
export const PRIORITY_PRODUCTS = [
  'high-end cinema speakers', 'custom install ranges', 'in-wall LCR', 'on-wall LCR',
  'architectural cinema speakers', 'behind-screen speakers', 'surround speakers',
  'height speakers', 'THX certified products', 'home theatre / theatre / cinema products',
];

export const DOCUMENT_SEARCH_PATTERNS = [
  '"<manufacturer> <model> product sheet"',
  '"<manufacturer> <model> spec sheet"',
  '"<manufacturer> <model> datasheet"',
  '"<manufacturer> <model> manual"',
  '"<manufacturer> <model> installation guide"',
  '"<manufacturer> <model> pdf"',
  'site:<official-domain> <model> pdf',
  'site:<official-domain> <model> "sensitivity"',
  'site:<official-domain> <model> "recommended amplifier"',
];

const VALUE_RULES = [
  'Values only, never marketing prose. Every specification value you report must be explicitly published in the official source for THAT model; when a value is not stated, return null for it. NEVER estimate, NEVER infer a value from a sibling model, a series or a similar product, and NEVER copy a value from another manufacturer.',
  'Every number must be plausible and must belong to the field it is reported in: sensitivity 70-110 dB, impedance 1-32 ohms, power 5-5000 W, maximum SPL 80-150 dB, dispersion 5-180 degrees, driver counts 1-12. An angle is never a power rating, a wattage is never a dispersion figure and a dB figure is never an impedance. Never repeat one figure across several fields: when the source states a single power rating, report it once in the field the source names (continuous, long-term IEC, rated IEC, AES, or the recommended amplifier range) and leave the other power fields null.',
  'Source discipline: only pages on the manufacturer\'s official hosts listed above. Dealer, retailer, distributor, marketplace, forum and review sites are never acceptable, even when they quote better numbers — if a value appears only there, leave it out.',
];

function officialHostsBlock({ authorityUrl, allowedHosts }) {
  return [
    `Preferred official entry point: ${authorityUrl}`,
    `Official hosts (the ONLY acceptable sources): ${(allowedHosts || []).join(', ')}`,
  ];
}

/**
 * Pass 1 — the candidate model list for one manufacturer (identity only).
 */
export function buildDiscoveryPrompt({
  manufacturerName,
  authorityUrl,
  allowedHosts,
  regionalLabel,
  roleGuesses,
  categories,
  maxCandidates,
  focus,
}) {
  return [
    'You are compiling a review list of loudspeaker models for a professional home cinema engineering database.',
    '',
    `Manufacturer: ${manufacturerName}`,
    ...officialHostsBlock({ authorityUrl, allowedHosts }),
    regionalLabel
      ? `Search the ${regionalLabel} pages of that site FIRST; the rest of the official site stays valid when the regional pages carry no data.`
      : 'Search the manufacturer\'s own official site.',
    '',
    'Find the manufacturer\'s current loudspeaker models for discrete home cinema and architectural install use, including its full custom-install cinema range — do not stop after one or two products.',
    'The cinema and custom-install ranges matter most here: when the manufacturer sells a dedicated cinema or theatre series (a range sold specifically for cinema installations, commonly named with a designation such as CT, CTM, CCM, CWM, IW, SC or THX), every model in it must appear in your list. Aim for at least eight models whenever the manufacturer publishes that many.',
    focus ? `This pass focuses on: ${focus}.` : '',
    `Prioritise: ${PRIORITY_PRODUCTS.join('; ')}.`,
    'Always record the range or series name for each model in the series field (for example "CT800 Series", "Reference Series") — the series document is searched later when a model page carries no specification.',
    'Start from the manufacturer\'s own product listing and category pages (products, custom installation, architectural, cinema / theatre series overviews) and enumerate EVERY model listed there before you answer. The regional pages may be rendered by scripts, so the manufacturer\'s global official pages are equally acceptable — they usually carry the complete series list. When the manufacturer publishes a dedicated cinema or custom-theatre series, list every model in that series.',
    '',
    'Rules you must follow exactly:',
    `1. Use ONLY pages on these official hosts: ${(allowedHosts || []).join(', ')} (subdomains included).`,
    '2. EXCLUDE headphones, headsets, wireless or portable lifestyle speakers, smart speakers, soundbars, electronics, amplifiers, receivers, processors, subwoofers, accessories (brackets, cables, mounts, grilles, back boxes) and outdoor products. Exclude complete packages/systems — unless the package lists its individual speaker models, in which case return those models.',
    `3. IDENTITY ONLY — this pass identifies models, it does not collect specification values. For each model report: the exact model name as published, the series, the most likely role (one of ${roleGuesses.join(', ')}), the product_category (one of ${categories.join(', ')}), the full absolute product URL, the official specification PDF URL when one exists (otherwise null), spec_source_type (Official PDF when a specification PDF exists, otherwise Official Product Page) and is_discontinued (true only when the manufacturer states it is discontinued).`,
    '4. List a model even when its page shows no specification values: the engineering values are read from the official documents in a later pass, so an entry with no numbers is still a valid candidate. Do not omit a model because you could not find its specifications.',
    `5. Return at most ${maxCandidates} candidates. Do not return catalogue or category index pages as products, and do not return the same model twice.`,
    '',
    'Return JSON only.',
  ].join('\n');
}

/** JSON schema for the discovery pass — identity fields only. */
export function discoverySchema() {
  return {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            series: { type: 'string' },
            product_category: { type: 'string' },
            role_guess: { type: 'string' },
            product_url: { type: 'string' },
            datasheet_url: { type: 'string' },
            spec_source_type: { type: 'string', enum: ['Official Product Page', 'Official PDF'] },
            is_discontinued: { type: 'boolean' },
          },
        },
      },
    },
  };
}

/**
 * Pass 2 — the P12/P13 values for a batch of models, read from the official
 * supporting documents (product sheet, datasheet, manual, installation guide)
 * as well as the product page.
 */
export function buildExtractionPrompt({ manufacturerName, authorityUrl, allowedHosts, models, deepSearch }) {
  const modelBlock = models.map((entry, index) => {
    const documents = (entry.documents || [])
      .map((document) => `    - ${document.document_type}: ${document.url}`)
      .join('\n');
    return [
      `${index + 1}. ${entry.model}${entry.series ? ` (series: ${entry.series})` : ''}`,
      `   product page: ${entry.product_url}`,
      documents ? `   official documents linked from that page:\n${documents}` : '   no document links were found on the product page',
    ].join('\n');
  }).join('\n');

  return [
    'You are reading manufacturer documentation to complete a professional home cinema engineering record.',
    '',
    `Manufacturer: ${manufacturerName}`,
    ...officialHostsBlock({ authorityUrl, allowedHosts }),
    '',
    'For EVERY model listed below, find its official specification and extract the P12/P13 engineering values.',
    '',
    `Look for the model's supporting documents, not only its product page. Search for and read whichever of these exist: ${SUPPORTING_DOCUMENTS.join(', ')}.`,
    '',
    'Search patterns to use (substituting the manufacturer, the exact model and the official domain):',
    ...DOCUMENT_SEARCH_PATTERNS.map((pattern) => `  - ${pattern}`),
    '',
    'Then open the document and read the specification table or specification list in it. Documents usually carry sensitivity, impedance, recommended amplifier power, frequency response and dispersion even when the product page shows only marketing text. Read the product page as well: when no document exists, values stated on the manufacturer\'s own page are equally acceptable.',
    '',
    'Models to complete:',
    modelBlock,
    '',
    deepSearch
      ? 'THESE MODELS ARE STILL INCOMPLETE. The specification is most likely in a SERIES or RANGE document rather than a single-model page: read the range specification sheet, series brochure, installation manual, architectural/CI specification, or the downloads, support and archive pages for the model and its series. Official documents are often served from the manufacturer\'s media or CDN subdomains — any host ending in the official domains above is acceptable. Name the document you actually read.'
      : '',
    '',
    'Rules you must follow exactly:',
    `1. ${VALUE_RULES[0]}`,
    `2. ${VALUE_RULES[1]}`,
    `3. ${VALUE_RULES[2]}`,
    `4. Return one item per model listed above, using the model string exactly as given. Report document_url (the official document you actually read the values from), document_type (one of ${DOCUMENT_TYPES.join(', ')} — "Product page" when the values came from the product page and no document was read), source_date (the date the source was published or last updated, as YYYY-MM-DD, or an empty string when no date is stated) and source_quote (the exact sentence or table row that carries the values).`,
    '5. Specification fields — sensitivity_db and sensitivity_basis (1W/1m, 2.83V/1m or unknown exactly as published), nominal_impedance_ohm, minimum_impedance_ohm, recommended_amp_min_w, recommended_amp_max_w, power_handling_continuous_w, long_term_iec_power_w, rated_iec_power_w, aes_power_w, max_continuous_spl_db, max_spl_basis (AES, IEC, continuous, peak, manufacturer unspecified, calculated or unknown), max_peak_spl_db, frequency_response_low_hz, frequency_response_high_hz, frequency_response_tolerance, measurement_space (half-space, free-space, in-room or unspecified), horizontal_dispersion_deg, vertical_dispersion_deg, cabinet_type, mounting_type, woofer_count, woofer_size, midrange_count, midrange_size, tweeter_description.',
    '6. frequency_response_low_hz and frequency_response_high_hz are the frequency response band the document states, in Hz (45 and 28000 for "45Hz - 28kHz ±3dB") with that tolerance in frequency_response_tolerance. When the document states only a -6 dB range such as "-6dB at 34Hz and 40kHz", report 34 and 40000 with frequency_response_tolerance "-6dB". Report dispersion in degrees as stated ("over 60°" is 60), and give the recommended amplifier range as its two watts values (500 and 1000 for "500-1000W").',
    '7. When you cannot find an official document for a model, set document_url and document_type to an empty string, leave the values you could not find null, and explain briefly in not_found_reason: "document not found" or "document found but values not stated".',
    '',
    'Return JSON only.',
  ].join('\n');
}

/** JSON schema for the document-extraction pass. */
export function extractionSchema(specificationProperties) {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            document_url: { type: 'string' },
            document_type: { type: 'string', enum: DOCUMENT_TYPES },
            source_date: { type: 'string' },
            source_quote: { type: 'string' },
            not_found_reason: { type: 'string' },
            specification: { type: 'object', properties: specificationProperties },
          },
        },
      },
    },
  };
}