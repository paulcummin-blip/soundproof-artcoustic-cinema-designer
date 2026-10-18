// saveSpeakerComparison.js
// ---------------------------------------------------------------------------
// One action, one write path: Save & Compare.
//
// The administrator enters what the manufacturer publishes. This module records
// it on the EXISTING canonical product and specification (creating them only
// when the model is genuinely new), records the retail price on the EXISTING
// comparison record, and — when the information is enough for a defensible
// P12/P13 comparison — approves and publishes through the existing bridge, so the
// speaker appears in the comparison immediately.
//
// Nothing is re-implemented: persistence, approval, publication, change history
// and data-quality records all go through the existing modules. Nothing is
// invented: a field the manufacturer does not publish stays blank, and when the
// information is insufficient the save is kept and the missing evidence named.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { normaliseManufacturerIdentity, sameCompetitorIdentity } from "@/components/utils/spl/manufacturerIdentity";
import { parsePriceEntry } from "@/components/spl/CompetitorPriceManager";
import { comparisonReadiness } from "@/components/admin/speaker-db/comparisonReadiness";
import { findRp22Gaps, publishSpecificationToRp22 } from "@/components/admin/speaker-db/model-first/rp22ComparisonPublish";
import { approveSpecification, saveSpecEdits } from "@/components/admin/speaker-db/add-speaker/addSpeakerPersistence";
import { createModelFirstDraft, ensureManufacturer, persistModelFirstWarnings } from "@/components/admin/speaker-db/model-first/modelFirstPersistence";

export const SENSITIVITY_REFERENCES = [
  { value: "2.83V/1m", label: "2.83 V / 1 m" },
  { value: "1W/1m", label: "1 W / 1 m" },
  { value: "unknown", label: "Not stated" },
];

export const POWER_BASES = [
  { value: "amplifier", label: "Recommended amplifier maximum" },
  { value: "continuous", label: "Continuous speaker rating" },
];

export const MEASUREMENT_SPACES = [
  { value: "unspecified", label: "Unspecified" },
  { value: "half-space", label: "Half Space" },
  { value: "free-space", label: "Full Space" },
];

// How the manufacturer states a published maximum SPL. The stored values are the
// existing basis vocabulary, so the RP22 evidence authority classifies them
// exactly as it classifies every other model.
export const SPL_BASES = [
  { value: "continuous", label: "Measured / rated figure" },
  { value: "calculated", label: "Calculated figure" },
  { value: "manufacturer unspecified", label: "Not stated" },
];

const REFERENCE_VALUES = new Set(SENSITIVITY_REFERENCES.map((option) => option.value));
const SPL_BASIS_VALUES = new Set(SPL_BASES.map((option) => option.value));

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";
const numberOrNull = (value) => {
  if (!hasValue(value)) return null;
  const parsed = Number(String(value).replace(/[,£\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export function emptySpeakerForm() {
  return {
    manufacturer: "",
    model: "",
    source_url: "",
    sensitivity_db: "",
    sensitivity_reference: "2.83V/1m",
    impedance_ohm: "",
    power_w: "",
    power_basis: "amplifier",
    max_spl_db: "",
    max_spl_basis: "manufacturer unspecified",
    measurement_space: "unspecified",
    price: "",
  };
}

/** Prefill from the row being edited — canonical values first, stored values otherwise. */
export function formFromRow(row) {
  if (!row) return emptySpeakerForm();
  const spec = row.specification || {};
  const record = row.record || {};
  const continuous = spec.power_handling_continuous_w ?? null;
  const ampMax = spec.recommended_amp_max_w ?? record.recommended_amp_max_w ?? null;
  const reference = REFERENCE_VALUES.has(spec.sensitivity_basis)
    ? spec.sensitivity_basis
    : (REFERENCE_VALUES.has(record.sensitivity_reference) ? record.sensitivity_reference : "unknown");

  return {
    manufacturer: row.manufacturer || "",
    model: row.model || "",
    source_url: row.product?.official_product_url || record.source_url || "",
    sensitivity_db: spec.sensitivity_db ?? record.sensitivity_value_db ?? "",
    sensitivity_reference: reference,
    impedance_ohm: spec.nominal_impedance_ohm ?? record.rated_impedance_ohm ?? "",
    power_w: hasValue(continuous) ? continuous : (hasValue(ampMax) ? ampMax : (record.continuous_power_w ?? "")),
    power_basis: hasValue(continuous) ? "continuous" : (hasValue(ampMax) || hasValue(record.continuous_power_w) ? "amplifier" : "amplifier"),
    max_spl_db: spec.max_continuous_spl_db ?? record.published_max_continuous_spl_db_1m ?? "",
    max_spl_basis: SPL_BASIS_VALUES.has(spec.max_spl_basis) ? spec.max_spl_basis : "manufacturer unspecified",
    measurement_space: ["half-space", "free-space", "unspecified"].includes(spec.measurement_space)
      ? spec.measurement_space
      : (record.measurement_space_basis === "Half Space" ? "half-space" : record.measurement_space_basis === "Full Space" ? "free-space" : "unspecified"),
    price: row.price ?? "",
  };
}

/**
 * The specification fields this form owns. Only what the administrator supplied
 * is written — a blank field is left as it is, never overwritten, and no
 * unrelated specification field is touched.
 */
export function buildSpecPatch(values, today) {
  const patch = {
    source_date: today,
    last_verified: today,
    primary_source: "Official Product Page",
    evidence_quality: "Manufacturer Published",
    confidence: "A",
    measurement_space: values.measurement_space || "unspecified",
  };
  const authority = {};

  const sensitivity = numberOrNull(values.sensitivity_db);
  if (sensitivity !== null) {
    patch.sensitivity_db = sensitivity;
    authority.sensitivity_db = "Official Product Page";
  }
  if (hasValue(values.sensitivity_reference)) {
    patch.sensitivity_basis = REFERENCE_VALUES.has(values.sensitivity_reference) ? values.sensitivity_reference : "unknown";
    authority.sensitivity_basis = "Official Product Page";
  }
  // Impedance is recorded with the 2.83 V reference it is needed for.
  const impedance = numberOrNull(values.impedance_ohm);
  if (values.sensitivity_reference === "2.83V/1m" && impedance !== null) {
    patch.nominal_impedance_ohm = impedance;
    authority.nominal_impedance_ohm = "Official Product Page";
  }

  const power = numberOrNull(values.power_w);
  if (power !== null) {
    // The administrator states which kind of figure this is. A recommended
    // amplifier maximum is never written as a continuous speaker rating, and an
    // existing rating or recommendation is never deleted by this form.
    if (values.power_basis === "continuous") {
      patch.power_handling_continuous_w = power;
      authority.power_handling_continuous_w = "Official Product Page";
    } else {
      patch.recommended_amp_max_w = power;
      authority.recommended_amp_max_w = "Official Product Page";
    }
  }

  const maxSpl = numberOrNull(values.max_spl_db);
  if (maxSpl !== null) {
    patch.max_continuous_spl_db = maxSpl;
    patch.max_spl_basis = SPL_BASIS_VALUES.has(values.max_spl_basis) ? values.max_spl_basis : "manufacturer unspecified";
    authority.max_continuous_spl_db = "Official Product Page";
    authority.max_spl_basis = "Official Product Page";
  }

  return { patch, authority };
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

/**
 * Can this information support a defensible P12/P13 comparison?
 * The same mapping and normalisation the dealer's comparison page runs, so the
 * answer here and the grade there can never disagree.
 */
export function assessSpeakerForm(values, existingSpecification) {
  const { patch } = buildSpecPatch(values, todayIso());
  const specification = { ...(existingSpecification || {}), ...patch };
  const product = {
    manufacturer_name: values.manufacturer || "",
    model: values.model || "",
    official_product_url: values.source_url || "",
  };
  const readiness = comparisonReadiness({ product, specification });
  return {
    readiness,
    gaps: findRp22Gaps(specification),
    specification,
    ready: readiness.eligible === true,
    missing: readiness.missingCriticalLabels,
  };
}

/**
 * Reuse the manufacturer already in the database when the typed name is the same
 * manufacturer under a variant spelling — "MK Sound", "M and K Sound" and
 * "M&K Sound" are one manufacturer, so a save never creates a second record.
 */
async function resolveManufacturerName(typed) {
  const clean = String(typed || "").trim();
  const result = await base44.entities.SpeakerManufacturer.list("-created_date", 200);
  const items = Array.isArray(result) ? result : result?.items || [];
  const match = items.find((row) => normaliseManufacturerIdentity(row.name) === normaliseManufacturerIdentity(clean));
  return match?.name || clean;
}

async function findProductByIdentity({ manufacturerName, model }) {
  const result = await base44.entities.SpeakerProduct.filter({ model }, { limit: 50 });
  const items = Array.isArray(result) ? result : result?.items || [];
  return items.find((product) => sameCompetitorIdentity(
    { manufacturer: product.manufacturer_name, model: product.model },
    { manufacturer: manufacturerName, model },
  )) || null;
}

async function currentSpecification(productId) {
  const result = await base44.entities.SpeakerSpecification.filter({ product_id: productId });
  const items = Array.isArray(result) ? result : result?.items || [];
  return items.find((spec) => spec.id && spec.is_current !== false) || items[0] || null;
}

/**
 * Save & Compare.
 * @returns {object} { productId, specificationId, comparisonRecordId, published,
 *   readiness, missing, price, created }
 */
export async function saveSpeakerComparison({ values, row = null, actorName }) {
  const typedManufacturer = String(values.manufacturer || "").trim();
  const model = String(values.model || "").trim();
  if (!typedManufacturer || !model) throw new Error("Manufacturer and speaker model are required.");
  if (!hasValue(values.sensitivity_db) && !hasValue(values.max_spl_db)) {
    throw new Error("Enter the manufacturer's sensitivity or their published maximum continuous SPL.");
  }

  const today = todayIso();
  const { patch, authority } = buildSpecPatch(values, today);

  const manufacturerName = await resolveManufacturerName(typedManufacturer);
  const manufacturer = await ensureManufacturer({ name: manufacturerName, website: "" });

  // Existing canonical record, reused — a second save never creates a duplicate.
  let product = row?.productId ? await base44.entities.SpeakerProduct.get(row.productId) : null;
  if (!product) product = await findProductByIdentity({ manufacturerName, model });

  let specification = product ? await currentSpecification(product.id) : null;
  let created = false;

  if (!product) {
    const draft = await createModelFirstDraft({ manufacturer, model, actorName });
    product = draft.product;
    specification = draft.specification;
    created = true;
  } else if (!specification) {
    specification = await base44.entities.SpeakerSpecification.create({
      product_id: product.id,
      version_label: "Current",
      is_current: true,
      approval_status: "Draft",
      confidence: "",
      evidence_quality: "Unknown",
    });
    await base44.entities.SpeakerProduct.update(product.id, { current_specification_id: specification.id });
  }

  const mergedSpecification = {
    ...specification,
    ...patch,
    field_authority: { ...(specification.field_authority || {}), ...authority },
  };

  // Existing persistence: writes the specification and logs every changed field.
  await saveSpecEdits({
    productId: product.id,
    specId: specification.id,
    oldSpec: specification,
    newSpec: mergedSpecification,
    changeReason: "Manual Correction",
  });

  if (hasValue(values.source_url) && values.source_url !== product.official_product_url) {
    await base44.entities.SpeakerProduct.update(product.id, { official_product_url: values.source_url });
  }

  const readyProduct = { ...product, official_product_url: values.source_url || product.official_product_url || "" };
  const readiness = comparisonReadiness({ product: readyProduct, specification: mergedSpecification });

  // Publish only when a defensible comparison exists. The administrator's Save &
  // Compare is the explicit sign-off; the approval and publication mechanics are
  // the existing ones, and an insufficient entry is saved without being published.
  let comparisonRecordId = row?.rowId || null;
  let published = false;
  if (readiness.eligible === true) {
    await approveSpecification({ productId: product.id, specId: specification.id, reviewerName: actorName });
    const result = await publishSpecificationToRp22({
      product: readyProduct,
      specification: { ...mergedSpecification, id: specification.id, approval_status: "Approved" },
      manufacturerName: manufacturer.name || manufacturerName,
      actorName,
    });
    comparisonRecordId = result.competitorId || comparisonRecordId;
    published = true;
  }

  // The retail price lives on the comparison record. A price the administrator
  // supplied is written as it stands; a blank entry only clears a price they were
  // shown and deliberately removed. Adding a model therefore can never wipe the
  // price already held for it, and a price is never stored as zero.
  const price = parsePriceEntry(values.price);
  const priorPrice = row?.price ?? null;
  const clearsShownPrice = price.valid && price.value === null && row !== null && priorPrice !== null;
  if (comparisonRecordId && price.valid && (price.value !== null || clearsShownPrice)) {
    await base44.entities.CompetitorSpeaker.update(comparisonRecordId, {
      retail_price_inc_vat: price.value,
      currency: "GBP",
    });
  }

  // Internal data-quality trail: what is still missing, kept for audit.
  try {
    await persistModelFirstWarnings(product.id, mergedSpecification);
  } catch {
    // Non-fatal — the save itself has already been written.
  }

  return {
    productId: product.id,
    specificationId: specification.id,
    comparisonRecordId,
    published,
    created,
    readiness,
    gaps: findRp22Gaps(mergedSpecification),
    price,
  };
}