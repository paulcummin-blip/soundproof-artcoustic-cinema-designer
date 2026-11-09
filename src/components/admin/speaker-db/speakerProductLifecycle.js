// speakerProductLifecycle.js
// ---------------------------------------------------------------------------
// Archiving and deleting Speaker Database products, always with change history.
//
// The rule this file enforces:
//
//   A product that carries approved or published data is NEVER hard-deleted.
//   It is archived instead, and its RP22 comparison row is deactivated so it
//   stops being offered as a comparison speaker while every value, source and
//   change is retained for audit.
//
//   Only a draft product with no approved specification and no publish history
//   can be deleted, and that is always an explicit, separate confirmation.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { findIdentityMatches } from "@/components/admin/speaker-db/model-first/rp22ComparisonPublish";
import { sameCompetitorIdentity } from "@/components/utils/spl/manufacturerIdentity";

const hasVal = (value) => value !== null && value !== undefined && String(value).trim() !== "";

/** Whether a shared competitor row carries any P12/P13 technical value. */
const competitorRowHasTechnicalValues = (row) => {
  const r = row || {};
  return hasVal(r.sensitivity_value_db)
    || hasVal(r.power_authority_w)
    || hasVal(r.published_max_continuous_spl_db_1m)
    || hasVal(r.halfspace_published_max_continuous_spl_db_1m);
};

/** Every specification belonging to a product (approved, draft and superseded). */
export async function loadProductSpecs(productId) {
  if (!productId) return [];
  const page = await base44.entities.SpeakerSpecification.filter({ product_id: productId });
  return Array.isArray(page) ? page : page?.items || [];
}

/**
 * Resolve every shared CompetitorSpeaker row linked to this product, its
 * specifications, or the canonical manufacturer/model identity. Used during
 * removal preflight so a manual INCOMPLETE row — whose specification carries no
 * rp22_published_competitor_id — is still found and included in the cleanup.
 */
export async function loadLinkedCompetitorRows({ product, specs, identity }) {
  const seen = new Set();
  const rows = [];
  const add = (items) => {
    for (const row of items || []) {
      if (row?.id && !seen.has(row.id)) { seen.add(row.id); rows.push(row); }
    }
  };

  if (product?.id) {
    try {
      const page = await base44.entities.CompetitorSpeaker.filter({ source_product_id: product.id }, { limit: 200 });
      add(Array.isArray(page?.items) ? page.items : (Array.isArray(page) ? page : []));
    } catch { /* entity may not support the filter; identity path still runs */ }
  }

  for (const spec of specs || []) {
    if (!spec?.id) continue;
    try {
      const page = await base44.entities.CompetitorSpeaker.filter({ source_specification_id: spec.id }, { limit: 200 });
      add(Array.isArray(page?.items) ? page.items : (Array.isArray(page) ? page : []));
    } catch { /* same */ }
  }

  if (identity?.manufacturer && identity?.model) {
    try {
      add(await findIdentityMatches(identity));
    } catch { /* non-fatal */ }
  }

  return rows;
}

/**
 * Decide what removing this product actually means, from its own records.
 * @returns {object} { mode: 'archive'|'delete', headline, detail, actionLabel, specs }
 */
export function assessRemoval(product, specs, linkedCompetitorRows = []) {
  const list = Array.isArray(specs) ? specs : [];
  const publishedSpec = list.find((s) => s.rp22_published_competitor_id);
  const approvedSpec = list.find((s) => s.approval_status === "Approved");

  // A linked competitor row with technical values is externally referenced —
  // the existing safety behaviour applies even if the spec pointer was lost.
  const referencedRow = (linkedCompetitorRows || []).find(
    (row) => row.active !== false && competitorRowHasTechnicalValues(row),
  );

  if (publishedSpec || approvedSpec || referencedRow) {
    return {
      mode: "archive",
      specs: list,
      linkedCompetitorRows,
      headline: "This product has approved or published data. Archive it instead?",
      detail: publishedSpec
        ? "It has been published to the RP22 comparison. Archiving retires it from the comparison list and keeps every value, source and change for audit."
        : referencedRow
          ? "It has a published comparison row with technical values. Archiving retires it from the comparison list and keeps every value for audit."
          : "It has an approved specification. Archiving retires it from the active list and keeps the approved data for audit.",
      actionLabel: "Archive product",
    };
  }

  return {
    mode: "delete",
    specs: list,
    linkedCompetitorRows,
    headline: "Delete this draft product?",
    detail: "It has no approved specification and has never been published to RP22, so it can be removed permanently together with its draft specification, sources, data-quality notes and any incomplete comparison row.",
    actionLabel: "Delete permanently",
  };
}

/**
 * Archive: keep the record, retire it from the active list, and take its
 * published comparison row out of the RP22 selection.
 */
export async function archiveProduct({ product, specs, actorName, linkedCompetitorRows = [] }) {
  const list = Array.isArray(specs) ? specs : [];
  const publishedIds = list.map((s) => s.rp22_published_competitor_id).filter(Boolean);

  await base44.entities.SpeakerProduct.update(product.id, { status: "Archived" });

  const retired = new Set(publishedIds);
  for (const competitorId of publishedIds) {
    await base44.entities.CompetitorSpeaker.update(competitorId, { active: false, published: false });
  }

  // Also retire any linked INCOMPLETE database rows not already covered, so
  // archiving leaves no active dangling candidate.
  for (const row of linkedCompetitorRows) {
    if (retired.has(row.id)) continue;
    if (row.publish_source === "speaker_database" && row.active !== false) {
      await base44.entities.CompetitorSpeaker.update(row.id, { active: false, published: false });
      retired.add(row.id);
    }
  }

  await base44.entities.SpeakerChangeHistory.create({
    product_id: product.id,
    field_changed: "status",
    old_value: product.status || "",
    new_value: "Archived",
    source: actorName || "Manual Edit",
    change_type: "Updated",
    change_reason: "Status Change",
  });

  return { archived: true, deactivatedComparisonRows: retired.size };
}

/**
 * Hard delete, allowed only for a draft product with nothing approved or
 * published. Change history is written FIRST so the record of the removal
 * outlives the product it describes.
 */
export async function deleteProduct({ product, specs, actorName, linkedCompetitorRows = [] }) {
  const list = Array.isArray(specs) ? specs : [];

  await base44.entities.SpeakerChangeHistory.create({
    product_id: product.id,
    field_changed: "product",
    old_value: `${product.manufacturer_name || ""} ${product.model || ""}`.trim(),
    new_value: "Deleted (draft product removed)",
    source: actorName || "Manual Edit",
    change_type: "Removed",
    change_reason: "Administrative",
  });

  // Delete linked shared competitor rows FIRST — they are the most reference-
  // sensitive records and the ones that keep a removed model visible in the
  // comparison dropdown. Only speaker_database rows are removed; spreadsheet
  // rows carry their own evidence and provenance and are left untouched.
  const deletedCompetitorIds = [];
  for (const row of linkedCompetitorRows) {
    if (row.publish_source !== "speaker_database") continue;
    try {
      await base44.entities.CompetitorSpeaker.delete(row.id);
      deletedCompetitorIds.push(row.id);
    } catch {
      // Stop immediately — do not continue to delete canonical records after a
      // shared-row deletion failure.
      throw new Error(`Could not remove the shared comparison row ${row.id}. Stopped before deleting canonical records.`);
    }
  }

  for (const spec of list) {
    await base44.entities.SpeakerSpecification.delete(spec.id);
  }
  await base44.entities.SpeakerDataQuality.deleteMany({ product_id: product.id });
  await base44.entities.SpeakerSource.deleteMany({ product_id: product.id });
  await base44.entities.SpeakerDocument.deleteMany({ product_id: product.id });
  await base44.entities.SpeakerProduct.delete(product.id);

  // Conservative manufacturer cleanup — only when no products or competitor
  // rows remain that reference it.
  const manufacturerResult = await deleteManufacturerIfSafe({
    manufacturerId: product.manufacturer_id,
    manufacturerName: product.manufacturer_name,
  });

  return { deleted: true, deletedCompetitorIds, manufacturer: manufacturerResult };
}

/**
 * Delete a manufacturer only when nothing references it. Checks for remaining
 * products and competitor rows by name. If anything is found, or the check
 * fails, the manufacturer is left and the reason returned.
 */
export async function deleteManufacturerIfSafe({ manufacturerId, manufacturerName }) {
  let manufacturer = null;
  if (manufacturerId) {
    try { manufacturer = await base44.entities.SpeakerManufacturer.get(manufacturerId); } catch { /* not found */ }
  }
  if (!manufacturer && manufacturerName) {
    try {
      const page = await base44.entities.SpeakerManufacturer.filter({ name: manufacturerName }, { limit: 10 });
      const items = Array.isArray(page?.items) ? page.items : (Array.isArray(page) ? page : []);
      manufacturer = items[0] || null;
    } catch { /* not found */ }
  }
  if (!manufacturer) return { deleted: false, reason: "Manufacturer not found." };

  let products = [];
  try {
    const page = await base44.entities.SpeakerProduct.filter({ manufacturer_id: manufacturer.id }, { limit: 500 });
    products = Array.isArray(page?.items) ? page.items : (Array.isArray(page) ? page : []);
  } catch { /* permission or filter issue */ }
  if (products.length > 0) return { deleted: false, reason: "Manufacturer still has products." };

  try {
    const page = await base44.entities.CompetitorSpeaker.filter({ manufacturer: manufacturer.name }, { limit: 500 });
    const items = Array.isArray(page?.items) ? page.items : (Array.isArray(page) ? page : []);
    if (items.length > 0) return { deleted: false, reason: "Competitor rows still reference this manufacturer." };
  } catch {
    return { deleted: false, reason: "Could not verify manufacturer references." };
  }

  await base44.entities.SpeakerManufacturer.delete(manufacturer.id);
  return { deleted: true };
}

/**
 * Preflight for a dangling competitor row whose canonical product has already
 * been removed. Decides between permanent delete (INCOMPLETE, no references)
 * and retire (spreadsheet or technical-values rows kept for audit). If the
 * source product still exists, redirects to the product-based path.
 */
export async function assessDanglingRowRemoval(row) {
  if (!row?.rowId) {
    return { error: "This speaker could not be matched to any stored record." };
  }

  let competitorRow = null;
  try {
    competitorRow = await base44.entities.CompetitorSpeaker.get(row.rowId);
  } catch {
    return { error: "This comparison record could not be found. It may have already been removed." };
  }

  // If the source product still exists, the product-based path is the complete
  // cleanup — fall through to it.
  if (competitorRow.source_product_id) {
    try {
      const product = await base44.entities.SpeakerProduct.get(competitorRow.source_product_id);
      if (product?.id) return { redirectProductId: product.id };
    } catch { /* product already gone — continue to dangling assessment */ }
  }

  if (competitorRow.publish_source === "spreadsheet") {
    return {
      mode: "retire",
      rowId: row.rowId,
      headline: `Remove ${competitorRow.manufacturer || ""} ${competitorRow.model || ""} from the comparison library?`.trim(),
      detail: "This is a spreadsheet-imported record. It will be taken out of the comparison list and kept for audit. Nothing is deleted.",
      actionLabel: "Remove from comparison",
    };
  }

  if (competitorRowHasTechnicalValues(competitorRow)) {
    return {
      mode: "retire",
      rowId: row.rowId,
      headline: `Remove ${competitorRow.manufacturer || ""} ${competitorRow.model || ""} from the comparison library?`.trim(),
      detail: "This record has published technical values. It will be taken out of the comparison list and kept for audit. Nothing is deleted.",
      actionLabel: "Remove from comparison",
    };
  }

  return {
    mode: "delete_dangling",
    rowId: row.rowId,
    competitorRow,
    headline: "Delete this incomplete comparison record?",
    detail: "Its canonical product has already been removed and it has no published technical values, so it can be deleted permanently. No comparison candidate will remain.",
    actionLabel: "Delete permanently",
  };
}