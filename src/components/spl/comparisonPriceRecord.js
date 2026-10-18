/**
 * comparisonPriceRecord
 * ---------------------
 * The one write path for a retail price against an RP22 comparison speaker.
 *
 * A candidate comes from the same builder the RP22 comparison dropdown uses
 * (utils/spl/speakerDbComparisonCandidates), so a price is always saved against
 * the speaker the comparison will actually select:
 *
 *   · A speaker whose comparison row already exists → that row is updated. It is
 *     the price authority (CompetitorSpeaker.retail_price_inc_vat), and a
 *     republication updates the same row in place, so the price stays attached.
 *   · A Speaker Database product that has no row yet → the single price row for
 *     its identity is reused if one exists, otherwise one is created. It is
 *     marked not published and carries no publish provenance, so it never
 *     appears in the comparison dropdown and never changes which speakers are
 *     selectable — it simply holds the price until the speaker is published, at
 *     which point the publication updates that same row.
 *
 * Nothing here creates a second record for a speaker that already has one, and
 * a blank entry clears the price to null — never to zero.
 */

import { base44 } from "@/api/base44Client";
import { competitorIdentityKey } from "@/components/utils/spl/manufacturerIdentity";

/**
 * Save (or clear) the retail price for one comparison candidate.
 *
 * @param {object} params
 * @param {object} params.candidate a candidate from loadComparisonCandidates()
 * @param {number|null} params.value the price, or null to clear it
 * @returns {Promise<{recordId: string|null, created: boolean}>}
 */
export async function saveCandidatePrice({ candidate, value = null }) {
  if (!candidate) throw new Error("No speaker was given to price.");
  const price = value === undefined ? null : value;

  // The candidate already knows its price row when one exists.
  if (candidate.priceRecordId) {
    await base44.entities.CompetitorSpeaker.update(candidate.priceRecordId, {
      retail_price_inc_vat: price,
      currency: "GBP",
    });
    return { recordId: candidate.priceRecordId, created: false };
  }

  // No row holds this speaker yet. Re-read once and reuse any row for the same
  // product or the same manufacturer/model identity before creating anything, so
  // a variant spelling or a concurrent save cannot produce a second record.
  const rows = (await base44.entities.CompetitorSpeaker.list("-created_date", 500)) || [];
  const identity = competitorIdentityKey({
    manufacturer: candidate.manufacturer,
    model: candidate.model,
  });
  const existing = (candidate.productId
    ? rows.find((row) => row.source_product_id === candidate.productId)
    : null)
    || rows.find((row) => competitorIdentityKey(row) === identity)
    || null;

  if (existing) {
    await base44.entities.CompetitorSpeaker.update(existing.id, {
      retail_price_inc_vat: price,
      currency: "GBP",
    });
    return { recordId: existing.id, created: false };
  }

  // Nothing to clear on a speaker that has never held a price.
  if (price === null) return { recordId: null, created: false };

  const created = await base44.entities.CompetitorSpeaker.create({
    manufacturer: candidate.manufacturer || "",
    model: candidate.model || "",
    source_product_id: candidate.productId || null,
    source_specification_id: candidate.specificationId || null,
    retail_price_inc_vat: price,
    currency: "GBP",
    active: true,
    published: false,
  });

  return { recordId: created?.id || null, created: true };
}