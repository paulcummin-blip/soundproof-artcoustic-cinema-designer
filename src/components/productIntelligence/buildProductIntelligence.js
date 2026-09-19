/**
 * Product Intelligence — pure assembly module.
 *
 * Combines SpeakerProduct identity, SpeakerSpecification engineering data,
 * ProductIntelligence curated knowledge, and SpeakerDocument images into a
 * single structured object.
 *
 *   Project Data
 *        │
 *        ▼
 *   Engineering Authority      ← project-specific facts
 *        │
 *        ▼
 *   Product Intelligence       ← manufacturer knowledge (THIS MODULE)
 *        │
 *        ▼
 *   Design Intelligence
 *        │
 *        ▼
 *   Narrative Spine → Proposal
 *
 * Rules:
 *   - Returns structured objects only. No HTML, no proposal text, no GPT prompts.
 *   - Pure function: no SDK calls, no side effects. Caller loads the data.
 *   - Every knowledge statement carries a confidence value (A/B/C/D).
 *   - Images are resolved from SpeakerProduct + SpeakerDocument, never stored.
 *   - Missing knowledge is returned as null / empty, never fabricated.
 *
 * Confidence model (mirrors Engineering Authority):
 *   A = Published / verified manufacturer information
 *   B = Calculated from published data
 *   C = Estimated from partial data
 *   D = Engineering estimate
 */

const CONFIDENCE_LEVELS = ['A', 'B', 'C', 'D'];

const IMAGE_SLOTS = [
  'hero',
  'lifestyle',
  'transparent_png',
  'detail',
  'technical_drawing',
  'cutaway',
];

/**
 * Normalise a confidence value to A/B/C/D, falling back to the provided default.
 */
function normaliseConfidence(value, fallback = 'D') {
  if (value && CONFIDENCE_LEVELS.includes(value)) return value;
  return fallback;
}

/**
 * Resolve the per-statement confidence map, falling back to the record's
 * overall confidence for any field that doesn't have an explicit entry.
 */
function resolveStatementConfidence(intelligence, overallFallback) {
  const explicit = (intelligence && intelligence.statement_confidence) || {};
  const fields = [
    'engineering_purpose',
    'ideal_applications',
    'strengths',
    'design_compromises',
    'upgrade_path',
    'product_story',
  ];
  const result = {};
  for (const field of fields) {
    result[field] = normaliseConfidence(explicit[field], overallFallback);
  }
  return result;
}

/**
 * Resolve image URLs from SpeakerProduct fields and SpeakerDocument records.
 * No image is ever stored in Product Intelligence — this reads from the
 * product database at runtime. Missing slots return null.
 *
 * @param {object} product - SpeakerProduct record
 * @param {Array}  documents - SpeakerDocument records for this product
 */
function resolveImages(product, documents) {
  const docs = Array.isArray(documents) ? documents : [];
  const findDoc = (type) => docs.find((d) => d && d.document_type === type);

  return {
    hero: product?.hero_image_url || null,
    lifestyle: null,
    transparent_png: null,
    detail: null,
    technical_drawing:
      product?.diagram_image_url || findDoc('CAD')?.url || null,
    cutaway: null,
  };
}

/**
 * Assemble a complete Product Intelligence object from pre-loaded records.
 *
 * @param {object} params
 * @param {object} params.product - SpeakerProduct record (required)
 * @param {object} [params.specification] - SpeakerSpecification record (current)
 * @param {object} [params.intelligence] - ProductIntelligence knowledge record
 * @param {Array}  [params.documents] - SpeakerDocument records for image resolution
 * @returns {object} Structured Product Intelligence object
 */
export function buildProductIntelligence({
  product,
  specification,
  intelligence,
  documents,
}) {
  if (!product) {
    return {
      status: 'unavailable',
      reason: 'no_product',
      product_id: null,
    };
  }

  const intelligenceRecord = intelligence || {};
  const overallConfidence = normaliseConfidence(
    intelligenceRecord.confidence,
    'D',
  );
  const statementConfidence = resolveStatementConfidence(
    intelligenceRecord,
    overallConfidence,
  );

  const hasKnowledge = Boolean(
    !!intelligenceRecord &&
      !!intelligenceRecord.product_id &&
      (intelligenceRecord.engineering_purpose ||
        (intelligenceRecord.ideal_applications &&
          intelligenceRecord.ideal_applications.length > 0) ||
        (intelligenceRecord.strengths && intelligenceRecord.strengths.length > 0) ||
        (intelligenceRecord.design_compromises &&
          intelligenceRecord.design_compromises.length > 0) ||
        intelligenceRecord.product_story ||
        intelligenceRecord.upgrade_path),
  );

  return {
    status: hasKnowledge ? 'complete' : 'empty',
    product_id: product.id,

    // ── Identity (from SpeakerProduct) ──
    identity: {
      name: product.full_product_name || null,
      manufacturer_name: product.manufacturer_name || null,
      series: product.series || null,
      model: product.model || null,
      category: product.category || null,
      role: product.role || null,
    },

    // ── Engineering summary (from SpeakerSpecification, if available) ──
    engineering_summary: specification
      ? {
          cabinet_type: specification.cabinet_type || null,
          mounting_type: specification.mounting_type || null,
          sensitivity_db: specification.sensitivity_db ?? null,
          nominal_impedance_ohm: specification.nominal_impedance_ohm ?? null,
          frequency_response_low_hz: specification.frequency_response_low_hz ?? null,
          frequency_response_high_hz: specification.frequency_response_high_hz ?? null,
          max_continuous_spl_db: specification.max_continuous_spl_db ?? null,
          max_peak_spl_db: specification.max_peak_spl_db ?? null,
          horizontal_dispersion_deg: specification.horizontal_dispersion_deg ?? null,
          vertical_dispersion_deg: specification.vertical_dispersion_deg ?? null,
          spec_confidence: specification.confidence || null,
        }
      : null,

    // ── Knowledge (from ProductIntelligence) ──
    engineering_purpose: intelligenceRecord.engineering_purpose || null,
    ideal_applications: Array.isArray(intelligenceRecord.ideal_applications)
      ? intelligenceRecord.ideal_applications
      : [],
    strengths: Array.isArray(intelligenceRecord.strengths)
      ? intelligenceRecord.strengths
      : [],
    design_compromises: Array.isArray(intelligenceRecord.design_compromises)
      ? intelligenceRecord.design_compromises
      : [],
    upgrade_path: intelligenceRecord.upgrade_path || null,
    product_story: intelligenceRecord.product_story || null,

    // ── Images (resolved from product database, never stored) ──
    images: resolveImages(product, documents),

    // ── Confidence (per statement + overall) ──
    confidence: {
      ...statementConfidence,
      overall: overallConfidence,
    },

    // ── Meta ──
    meta: {
      knowledge_source: intelligenceRecord.knowledge_source || null,
      last_verified: intelligenceRecord.last_verified || null,
      has_knowledge_record: hasKnowledge,
    },
  };
}

export { CONFIDENCE_LEVELS, IMAGE_SLOTS };