// modelFirstPersistence.js
// ---------------------------------------------------------------------------
// Persistence for the model-first workflow: create the product and draft
// specification from a typed manufacturer + model, merge extracted facts into
// editable fields, and persist data-quality warnings.
//
// Reuses the existing wizard persistence (save edits with change history,
// approve, submit for review) — nothing is re-implemented here.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { validateDraftSpec } from "../add-speaker/addSpeakerValidation.js";
import { ALL_SPEC_FIELDS } from "../add-speaker/specFieldDefinitions.js";
import { findRp22Gaps } from "./rp22ComparisonPublish.js";

const NUMERIC_KEYS = new Set(ALL_SPEC_FIELDS.filter((f) => f.type === "number").map((f) => f.key));

// A placeholder is the absence of a published value, not a value. A new draft
// starts with "unknown" / "unspecified" in the basis fields, so an extraction that
// states a real figure may fill them in. A stated value is never overwritten.
const PLACEHOLDER_VALUES = new Set(["unknown", "unspecified"]);
const isPlaceholder = (value) => value === null || value === undefined
  || String(value).trim() === ""
  || PLACEHOLDER_VALUES.has(String(value).trim().toLowerCase());

/**
 * Resolve the manufacturer by name, creating it when the admin added one.
 * The website is stored here because it is the official-source authority.
 */
export async function ensureManufacturer({ name, website }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Manufacturer name is required");

  const page = await base44.entities.SpeakerManufacturer.filter({ name: cleanName }, { limit: 10 });
  const rows = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : [];
  if (rows.length > 0) return rows[0];

  const created = await base44.entities.SpeakerManufacturer.create({
    name: cleanName,
    website: String(website || "").trim(),
    status: "Active",
  });
  return created;
}

/**
 * Create the product identity plus its first specification in Draft.
 * Nothing is inferred: the specification starts empty apart from provenance.
 */
export async function createModelFirstDraft({ manufacturer, model, notes, accountId, actorName }) {
  const cleanModel = String(model || "").trim();
  if (!manufacturer?.id) throw new Error("Manufacturer is required");
  if (!cleanModel) throw new Error("Model is required");

  const product = await base44.entities.SpeakerProduct.create({
    manufacturer_id: manufacturer.id,
    manufacturer_name: manufacturer.name || "",
    model: cleanModel,
    full_product_name: `${manufacturer.name || ""} ${cleanModel}`.trim(),
    status: "Unknown",
    import_status: "Manual",
    notes: notes || "",
  });

  const specification = await base44.entities.SpeakerSpecification.create({
    product_id: product.id,
    version_label: "Current",
    is_current: true,
    approval_status: "Draft",
    confidence: "",
    evidence_quality: "Unknown",
    sensitivity_basis: "unknown",
    max_spl_basis: "unknown",
    measurement_space: "unspecified",
  });

  await base44.entities.SpeakerProduct.update(product.id, {
    current_specification_id: specification.id,
  });

  await base44.entities.SpeakerChangeHistory.create({
    product_id: product.id,
    field_changed: "product",
    old_value: "",
    new_value: `Created ${manufacturer.name || ""} ${cleanModel}`.trim(),
    source: actorName || "Manual Edit",
    change_type: "Created",
    change_reason: "Administrative",
  });

  return { product: { ...product, current_specification_id: specification.id }, specification };
}

/**
 * Merge an extraction into the specification.
 * Only fields the extraction actually reported (or reported ambiguously) are
 * proposed; already-populated values are never silently overwritten.
 */
export function mergeExtractionIntoSpec(specification, extraction) {
  const patch = {};
  const authority = {};
  const ambiguousFields = [];
  const conflicts = [];

  const apply = (entry, ambiguous) => {
    const key = entry.field;
    if (!ALL_SPEC_FIELDS.some((f) => f.key === key)) return;
    const value = NUMERIC_KEYS.has(key) && entry.value !== "" ? Number(entry.value) : entry.value;
    if (value === "" || value === null || Number.isNaN(value)) return;

    const current = specification?.[key];
    if (!isPlaceholder(current)) {
      if (String(current) !== String(value)) conflicts.push({ key, current, extracted: value });
      return;
    }
    patch[key] = value;
    authority[key] = extraction?.source_type || "Official Product Page";
    if (ambiguous) ambiguousFields.push(key);
  };

  for (const entry of extraction?.reported || []) apply(entry, false);
  for (const entry of extraction?.ambiguous || []) apply(entry, true);

  if (extraction?.source_date) patch.source_date = extraction.source_date;
  if (extraction?.source_url) patch.datasheet_url = extraction.source_url;

  return { patch, authority, ambiguousFields, conflicts };
}

/**
 * Validate and persist data-quality warnings: the existing field validation plus
 * the RP22 comparison readiness gaps, so a missing engineering value is visible
 * as a warning rather than silently absent.
 */
export async function persistModelFirstWarnings(productId, specification) {
  const validation = validateDraftSpec(specification);
  const gaps = findRp22Gaps(specification);

  try {
    await base44.entities.SpeakerDataQuality.deleteMany({
      product_id: productId,
      status: { $nin: ["Resolved", "Ignored"] },
    });
  } catch {
    // Non-fatal — continue
  }

  const records = validation.issues.map((issue) => ({
    product_id: productId,
    field: issue.field,
    severity: issue.severity,
    status: issue.status,
    message: issue.message,
  }));

  for (const gap of gaps.critical) {
    records.push({
      product_id: productId,
      field: gap.key,
      severity: "Critical",
      status: "Missing",
      message: `${gap.label} is required before this model can be compared on RP22 P12/P13`,
    });
  }
  for (const key of gaps.advisory) {
    records.push({
      product_id: productId,
      field: key,
      severity: "Information",
      status: "Missing",
      message: `${key} is not populated — comparison still works, evidence is thinner`,
    });
  }

  if (records.length > 0) {
    await base44.entities.SpeakerDataQuality.bulkCreate(records);
  }

  return { validation, gaps };
}

/** Readiness summary used to gate the publish action in the UI. */
export function rp22Readiness(specification) {
  const gaps = findRp22Gaps(specification);
  const approved = specification?.approval_status === "Approved";
  return {
    gaps,
    approved,
    canPublish: approved,
  };
}