// removeSpeakerFromLibrary.js
// ---------------------------------------------------------------------------
// Delete, using the existing lifecycle rules rather than a new one.
//
//   • A speaker with approved or published data is never hard-deleted: it is
//     archived, its comparison row is retired from the list, and every value,
//     source and change is retained for audit.
//   • A draft product with nothing approved and nothing published can be removed
//     permanently (the existing rule).
//   • A comparison record with no canonical record behind it is a price-list
//     entry: it is retired from the comparison list and kept for audit, never
//     deleted, because its price is part of the published comparison history.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import {
  archiveProduct,
  assessDanglingRowRemoval,
  assessRemoval,
  deleteManufacturerIfSafe,
  deleteProduct,
  loadLinkedCompetitorRows,
  loadProductSpecs,
} from "@/components/admin/speaker-db/speakerProductLifecycle";

/** Resolve a full product record when the probe only carries an id. */
async function resolveProduct(row) {
  if (row.product?.manufacturer_id) return row.product;
  try {
    return await base44.entities.SpeakerProduct.get(row.productId);
  } catch {
    return row.product || { id: row.productId, manufacturer_name: row.manufacturer || "", model: row.model || "" };
  }
}

/** What removing this row actually means, stated before anything is written. */
export async function describeRemoval(row) {
  if (row.productId) {
    const specs = await loadProductSpecs(row.productId);
    const product = await resolveProduct(row);
    const identity = {
      manufacturer: product?.manufacturer_name || row.manufacturer || "",
      model: product?.model || row.model || "",
    };
    const linkedCompetitorRows = await loadLinkedCompetitorRows({ product: { id: row.productId }, specs, identity });
    const assessment = assessRemoval(product, specs, linkedCompetitorRows);
    return {
      mode: assessment.mode,
      specs,
      linkedCompetitorRows,
      headline: assessment.headline,
      detail: assessment.detail,
      actionLabel: assessment.actionLabel,
    };
  }
  return assessDanglingRowRemoval(row);
}

export async function removeSpeakerFromLibrary({ row, actorName }) {
  if (row.productId) {
    const specs = await loadProductSpecs(row.productId);
    const product = await resolveProduct(row);
    const identity = {
      manufacturer: product?.manufacturer_name || row.manufacturer || "",
      model: product?.model || row.model || "",
    };
    const linkedCompetitorRows = await loadLinkedCompetitorRows({ product: { id: row.productId }, specs, identity });
    const assessment = assessRemoval(product, specs, linkedCompetitorRows);
    if (assessment.mode === "archive") {
      const result = await archiveProduct({ product, specs, actorName, linkedCompetitorRows });
      return { mode: "archive", ...result };
    }
    const result = await deleteProduct({ product, specs, actorName, linkedCompetitorRows });
    return { mode: "delete", ...result };
  }

  if (!row.rowId) throw new Error("This speaker could not be matched to any stored record.");

  // Dangling-row path: the canonical product may already be gone.
  const assessment = await assessDanglingRowRemoval(row);

  // If the product still exists, the product-based path is the complete cleanup.
  if (assessment.redirectProductId) {
    const product = await base44.entities.SpeakerProduct.get(assessment.redirectProductId);
    const specs = await loadProductSpecs(product.id);
    const identity = {
      manufacturer: product?.manufacturer_name || row.manufacturer || "",
      model: product?.model || row.model || "",
    };
    const linkedCompetitorRows = await loadLinkedCompetitorRows({ product, specs, identity });
    const productAssessment = assessRemoval(product, specs, linkedCompetitorRows);
    if (productAssessment.mode === "archive") {
      const result = await archiveProduct({ product, specs, actorName, linkedCompetitorRows });
      return { mode: "archive", ...result };
    }
    const result = await deleteProduct({ product, specs, actorName, linkedCompetitorRows });
    return { mode: "delete", ...result };
  }

  if (assessment.error) throw new Error(assessment.error);

  if (assessment.mode === "retire") {
    await base44.entities.CompetitorSpeaker.update(row.rowId, { active: false });
    return { mode: "retire", retired: true };
  }

  // delete_dangling: permanently remove the shared row, then clean up the
  // manufacturer if it has no remaining references.
  await base44.entities.CompetitorSpeaker.delete(row.rowId);
  const manufacturerResult = await deleteManufacturerIfSafe({
    manufacturerName: assessment.competitorRow?.manufacturer || row.manufacturer,
  });
  return { mode: "delete_dangling", deleted: true, manufacturer: manufacturerResult };
}