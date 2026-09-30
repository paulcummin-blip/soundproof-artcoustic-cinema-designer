// speakerDbComparisonCandidates.js
// ---------------------------------------------------------------------------
// The candidate list behind "Add speaker" on RP22 Speaker Capability — built
// from the admin Speaker Database, which is the source of truth. Legacy
// spreadsheet-only rows are not offered here.
//
// Two sources, one list, one grading path:
//   1. Comparison-library rows PUBLISHED from the Speaker Database (readable by
//      every user — the frozen approval snapshot).
//   2. Speaker Database products not published yet — Draft, Awaiting Review or
//      Approved — shown to master admins only (SpeakerProduct /
//      SpeakerSpecification are admin-read), clearly labelled by status.
//
// Every candidate is mapped with the SAME buildComparisonRow and normalised with
// the SAME normalizeCompetitor the RP22 engine consumes, so the option list and
// the selected-row grade can never disagree. Nothing is invented and nothing is
// upgraded: an assumption can only ever hold a figure at C or below.
//
//   A  Published measured capability     → normal P12/P13 pills
//   B  Calculated from published data    → pills labelled "Calculated"
//   C  ADI estimate from partial data    → pills labelled "ADI estimate"
//   D  Insufficient published data       → no grade is produced
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { buildComparisonRow } from "@/components/admin/speaker-db/model-first/rp22ComparisonPublish.js";
import { normalizeCompetitor, parseSensitivityBasis } from "@/components/utils/spl/competitorNormalization";
import { competitorIdentityKey } from "@/components/utils/spl/manufacturerIdentity";
import { RP22_EQ_HEADROOM_LABEL } from "@/components/utils/spl/rp22HeadroomPolicy";
import {
  documentTypeLabel,
  evidenceBadgeLabel,
  evidenceLabel,
  evidenceStatement,
  isTrustedEvidence,
} from "@/components/admin/speaker-db/secondaryEvidence/secondaryEvidencePolicy.js";
import { trustedSourceLine } from "@/components/utils/spl/trustedSecondarySources.js";

export const COMPARISON_CLASSES = {
  A: {
    confidence: "A",
    label: "Comparable",
    badgeLabel: "Comparable",
    basis: "Published",
    pill: null,
    tone: "#213428",
    meaning: "Published measured capability with a stated basis — graded normally.",
  },
  B: {
    confidence: "B",
    label: "Calculated from published data",
    badgeLabel: "Calculated",
    basis: "Calculated",
    pill: "Calculated",
    tone: "#2C5AA0",
    meaning: "Calculated from published sensitivity, impedance and a stated power authority.",
  },
  C: {
    confidence: "C",
    label: "ADI estimate from partial data",
    badgeLabel: "ADI estimate",
    basis: "ADI estimate",
    pill: "ADI estimate",
    tone: "#9A6E00",
    meaning: "ADI estimate based on available manufacturer data — partial published data only.",
  },
  D: {
    confidence: "D",
    label: "Insufficient published data",
    badgeLabel: "Insufficient",
    basis: "Insufficient",
    pill: "Insufficient data",
    tone: "#B23A3A",
    meaning: "Not enough published data for a defensible P12/P13 estimate — no grade is produced.",
  },
};

export const ADI_ESTIMATE_STATEMENT =
  "This is an ADI estimate based on available manufacturer data. It is useful for early comparison but not equivalent to verified published capability data.";

export const COMPARISON_PARITY_STATEMENT =
  `Same RP22 P12/P13 engine, distance, amplifier power, 1 W / 1 m normalisation and Sound Proof ${RP22_EQ_HEADROOM_LABEL} headroom as the Artcoustic row.`;

// Controlled assumptions — each one is stated wherever the comparison is shown.
const ASSUMED_SPACE = "Measurement space not stated — half-space normalisation applied";
const ASSUMED_SENSITIVITY_BASIS = "Sensitivity basis not stated — treated as 2.83 V / 1 m";

const STATUS_RANK = { Published: 0, Approved: 1, "Awaiting Review": 2, Draft: 3, Superseded: 4, Archived: 5, Manual: 6 };
const CONFIDENCE_RANK = { A: 0, B: 1, C: 2, D: 3 };

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

// ADI estimate rule: when no sensitivity basis is declared but a sensitivity and
// an impedance are published, treat the figure as 2.83 V / 1 m and say so. The
// value itself is never invented, and a missing impedance is not assumed.
function applySensitivityBasisAssumption(row) {
  const hasSensitivity = hasValue(row.sensitivity_value_db);
  const basisDeclared = parseSensitivityBasis(row.sensitivity_reference) !== null;
  const impedanceKnown = hasValue(row.sensitivity_impedance_used_ohm) || hasValue(row.rated_impedance_ohm);
  if (!hasSensitivity || basisDeclared || !impedanceKnown) return { row, assumed: false };
  return { row: { ...row, sensitivity_reference: "2.83V/1m" }, assumed: true };
}

/**
 * Classify one comparison row (the mapped shape the RP22 engine consumes).
 * @returns {object} { record, classKey, assumptions, eligible }
 */
export function classifyComparisonRow(row) {
  const { row: assumptionRow, assumed: assumedSensitivityBasis } = applySensitivityBasisAssumption(row);
  const record = normalizeCompetitor(assumptionRow);

  const assumptions = [];
  if (assumedSensitivityBasis) assumptions.push(ASSUMED_SENSITIVITY_BASIS);
  if (record.max_spl_space_provenance === "half_space_assumed" || record.sensitivity_space_provenance === "half_space_assumed") {
    assumptions.push(ASSUMED_SPACE);
  }

  const eligible = record.p12_p13_eligible === true;
  const gradedFromPublished = record.halfspace_published_max_continuous_spl_db_1m != null;

  let confidence = eligible ? record.data_confidence : "INSUFFICIENT";
  // A capability that rests on a treated basis is an estimate — never A or B.
  if (eligible && assumedSensitivityBasis && !gradedFromPublished) confidence = "C";

  const classKey = confidence === "A" || confidence === "B" || confidence === "C" ? confidence : "D";
  return { record, classKey, assumptions, eligible };
}

function valuesUsedText(record) {
  const impedance = record.sensitivity_impedance_used_ohm ?? record.rated_impedance_ohm;
  return [
    hasValue(record.sensitivity_value_db)
      ? `Sensitivity ${record.sensitivity_value_db} dB @ ${record.sensitivity_reference || "basis unstated"}`
      : null,
    hasValue(impedance) ? `Impedance ${impedance} Ω` : null,
    hasValue(record.published_max_continuous_spl_db_1m)
      ? `Published max continuous SPL ${record.published_max_continuous_spl_db_1m} dB`
      : null,
    record.power_authority_w != null
      ? `Power authority ${record.power_authority_w} W (${record.power_authority || "unstated"})`
      : null,
  ].filter(Boolean).join(" · ") || "No usable published values";
}

/**
 * Build one selectable comparison candidate.
 * @param {object} params { row, id, productId, specificationId, approvalStatus, published, sourceLabel, product }
 */
export function buildCandidate({
  row,
  id,
  productId = null,
  specificationId = null,
  approvalStatus = "",
  published = false,
  sourceLabel = "Speaker Database",
  product = null,
}) {
  const { record, classKey, assumptions, eligible } = classifyComparisonRow(row);
  const klass = COMPARISON_CLASSES[classKey];
  const candidateId = id || `speakerdb:${productId || specificationId || record.model}`;
  const withId = { ...record, id: candidateId };
  const statusLabel = published ? "Published" : (approvalStatus || "Draft");
  const manufacturer = withId.manufacturer || product?.manufacturer_name || "";
  const model = withId.model || product?.model || "";

  // Admin-approved secondary evidence: the numbers are usable for comparison but
  // the badge must say so, and never as published measured manufacturer evidence.
  const secondary = withId.evidence_source === "secondary" || withId.secondary_evidence
    ? (withId.secondary_evidence || {})
    : null;
  const secondaryCapped = Boolean(secondary) && secondary.is_official !== true;
  const trustedSecondary = secondaryCapped && isTrustedEvidence(secondary);
  const badgeLabel = secondaryCapped ? evidenceBadgeLabel(secondary) : klass.badgeLabel;
  const basisLabel = secondaryCapped ? (secondary.basis || klass.basis) : klass.basis;
  const evidenceSourceLine = trustedSecondary ? trustedSourceLine(secondary.host || secondary.url) : "";

  return {
    id: candidateId,
    record: withId,
    manufacturer,
    model,
    productId,
    specificationId,
    classKey,
    confidence: klass.confidence,
    label: klass.label,
    badgeLabel,
    basisLabel,
    pillLabel: klass.pill,
    tone: klass.tone,
    meaning: klass.meaning,
    statusLabel,
    published,
    sourceLabel,
    assumptions,
    valuesUsed: valuesUsedText(withId),
    comparable: eligible && classKey !== "D",
    parityNote: COMPARISON_PARITY_STATEMENT,
    adiStatement: classKey === "C" && !secondaryCapped ? ADI_ESTIMATE_STATEMENT : null,
    secondaryEvidence: secondaryCapped
      ? {
        ...secondary,
        trusted: trustedSecondary,
        evidence_label: evidenceLabel(secondary),
        source_line: evidenceSourceLine,
        document_type_label: documentTypeLabel(secondary.document_type),
      }
      : null,
    secondaryStatement: secondaryCapped ? evidenceStatement(secondary) : null,
    sourceUrl: withId.source_url || product?.official_product_url || "",
    datasheetUrl: withId.datasheet_url || product?.official_pdf_url || "",
    optionLabel: `${manufacturer} · ${model} — ${statusLabel} · ${badgeLabel}`,
  };
}

/** Approved/published first, then Draft; within each status by confidence A→D. */
export function sortComparisonCandidates(candidates) {
  return [...candidates].sort((a, b) =>
    (STATUS_RANK[a.statusLabel] ?? 6) - (STATUS_RANK[b.statusLabel] ?? 6)
    || CONFIDENCE_RANK[a.classKey] - CONFIDENCE_RANK[b.classKey]
    || `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`));
}

/**
 * Every comparison candidate available for the "Add speaker" list.
 * @param {object} params { includeUnpublished } include Speaker Database products
 *   that are not published yet — master admin only (admin-read entities).
 */
export async function loadComparisonCandidates({ includeUnpublished = false } = {}) {
  const rows = await base44.entities.CompetitorSpeaker.list("manufacturer", 500);
  const live = (rows || []).filter((r) => r.active !== false);
  // Represented in the admin Speaker Database: published from an approved
  // specification. Legacy spreadsheet-only rows are not comparison candidates.
  const publishedRows = live.filter((r) => r.publish_source === "speaker_database" && r.published === true);

  const candidates = publishedRows.map((row) => buildCandidate({
    row,
    id: row.id,
    productId: row.source_product_id || null,
    specificationId: row.source_specification_id || null,
    approvalStatus: row.approval_status || "Approved",
    published: true,
    sourceLabel: "Speaker Database · published",
  }));

  if (!includeUnpublished) return sortComparisonCandidates(candidates);

  const [products, specs] = await Promise.all([
    base44.entities.SpeakerProduct.list("model", 500),
    base44.entities.SpeakerSpecification.list("-created_date", 500),
  ]);
  const specList = specs || [];
  const specById = new Map(specList.map((s) => [s.id, s]));
  const publishedProductIds = new Set(publishedRows.map((r) => r.source_product_id).filter(Boolean));
  const publishedKeys = new Set(publishedRows.map((r) => competitorIdentityKey(r)));

  for (const product of products || []) {
    if (publishedProductIds.has(product.id)) continue;
    if (publishedKeys.has(competitorIdentityKey({ manufacturer: product.manufacturer_name, model: product.model }))) continue;

    const specification = specById.get(product.current_specification_id)
      || specList.find((s) => s.product_id === product.id && s.is_current)
      || specList.find((s) => s.product_id === product.id)
      || null;
    // Mapped exactly as the publish path maps it; the candidate is not persisted,
    // so it is not marked published.
    const row = specification
      ? { ...buildComparisonRow({ product, specification, manufacturerName: product.manufacturer_name }), published: false }
      : { manufacturer: product.manufacturer_name || "", model: product.model || "" };

    candidates.push(buildCandidate({
      row,
      id: `speakerdb:${product.id}`,
      productId: product.id,
      specificationId: specification?.id || null,
      approvalStatus: specification?.approval_status || "Draft",
      published: false,
      sourceLabel: "Speaker Database",
      product,
    }));
  }

  return sortComparisonCandidates(candidates);
}