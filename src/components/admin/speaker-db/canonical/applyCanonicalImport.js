// applyCanonicalImport.js
// ---------------------------------------------------------------------------
// The only writer for a canonical Speaker Database import.
//
// It executes exactly the entries the dry-run preview produced: it creates the
// manufacturers and products that were reported as new, updates only the fields
// that were reported as changed, and keeps approved or published specifications
// as history by creating a NEW version rather than overwriting them.
//
// Two things it deliberately never does:
//   • it never touches CompetitorSpeaker — importing is not publishing;
//   • it never sets an approval state other than Awaiting Review, so imported
//     data always goes through the existing review and publish workflow.
//
// Every write is recorded on the batch so the whole import can be rolled back.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { CANONICAL_SCHEMA_VERSION } from "./canonicalSchema.js";

// Carried forward into a new specification version, but never inherited from
// the version it replaces: identity, linkage and every approval/publication
// stamp belong to the version they were written on.
const NOT_INHERITED_SPEC_KEYS = new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by_id",
  "product_id",
  "is_current",
  "approval_status",
  "reviewed_by",
  "reviewed_date",
  "approved_by",
  "approved_date",
  "rp22_published_competitor_id",
  "rp22_published_at",
]);

const IMPORT_ACTOR = "Speaker Database import";

function inheritedSpecification(previous) {
  const carried = {};
  if (!previous) return carried;
  for (const [key, value] of Object.entries(previous)) {
    if (NOT_INHERITED_SPEC_KEYS.has(key)) continue;
    carried[key] = value;
  }
  return carried;
}

function hasValues(object) {
  return Object.keys(object || {}).length > 0;
}

function batchId() {
  return `spk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {object} params { plan, actorName, fileName, schemaVersion }
 * @returns {object} the applied batch summary
 */
export async function applyCanonicalImport({ plan, actorName, fileName, schemaVersion }) {
  const appliedAt = new Date().toISOString();
  const id = batchId();
  const createdManufacturerByKey = new Map();
  const batchEntries = [];
  const historyRows = [];

  let manufacturersCreated = 0;
  let productsCreated = 0;
  let productsUpdated = 0;
  let specificationsCreated = 0;
  let specificationsUpdated = 0;

  const actionable = plan.entries.filter((entry) => entry.kind !== "unchanged" && entry.kind !== "error");

  for (const entry of actionable) {
    // --- manufacturer ------------------------------------------------------
    let manufacturerId = entry.identities.manufacturer_id || null;
    let manufacturerCreated = false;
    let cascadedProducts = 0;

    if (entry.manufacturerRename) {
      await base44.entities.SpeakerManufacturer.update(entry.manufacturerRename.id, { name: entry.manufacturerRename.to });
      const cascade = await base44.entities.SpeakerProduct.updateMany(
        { manufacturer_id: entry.manufacturerRename.id },
        { $set: { manufacturer_name: entry.manufacturerRename.to } },
      );
      cascadedProducts = Number(cascade?.updated_count ?? cascade?.updated ?? 0) || 0;
    }

    if (!manufacturerId && entry.createsManufacturer) {
      const existing = createdManufacturerByKey.get(entry.manufacturerKey);
      if (existing) {
        manufacturerId = existing;
      } else {
        const created = await base44.entities.SpeakerManufacturer.create({
          name: entry.manufacturerName,
          status: "Active",
        });
        manufacturerId = created?.id || null;
        createdManufacturerByKey.set(entry.manufacturerKey, manufacturerId);
        manufacturerCreated = true;
        manufacturersCreated += 1;
      }
    }

    // --- product -----------------------------------------------------------
    let productId = entry.identities.product_id || null;
    let productCreated = false;
    const productPayload = { ...entry.proposedProduct };
    delete productPayload.manufacturer_name;

    if (entry.createsProduct) {
      const created = await base44.entities.SpeakerProduct.create({
        ...productPayload,
        manufacturer_id: manufacturerId,
        manufacturer_name: entry.manufacturerName,
      });
      productId = created?.id || null;
      productCreated = true;
      productsCreated += 1;
    } else if (hasValues(entry.proposedProduct)) {
      await base44.entities.SpeakerProduct.update(productId, entry.proposedProduct);
      productsUpdated += 1;
    }

    // --- specification -----------------------------------------------------
    let specificationId = entry.identities.specification_id || null;
    let specificationCreated = false;
    let specificationPayload = {};

    if (entry.createsNewSpecificationVersion) {
      const previous = entry.identities.specification_id
        ? await base44.entities.SpeakerSpecification.get(entry.identities.specification_id)
        : null;
      specificationPayload = {
        ...inheritedSpecification(previous),
        ...entry.proposedSpec,
        product_id: productId,
        version_label: entry.proposedSpec.version_label
          || previous?.version_label
          || `Import ${appliedAt.slice(0, 10)}`,
        is_current: true,
        approval_status: "Awaiting Review",
      };
      const created = await base44.entities.SpeakerSpecification.create(specificationPayload);
      specificationId = created?.id || null;
      specificationCreated = true;
      specificationsCreated += 1;

      if (previous) {
        await base44.entities.SpeakerSpecification.update(previous.id, {
          is_current: false,
          approval_status: "Superseded",
        });
      }
      if (productId) {
        await base44.entities.SpeakerProduct.update(productId, { current_specification_id: specificationId });
      }
    } else if (specificationId && hasValues(entry.proposedSpec)) {
      // A draft specification is safe to update in place; it is not history yet.
      specificationPayload = { ...entry.proposedSpec, approval_status: "Awaiting Review" };
      await base44.entities.SpeakerSpecification.update(specificationId, specificationPayload);
      specificationsUpdated += 1;
    }

    // --- audit trail -------------------------------------------------------
    for (const change of [...entry.manufacturerChanges, ...entry.productChanges, ...entry.specChanges]) {
      historyRows.push({
        product_id: productId || "",
        field_changed: change.key,
        old_value: change.current === "—" || change.current === "Not published" ? "" : String(change.current),
        new_value: change.proposed === "—" || change.proposed === "Not published" ? "" : String(change.proposed),
        source: actorName || IMPORT_ACTOR,
        change_type: entry.createsProduct ? "Created" : "Updated",
        change_reason: `Spreadsheet import (${fileName || "workbook"})`,
      });
    }

    batchEntries.push({
      row_number: entry.rowNumber,
      kind: entry.kind,
      manufacturer_id: manufacturerId,
      manufacturer_name: entry.manufacturerName,
      manufacturer_key: entry.manufacturerKey,
      product_id: productId,
      model: entry.model,
      specification_id: specificationId,
      previous_specification_id: entry.previousSpecificationId,
      created: {
        manufacturer: manufacturerCreated,
        product: productCreated,
        specification: specificationCreated,
      },
      renamed_manufacturer: entry.manufacturerRename
        ? { ...entry.manufacturerRename, cascaded_products: cascadedProducts }
        : null,
      before: entry.before,
      after: entry.after,
      applied_specification_payload: specificationPayload,
    });
  }

  if (historyRows.length) {
    await base44.entities.SpeakerChangeHistory.bulkCreate(historyRows);
  }

  const batch = {
    batch_id: id,
    applied_at: appliedAt,
    applied_by: actorName || "Admin",
    file_name: fileName || "",
    schema_version: schemaVersion || CANONICAL_SCHEMA_VERSION,
    status: "applied",
    row_count: plan.entries.length,
    summary: {
      new_manufacturers: plan.counts.newManufacturers,
      new_products: plan.counts.newProducts,
      updated_products: plan.counts.updatedProducts,
      new_specifications: plan.counts.newSpecifications,
      unchanged: plan.counts.unchanged,
      warnings: plan.counts.warnings,
      errors: plan.counts.errors,
    },
    entries: batchEntries,
  };

  const saved = await base44.entities.SpeakerImportBatch.create(batch);

  return {
    batchId: saved?.batch_id || id,
    appliedAt,
    manufacturersCreated,
    productsCreated,
    productsUpdated,
    specificationsCreated,
    specificationsUpdated,
    recordsTouched: batchEntries.length,
    historyEntries: historyRows.length,
  };
}