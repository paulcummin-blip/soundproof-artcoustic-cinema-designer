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
  assessRemoval,
  deleteProduct,
  loadProductSpecs,
} from "@/components/admin/speaker-db/speakerProductLifecycle";

/** What removing this row actually means, stated before anything is written. */
export async function describeRemoval(row) {
  if (row.productId) {
    const specs = await loadProductSpecs(row.productId);
    const assessment = assessRemoval(row.product || { id: row.productId }, specs);
    return { mode: assessment.mode, specs, headline: assessment.headline, detail: assessment.detail, actionLabel: assessment.actionLabel };
  }
  return {
    mode: "retire",
    specs: [],
    headline: `Remove ${row.manufacturer} ${row.model} from the comparison library?`,
    detail: "This is a price-list record with no Speaker Database specification behind it. It will be taken out of the comparison list and the record, including its price, is kept for audit. Nothing is deleted.",
    actionLabel: "Remove from comparison",
  };
}

export async function removeSpeakerFromLibrary({ row, actorName }) {
  if (row.productId) {
    const specs = await loadProductSpecs(row.productId);
    const assessment = assessRemoval(row.product || { id: row.productId }, specs);
    if (assessment.mode === "archive") {
      const result = await archiveProduct({ product: row.product || { id: row.productId }, specs, actorName });
      return { mode: "archive", ...result };
    }
    const result = await deleteProduct({ product: row.product || { id: row.productId }, specs, actorName });
    return { mode: "delete", ...result };
  }

  if (row.rowId) {
    await base44.entities.CompetitorSpeaker.update(row.rowId, { active: false });
    return { mode: "retire", retired: true };
  }

  throw new Error("This speaker could not be matched to any stored record.");
}