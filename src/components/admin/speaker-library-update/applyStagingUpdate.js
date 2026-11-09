// applyStagingUpdate.js
// ---------------------------------------------------------------------------
// The only writer for a staging Speaker Library update.
//
// It creates ONLY what the administrator approved:
//   • brand-only new manufacturers (no products)
//   • new speaker products (and the manufacturer they need, if it does not
//     already exist or is not being mapped to one that does)
//
// It deliberately never:
//   • touches an existing product or specification (no updates, no renames)
//   • creates a specification — new products are INCOMPLETE until a spec is
//     entered through the normal review/publish flow
//   • touches CompetitorSpeaker — importing is not publishing
//   • writes a price
//
// Every creation is recorded on a SpeakerImportBatch so the whole update can
// be rolled back with undoStagingUpdate.

import { base44 } from "@/api/base44Client";
import {
  normaliseManufacturerIdentity,
  normaliseModelIdentity,
} from "@/components/utils/spl/manufacturerIdentity";

const SCHEMA_VERSION = "staging-library-v1";
const ACTOR_DEFAULT = "Speaker Library update";

function batchId() {
  return `staging-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : value?.items || [];
}

/**
 * @param {object} params
 *   approved: {
 *     newManufacturers: [{name}],                          // brand-only, approved
 *     newProducts: [{manufacturerName, manufacturerId, model, url, urlKind}],
 *     manufacturerResolutions: { workbookManufNorm: { existingId, existingName } }
 *   }
 *   actorName, fileName
 * @returns {object} summary + batchId
 */
export async function applyStagingUpdate({ approved, actorName, fileName }) {
  const appliedAt = new Date().toISOString();
  const id = batchId();
  const manufByNorm = new Map(); // normName -> { id, name, created }

  // Preload existing manufacturers so we never create a duplicate.
  const existingManuf = await base44.entities.SpeakerManufacturer.list({}, { sort: "name", limit: 500 });
  for (const m of asArray(existingManuf)) {
    manufByNorm.set(normaliseManufacturerIdentity(m.name), { id: m.id, name: m.name, created: false });
  }

  const entries = [];
  let manufacturersCreated = 0;
  let productsCreated = 0;
  let skipped = 0;
  const resolutions = approved.manufacturerResolutions || {};

  async function ensureManufacturer(name, workbookNorm) {
    // A mapping to an existing manufacturer wins over creating a new one.
    const resolved = workbookNorm && resolutions[workbookNorm];
    if (resolved && resolved.existingId) {
      return { id: resolved.existingId, name: resolved.existingName, created: false };
    }
    const norm = normaliseManufacturerIdentity(name);
    const cached = manufByNorm.get(norm);
    if (cached) return cached;
    const created = await base44.entities.SpeakerManufacturer.create({ name, status: "Active" });
    const record = { id: created?.id || null, name, created: true };
    manufByNorm.set(norm, record);
    manufacturersCreated += 1;
    entries.push({
      kind: "manufacturer_only",
      manufacturer_id: record.id,
      manufacturer_name: name,
      product_id: null,
      model: "",
      created: { manufacturer: true, product: false },
      before: null,
      after: { manufacturer_name: name },
    });
    return record;
  }

  // 1. Brand-only new manufacturers.
  for (const nm of approved.newManufacturers || []) {
    const name = String(nm.name || "").trim();
    if (!name) continue;
    const norm = normaliseManufacturerIdentity(name);
    if (manufByNorm.has(norm)) {
      skipped += 1;
      continue;
    }
    await ensureManufacturer(name, norm);
  }

  // 2. New products (and their manufacturer if needed).
  for (const np of approved.newProducts || []) {
    const workbookManufName = String(np.manufacturerName || "").trim();
    const workbookManufNorm = normaliseManufacturerIdentity(workbookManufName);
    const model = String(np.model || "").trim();
    if (!workbookManufName || !model) { skipped += 1; continue; }

    const manuf = await ensureManufacturer(workbookManufName, workbookManufNorm);

    // Safety: never create a product that already exists under this manufacturer
    // (by normalised model), even if the classifier said NEW.
    const existing = await base44.entities.SpeakerProduct.filter(
      { manufacturer_id: manuf.id },
      { limit: 200 },
    );
    const alreadyExists = asArray(existing).some(
      (p) => normaliseModelIdentity(p.model) === normaliseModelIdentity(model),
    );
    if (alreadyExists) {
      skipped += 1;
      entries.push({
        kind: "skipped_exists",
        manufacturer_id: manuf.id,
        manufacturer_name: manuf.name,
        product_id: null,
        model,
        created: { manufacturer: false, product: false },
        before: null,
        after: { model },
      });
      continue;
    }

    const isPdf = np.urlKind === "pdf";
    const productPayload = {
      manufacturer_id: manuf.id,
      manufacturer_name: manuf.name,
      model,
      official_pdf_url: isPdf ? (np.url || null) : null,
      official_product_url: !isPdf ? (np.url || null) : null,
      status: "Unknown",
      import_status: "Imported",
      category: "Other",
      role: "Flexible",
    };
    const created = await base44.entities.SpeakerProduct.create(productPayload);
    productsCreated += 1;
    entries.push({
      kind: "new_product",
      manufacturer_id: manuf.id,
      manufacturer_name: manuf.name,
      product_id: created?.id || null,
      model,
      created: { manufacturer: false, product: true },
      before: null,
      after: { ...productPayload },
    });
  }

  const batch = {
    batch_id: id,
    applied_at: appliedAt,
    applied_by: actorName || ACTOR_DEFAULT,
    file_name: fileName || "",
    schema_version: SCHEMA_VERSION,
    status: "applied",
    row_count: entries.length,
    summary: {
      new_manufacturers: manufacturersCreated,
      new_products: productsCreated,
      updated_products: 0,
      new_specifications: 0,
      unchanged: 0,
      warnings: 0,
      errors: 0,
      skipped,
    },
    entries,
  };

  const saved = await base44.entities.SpeakerImportBatch.create(batch);

  return {
    batchId: saved?.batch_id || id,
    appliedAt,
    manufacturersCreated,
    productsCreated,
    skipped,
    recordsTouched: entries.length,
  };
}

/**
 * Roll back a staging update: delete every product the batch created, then
 * delete every manufacturer the batch created that now has no remaining
 * products. Marks the batch rolled_back.
 */
export async function undoStagingUpdate({ batchId, actorName }) {
  const result = await base44.entities.SpeakerImportBatch.filter({ batch_id: batchId }, { limit: 1 });
  const record = asArray(result)[0];
  if (!record) throw new Error("That update batch could not be found.");

  const entries = record.entries || [];
  let productsDeleted = 0;
  let manufacturersDeleted = 0;

  // products first
  for (const entry of entries) {
    if (entry.product_id) {
      try {
        await base44.entities.SpeakerProduct.delete(entry.product_id);
        productsDeleted += 1;
      } catch { /* already gone */ }
    }
  }
  // manufacturers created by this batch, only if they now hold no products
  for (const entry of entries) {
    if (entry.manufacturer_id && entry.created?.manufacturer) {
      try {
        const remaining = await base44.entities.SpeakerProduct.filter(
          { manufacturer_id: entry.manufacturer_id },
          { limit: 1 },
        );
        if (asArray(remaining).length === 0) {
          await base44.entities.SpeakerManufacturer.delete(entry.manufacturer_id);
          manufacturersDeleted += 1;
        }
      } catch { /* already gone */ }
    }
  }

  await base44.entities.SpeakerImportBatch.update(record.id, {
    status: "rolled_back",
    rolled_back_at: new Date().toISOString(),
    rolled_back_by: actorName || "Admin",
    rollback_notes: `Undid staging update: removed ${productsDeleted} product(s) and ${manufacturersDeleted} manufacturer(s).`,
  });

  return { undone: true, productsDeleted, manufacturersDeleted };
}