// secondaryEvidenceClient.js
// ---------------------------------------------------------------------------
// Reading and accepting secondary evidence.
//
// Reading never writes. Accepting writes ONCE, deliberately: the stated values
// are merged into the specification without overwriting anything the official
// source already provided, the source itself (host, type, document, who accepted
// it and when) is recorded against the specification, the confidence is capped,
// and the RP22 comparison row is re-published when the model is already on it.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { createDraftProductsFromCandidates } from "../candidateImport.js";
import { modelKey } from "../candidateReview.js";
import { mergeExtractionIntoSpec } from "../model-first/modelFirstPersistence.js";
import { publishSpecificationToRp22 } from "../model-first/rp22ComparisonPublish.js";
import {
  SECONDARY_SOURCE_TYPE,
  confidenceCapReason,
  isSecondaryCapped,
  secondaryBasisLabel,
} from "./secondaryEvidencePolicy.js";

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

/** Fetch and inspect one admin-supplied URL. Nothing is stored. */
export async function fetchSecondaryEvidence({ url, manufacturerName, model, manufacturerWebsite }) {
  const response = await base44.functions.invoke("fetchSecondaryEvidence", {
    url,
    manufacturerName,
    model,
    manufacturerWebsite: manufacturerWebsite || "",
  });
  const data = response?.data || response;
  if (data?.error) throw new Error(data.error);
  return data;
}

/** The current specification of a product. */
export async function loadSpecificationForProduct(productId) {
  if (!productId) return null;
  const page = await base44.entities.SpeakerSpecification.filter(
    { product_id: productId },
    { sort: "-created_date", limit: 20 },
  );
  const rows = page?.items || page || [];
  return rows.find((row) => row.is_current) || rows[0] || null;
}

/**
 * The product behind a discovered candidate: the existing one when the model is
 * already in the database, otherwise a new Draft created exactly as the discovery
 * import creates it. Used so evidence can be attached straight from a candidate row.
 */
export async function ensureCandidateProduct({ manufacturer, candidate, actorName }) {
  const key = modelKey(candidate?.model);
  const page = await base44.entities.SpeakerProduct.filter({ manufacturer_id: manufacturer?.id }, { limit: 500 });
  const rows = page?.items || page || [];
  const existing = rows.find((row) => modelKey(row.model) === key);
  if (existing) {
    return { productId: existing.id, specification: await loadSpecificationForProduct(existing.id) };
  }

  const { created } = await createDraftProductsFromCandidates({
    manufacturer,
    candidates: [candidate],
    actorName,
  });
  const productId = created?.[0]?.id || null;
  return { productId, specification: productId ? await loadSpecificationForProduct(productId) : null };
}

/**
 * Accept the inspected values as secondary evidence against a specification.
 * @param {object} params { productId, specification, evidence, fields, actorName }
 * @param {Array} params.fields the inspected fields, each { field, value, source_quote, accepted }
 */
export async function persistSecondaryEvidence({ productId, specification, evidence, fields, actorName }) {
  if (!specification?.id) {
    throw new Error("This model has no specification yet — add it to the Speaker Database first.");
  }
  if (!evidence?.url) throw new Error("The secondary evidence URL is missing.");

  const today = new Date().toISOString().slice(0, 10);
  const accepted = (fields || []).filter((field) => field.accepted !== false);
  if (accepted.length === 0) throw new Error("No field was selected to accept.");

  // Existing values are never overwritten: the merge proposes only empty fields,
  // exactly as an official extraction does.
  const { patch, authority, conflicts } = mergeExtractionIntoSpec(specification, {
    reported: accepted.map((field) => ({ field: field.field, value: field.value })),
    source_type: SECONDARY_SOURCE_TYPE,
    source_url: "",
    source_date: today,
  });

  const capApplies = isSecondaryCapped(evidence);
  const basis = secondaryBasisLabel({
    hasPublishedMaxSpl: hasValue(specification.max_continuous_spl_db) || hasValue(patch.max_continuous_spl_db),
    evidence,
  });

  const storedEvidence = {
    source_type: SECONDARY_SOURCE_TYPE,
    url: evidence.url,
    host: evidence.host || "",
    document_type: evidence.document_type || "unknown",
    is_official: evidence.is_official === true,
    accepted_by: actorName || "",
    accepted_date: new Date().toISOString(),
    basis,
    confidence_cap_reason: confidenceCapReason(evidence),
    field_quotes: Object.fromEntries(
      accepted.filter((field) => field.source_quote).map((field) => [field.field, field.source_quote]),
    ),
  };

  const updated = await base44.entities.SpeakerSpecification.update(specification.id, {
    ...patch,
    field_authority: authority,
    secondary_evidence: storedEvidence,
    // A capped source can never carry the specification at published quality.
    ...(capApplies ? { confidence: "C", evidence_quality: "Engineering Estimate" } : {}),
  });

  const appliedFields = Object.keys(patch).filter((key) => patch[key] !== undefined);
  if (appliedFields.length > 0) {
    await base44.entities.SpeakerChangeHistory.bulkCreate(appliedFields.map((field) => ({
      product_id: productId || specification.product_id,
      field_changed: field,
      old_value: "",
      new_value: String(patch[field]),
      source: SECONDARY_SOURCE_TYPE,
      change_type: "Updated",
      change_reason: "Document Revision",
    })));
  }

  // Already on the RP22 comparison? Refresh that row so the capped evidence and
  // the basis phrase travel with the values.
  let competitorUpdated = false;
  if (specification.rp22_published_competitor_id && (productId || specification.product_id)) {
    const product = await base44.entities.SpeakerProduct.get(productId || specification.product_id);
    if (product) {
      await publishSpecificationToRp22({
        product,
        specification: updated,
        manufacturerName: product.manufacturer_name || "",
        actorName,
      });
      competitorUpdated = true;
    }
  }

  return { updated, applied: appliedFields, conflicts, basis, capApplies, competitorUpdated };
}