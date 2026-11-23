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
import { publishIncompleteManualCompetitor } from "./publishIncompleteCompetitor";
import {
  SENSITIVITY_REFERENCES as _SENSITIVITY_REFERENCES,
  POWER_BASES as _POWER_BASES,
  MEASUREMENT_SPACES as _MEASUREMENT_SPACES,
  SPL_BASES as _SPL_BASES,
} from "@/components/spl/comparisonFieldOptions";

// Re-export the shared, dependency-free option lists so existing imports keep
// working. The single source of definition lives in comparisonFieldOptions so
// the pure parity-mapping module and its tests can use them without the base44
// chain.
export const SENSITIVITY_REFERENCES = _SENSITIVITY_REFERENCES;
export const POWER_BASES = _POWER_BASES;
export const MEASUREMENT_SPACES = _MEASUREMENT_SPACES;
export const SPL_BASES = _SPL_BASES;

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
    power_w_amp: "",
    power_w_min: "",
    peak_power_w: "",
    power_basis: "amplifier",
    frequency_response_low_hz: "",
    frequency_response_high_hz: "",
    frequency_response_tolerance_db: "",
    max_spl_db: "",
    max_peak_spl_db: "",
    max_spl_basis: "manufacturer unspecified",
    measurement_space: "unspecified",
    price: "",
    locked_system: false,
    locked_amp_w: "",
  };
}

/** Prefill from the row being edited — canonical values first, stored values otherwise. */
export function formFromRow(row) {
  if (!row) return emptySpeakerForm();
  const spec = row.specification || {};
  const record = row.record || {};
  const continuous = spec.power_handling_continuous_w ?? null;
  const ampMax = spec.recommended_amp_max_w ?? record.recommended_amp_max_w ?? null;
  const ampMin = spec.recommended_amp_min_w ?? record.recommended_amp_min_w ?? null;
  const peak = spec.power_handling_peak_w ?? spec.peak_power_w ?? record.peak_power_w ?? null;
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
    power_w_amp: hasValue(ampMax) ? ampMax : "",
    power_w_min: hasValue(ampMin) ? ampMin : "",
    peak_power_w: hasValue(peak) ? peak : "",
    power_basis: hasValue(continuous) ? "continuous" : (hasValue(ampMax) || hasValue(record.continuous_power_w) ? "amplifier" : "amplifier"),
    frequency_response_low_hz: spec.frequency_response_low_hz ?? record.frequency_response_low_hz ?? "",
    frequency_response_high_hz: spec.frequency_response_high_hz ?? record.frequency_response_high_hz ?? "",
    frequency_response_tolerance_db: spec.frequency_response_tolerance_db ?? record.frequency_response_tolerance_db ?? "",
    max_spl_db: spec.max_continuous_spl_db ?? record.published_max_continuous_spl_db_1m ?? "",
    max_peak_spl_db: spec.max_peak_spl_db ?? record.published_max_peak_spl_db_1m ?? "",
    max_spl_basis: SPL_BASIS_VALUES.has(spec.max_spl_basis) ? spec.max_spl_basis : "manufacturer unspecified",
    measurement_space: ["half-space", "free-space", "unspecified"].includes(spec.measurement_space)
      ? spec.measurement_space
      : (record.measurement_space_basis === "Half Space" ? "half-space" : record.measurement_space_basis === "Full Space" ? "free-space" : "unspecified"),
    price: row.price ?? "",
    locked_system: spec.locked_amplification_system === true || record.locked_amplification_system === true,
    locked_amp_w: hasValue(spec.locked_amplifier_power_w) ? spec.locked_amplifier_power_w
      : (hasValue(record.locked_amplifier_power_w) ? record.locked_amplifier_power_w : ""),
  };
}

/**
 * The specification fields this form owns. Only what the administrator supplied
 * is written — a blank field is left as it is, never overwritten, and no
 * unrelated specification field is touched.
 */
export function buildSpecPatch(values, today, adiEvidence = null) {
  const patch = {
    source_date: today,
    last_verified: today,
    primary_source: "Official Product Page",
    evidence_quality: "Manufacturer Published",
    confidence: "A",
    measurement_space: values.measurement_space || "unspecified",
  };
  // Audit trail of the last ADI source read the administrator accepted values
  // from. Carries no engineering value; never feeds the RP22 engine.
  if (adiEvidence && typeof adiEvidence === "object") {
    patch.adi_source_evidence = adiEvidence;
  }
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
  // Nominal impedance is saved independently of the sensitivity reference. A
  // published impedance is manufacturer data in its own right and must persist
  // even when the reference is unstated — the 2.83 V / 1 m assumption relies on
  // it for normalisation. The assumed reference itself is never written into
  // the manufacturer's published sensitivity_basis field.
  const impedance = numberOrNull(values.impedance_ohm);
  if (impedance !== null) {
    patch.nominal_impedance_ohm = impedance;
    authority.nominal_impedance_ohm = "Official Product Page";
  }

  const power = numberOrNull(values.power_w);
  const powerAmp = numberOrNull(values.power_w_amp);
  if (power !== null) {
    // The administrator states which kind of figure this is. A recommended
    // amplifier maximum is never written as a continuous speaker rating, and an
    // existing rating or recommendation is never deleted by this form.
    if (values.power_basis === "continuous") {
      patch.power_handling_continuous_w = power;
      authority.power_handling_continuous_w = "Official Product Page";
      // When a separate recommended amplifier maximum was also accepted, write
      // it to its own field so both power authorities survive — the continuous
      // rating drives the calculation, the amplifier max is retained as
      // published evidence.
      if (powerAmp !== null && powerAmp !== power) {
        patch.recommended_amp_max_w = powerAmp;
        authority.recommended_amp_max_w = "Official Product Page";
        const powerMin = numberOrNull(values.power_w_min);
        if (powerMin !== null) {
          patch.recommended_amp_min_w = powerMin;
          authority.recommended_amp_min_w = "Official Product Page";
        }
      }
    } else {
      patch.recommended_amp_max_w = power;
      authority.recommended_amp_max_w = "Official Product Page";
      // Preserve the recommended amplifier range minimum when the manufacturer
      // states a range. The maximum is what the P12/P13 calculation uses; the
      // minimum is kept so both endpoints survive.
      const powerMin = numberOrNull(values.power_w_min);
      if (powerMin !== null) {
        patch.recommended_amp_min_w = powerMin;
        authority.recommended_amp_min_w = "Official Product Page";
      }
    }
  } else if (powerAmp !== null) {
    // The recommended amplifier maximum was accepted as the sole power
    // authority (no continuous rating was stated, so power_w is empty).
    // The Read Source proposal surfaces this as power_w_amp; buildSpecPatch
    // must carry it into the patch so the live proposed-status calculation
    // and the post-save comparison both see recommended_amp_max_w.
    patch.recommended_amp_max_w = powerAmp;
    authority.recommended_amp_max_w = "Official Product Page";
    const powerMin = numberOrNull(values.power_w_min);
    if (powerMin !== null) {
      patch.recommended_amp_min_w = powerMin;
      authority.recommended_amp_min_w = "Official Product Page";
    }
  }

  const freqLow = numberOrNull(values.frequency_response_low_hz);
  if (freqLow !== null) {
    patch.frequency_response_low_hz = freqLow;
    authority.frequency_response_low_hz = "Official Product Page";
  }
  const freqHigh = numberOrNull(values.frequency_response_high_hz);
  if (freqHigh !== null) {
    patch.frequency_response_high_hz = freqHigh;
    authority.frequency_response_high_hz = "Official Product Page";
  }
  const freqTol = numberOrNull(values.frequency_response_tolerance_db);
  if (freqTol !== null) {
    patch.frequency_response_tolerance_db = freqTol;
    authority.frequency_response_tolerance_db = "Official Product Page";
  }

  const maxSpl = numberOrNull(values.max_spl_db);
  if (maxSpl !== null) {
    const resolvedBasis = SPL_BASIS_VALUES.has(values.max_spl_basis) ? values.max_spl_basis : "manufacturer unspecified";
    // A manufacturer-stated max SPL whose measurement basis is NOT explicitly
    // established ("manufacturer unspecified") must never be assigned to the
    // continuous or peak SPL capability fields — it would make the row eligible
    // for a P12/P13 calculation the evidence does not support. The figure is
    // preserved as manufacturer-stated advisory text in max_spl_test_conditions
    // so the information panel can display it without the engine treating it as
    // published continuous capability. Only a basis the manufacturer explicitly
    // stated (AES, IEC, continuous, peak, calculated) is written to
    // max_continuous_spl_db.
    if (resolvedBasis === "manufacturer unspecified" || resolvedBasis === "unknown") {
      patch.max_spl_basis = resolvedBasis;
      authority.max_spl_basis = "Official Product Page";
      patch.max_spl_test_conditions = `Manufacturer states ${maxSpl} dB at 1 m; measurement basis not specified by manufacturer.`;
      authority.max_spl_test_conditions = "Official Product Page";
    } else {
      patch.max_continuous_spl_db = maxSpl;
      patch.max_spl_basis = resolvedBasis;
      authority.max_continuous_spl_db = "Official Product Page";
      authority.max_spl_basis = "Official Product Page";
    }
  }

  // Peak SPL is kept separate from continuous — it is advisory evidence that
  // travels with the comparison row (published_max_peak_spl_db_1m) and never
  // drives the P12/P13 calculation.
  const peakSpl = numberOrNull(values.max_peak_spl_db);
  if (peakSpl !== null) {
    patch.max_peak_spl_db = peakSpl;
    authority.max_peak_spl_db = "Official Product Page";
  }

  // Peak power handling is saved independently of continuous and recommended
  // amplifier power. It is the canonical RP22 peak-power field and feeds the
  // 50% peak-to-continuous fallback when no stronger power authority exists.
  // The assumed continuous-equivalent value is a downstream calculation, never
  // written here as a manufacturer value.
  const peakPower = numberOrNull(values.peak_power_w);
  if (peakPower !== null) {
    patch.power_handling_peak_w = peakPower;
    authority.power_handling_peak_w = "Official Product Page";
  }

  // Manufacturer-locked amplification system. Explicit authority — never
  // inferred from manufacturer name or a recommended amplifier figure alone.
  // The admin sets this checkbox when the speaker is part of a locked system
  // (e.g. Steinway Lyngdorf). The locked amplifier power is the fixed
  // comparison amplifier power for such systems.
  if (values.locked_system === true) {
    patch.locked_amplification_system = true;
    authority.locked_amplification_system = "Official Product Page";
    const lockedW = numberOrNull(values.locked_amp_w);
    if (lockedW !== null) {
      patch.locked_amplifier_power_w = lockedW;
      authority.locked_amplifier_power_w = "Official Product Page";
    }
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
export async function saveSpeakerComparison({ values, row = null, actorName, adiEvidence = null }) {
  const typedManufacturer = String(values.manufacturer || "").trim();
  const model = String(values.model || "").trim();
  if (!typedManufacturer || !model) throw new Error("Manufacturer and speaker model are required.");

  const today = todayIso();
  const { patch, authority } = buildSpecPatch(values, today, adiEvidence);

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
  } else {
    // Manual INCOMPLETE path: persist a shared competitor identity row so the
    // speaker is selectable in the comparison library while remaining
    // non-gradeable. The specification is NOT approved and no P12/P13
    // capability is produced; normalizeCompetitor() yields p12_p13_eligible
    // === false because no technical acoustic fields are written.
    const result = await publishIncompleteManualCompetitor({
      product: readyProduct,
      specification: { ...mergedSpecification, id: specification.id },
      manufacturerName: manufacturer.name || manufacturerName,
      sourceUrl: hasValue(values.source_url) ? values.source_url : "",
      datasheetUrl: "",
      actorName,
    });
    comparisonRecordId = result.competitorId || comparisonRecordId;
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
    // The canonical missing-fields list the form renders. Always an array so
    // the post-save result never throws on .length for an ineligible record.
    missing: readiness.missingCriticalLabels || [],
    gaps: findRp22Gaps(mergedSpecification),
    price,
  };
}