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

/** Every specification belonging to a product (approved, draft and superseded). */
export async function loadProductSpecs(productId) {
  if (!productId) return [];
  const page = await base44.entities.SpeakerSpecification.filter({ product_id: productId });
  return Array.isArray(page) ? page : page?.items || [];
}

/**
 * Decide what removing this product actually means, from its own records.
 * @returns {object} { mode: 'archive'|'delete', headline, detail, actionLabel, specs }
 */
export function assessRemoval(product, specs) {
  const list = Array.isArray(specs) ? specs : [];
  const publishedSpec = list.find((s) => s.rp22_published_competitor_id);
  const approvedSpec = list.find((s) => s.approval_status === "Approved");

  if (publishedSpec || approvedSpec) {
    return {
      mode: "archive",
      specs: list,
      headline: "This product has approved or published data. Archive it instead?",
      detail: publishedSpec
        ? "It has been published to the RP22 comparison. Archiving retires it from the comparison list and keeps every value, source and change for audit."
        : "It has an approved specification. Archiving retires it from the active list and keeps the approved data for audit.",
      actionLabel: "Archive product",
    };
  }

  return {
    mode: "delete",
    specs: list,
    headline: "Delete this draft product?",
    detail: "It has no approved specification and has never been published to RP22, so it can be removed permanently together with its draft specification, sources and data-quality notes.",
    actionLabel: "Delete permanently",
  };
}

/**
 * Archive: keep the record, retire it from the active list, and take its
 * published comparison row out of the RP22 selection.
 */
export async function archiveProduct({ product, specs, actorName }) {
  const list = Array.isArray(specs) ? specs : [];
  const publishedIds = list.map((s) => s.rp22_published_competitor_id).filter(Boolean);

  await base44.entities.SpeakerProduct.update(product.id, { status: "Archived" });

  for (const competitorId of publishedIds) {
    await base44.entities.CompetitorSpeaker.update(competitorId, { active: false, published: false });
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

  return { archived: true, deactivatedComparisonRows: publishedIds.length };
}

/**
 * Hard delete, allowed only for a draft product with nothing approved or
 * published. Change history is written FIRST so the record of the removal
 * outlives the product it describes.
 */
export async function deleteProduct({ product, specs, actorName }) {
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

  for (const spec of list) {
    await base44.entities.SpeakerSpecification.delete(spec.id);
  }
  await base44.entities.SpeakerDataQuality.deleteMany({ product_id: product.id });
  await base44.entities.SpeakerSource.deleteMany({ product_id: product.id });
  await base44.entities.SpeakerDocument.deleteMany({ product_id: product.id });
  await base44.entities.SpeakerProduct.delete(product.id);

  return { deleted: true };
}