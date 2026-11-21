// adiSourceExtraction.js
// ---------------------------------------------------------------------------
// Shared helpers for reading a manufacturer source with ADI and turning the
// extraction into a per-field proposal. Used by both the single-row
// ReadWithAdiDialog and the batch Read all incomplete queue, so the two paths
// can never drift apart in how they decode an extraction or default decisions.
//
// The pure parity-mapping logic (extractionToFound, mapMaxSplBasis, displayValue,
// decideDefaults, isConflict, buildSourceEvidence, PROPOSAL_FIELDS, FIELD_LABEL)
// lives in adiParityMapping.js — a dependency-free module so the parity
// discipline is unit-testable without the base44/AuthContext chain. This module
// re-exports that pure API and adds the only pieces that need the SDK: the
// source read itself, and the current-form builder.
//
// The actual source read is the existing extractModelSpecification backend
// function (admin-only, reads the page or PDF verbatim, no general knowledge).
// Nothing here re-implements that read.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import {
  formFromRow,
} from "@/components/admin/speaker-library/saveSpeakerComparison";

// Re-export the pure parity-mapping API so existing imports keep working.
export {
  FIELD_LABEL,
  PROPOSAL_FIELDS,
  ACCEPTANCE_FIELDS,
  extractionToFound,
  displayValue,
  decideDefaults,
  fieldLabelFor,
  isConflict,
  buildSourceEvidence,
  mapMaxSplBasis,
} from "@/components/spl/adiParityMapping";

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";

/** The source URL a comparison candidate carries, preferring source_url then datasheet_url. */
export const sourceUrlOf = (candidate) =>
  candidate?.record?.source_url
  || candidate?.sourceUrl
  || candidate?.record?.datasheet_url
  || candidate?.datasheetUrl
  || "";

// Same minimal row shape the Edit form expects, built from a comparison
// candidate. Kept here so the single-row and batch paths build it identically.
export function candidateToFormRow(candidate) {
  return {
    key: candidate?.id,
    rowId: candidate?.priceRecordId || null,
    productId: candidate?.productId || null,
    specificationId: candidate?.specificationId || null,
    manufacturer: candidate?.manufacturer || "",
    model: candidate?.model || "",
    price: candidate?.record?.retail_price_inc_vat ?? null,
    record: candidate?.record || null,
    specification: null,
    product: null,
  };
}

/** Build the current form values for a candidate (prefilled from its record). */
export function currentFormFor(candidate) {
  return candidate ? formFromRow(candidateToFormRow(candidate)) : {};
}

/**
 * Read one candidate's source via the existing extractModelSpecification function.
 *
 * When `options.fileUri` is supplied the source is an admin-uploaded manufacturer
 * PDF datasheet (private file storage); the backend mints a signed URL and reads
 * the PDF verbatim. Otherwise the candidate's website/datasheet URL is read as
 * before. The two paths share the same extraction rules and review surface.
 *
 * @param {object} candidate
 * @param {{fileUri?: string, fileName?: string}} [options]
 */
export async function readSourceExtraction(candidate, options = {}) {
  const fileUri = options.fileUri || null;
  const fileName = options.fileName || null;
  const res = await base44.functions.invoke("extractModelSpecification", {
    manufacturerName: candidate.manufacturer,
    model: candidate.model,
    sourceUrl: fileUri ? "" : sourceUrlOf(candidate),
    sourceType: fileUri ? "Uploaded PDF" : "Official Product Page",
    fileUri,
    fileName,
  });
  const data = res?.data ?? res;
  if (data?.error) throw new Error(data.error);
  return data;
}