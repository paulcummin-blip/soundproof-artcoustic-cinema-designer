// coordinatedPlacementSelection.js
// Pure, zero-dependency quantity-aware placement selection for the
// coordinated physical search. Kept import-free so it is unit-testable in
// isolation (the main coordinatedPhysicalSearch module pulls a heavy import
// chain).
//
// PROBLEM THIS SOLVES
//   The shared five-placement cap was previously filled sequentially by the
//   installed quantity before the search reached available cross-quantity
//   (e.g. four-subwoofer) finalists. A two-subwoofer installed design with
//   many screened placements consumed every slot, so useful four-subwoofer
//   Stage 2 finalists never entered coordinated screening.
//
// POLICY
//   Select from ALL available eligible quantity groups BEFORE applying the
//   cap, interleaving one placement per quantity per round so every available
//   quantity is represented. Within each quantity, prefer topology (family)
//   diversity so the retained set is not a cluster of one topology.
//   The installed quantity is represented but does not occupy every slot.
//   Missing quantities are reported, never invented.

/**
 * Select a bounded, quantity-aware, topology-diverse set of placements from
 * per-quantity buckets of pre-screened eligible placements.
 *
 * @param {object} opts
 * @param {object} opts.buckets - { quantity: [placement, ...] } per quantity.
 *   Each placement is { id, quantity, familyId, coordinates, ... }.
 *   Ordering within a bucket is the caller's priority order (installed-qty
 *   phases first; Stage 2 ranking for cross-quantity).
 * @param {number|null} opts.installedQuantity - installed subwoofer count.
 * @param {number} opts.max - overall placement cap (e.g. 5).
 * @param {number[]} opts.supportedQuantities - quantities the search supports.
 * @returns {{ retained: Array, quantityCoverage: object, missingQuantities: number[],
 *   excludedByCap: Array, availableCounts: object, eligibleCounts: object }}
 */
export function selectQuantityAwarePlacements({
  buckets = {},
  installedQuantity = null,
  max = 5,
  supportedQuantities = [1, 2, 4],
}) {
  const availableCounts = {};
  for (const q of supportedQuantities) {
    availableCounts[q] = (buckets[q] || []).length;
  }
  const missingQuantities = supportedQuantities.filter((q) => availableCounts[q] === 0);
  const availableQuantities = supportedQuantities.filter((q) => availableCounts[q] > 0);

  if (availableQuantities.length === 0 || max <= 0) {
    return {
      retained: [],
      quantityCoverage: Object.fromEntries(supportedQuantities.map((q) => [q, 0])),
      missingQuantities,
      excludedByCap: [],
      availableCounts,
      eligibleCounts: Object.fromEntries(supportedQuantities.map((q) => [q, 0])),
    };
  }

  // Order quantities: installed first (for guaranteed representation), then
  // the rest ascending so smaller cross-quantities get an early slot.
  const orderedQuantities = [
    ...(installedQuantity != null && availableCounts[installedQuantity] > 0
      ? [installedQuantity]
      : []),
    ...availableQuantities.filter((q) => q !== installedQuantity).sort((a, b) => a - b),
  ];

  // Per-quantity cursor and family-usage tracker.
  const cursors = Object.fromEntries(orderedQuantities.map((q) => [q, 0]));
  const usedFamilies = Object.fromEntries(orderedQuantities.map((q) => [q, new Set()]));
  const seenCoords = new Set();

  const retained = [];
  const excludedByCap = [];

  const coordKeyOf = (p) => {
    const coords = p?.coordinates;
    if (!Array.isArray(coords) || coords.length === 0) return p?.id || "";
    return coords.map((c) =>
      `${Number(c?.x ?? c?.xNorm ?? 0).toFixed(3)},${Number(c?.y ?? c?.yNorm ?? 0).toFixed(3)}`,
    ).join("|");
  };

  // Round-robin across quantities. Each round, take at most one placement per
  // quantity, preferring a family not yet represented for that quantity.
  let progress = true;
  while (retained.length < max && progress) {
    progress = false;
    for (const q of orderedQuantities) {
      if (retained.length >= max) break;
      const list = buckets[q] || [];
      let picked = null;
      // First pass: next placement with a NEW family for this quantity.
      while (cursors[q] < list.length) {
        const candidate = list[cursors[q]];
        const fam = candidate?.familyId || candidate?.phase || `q${q}`;
        const key = coordKeyOf(candidate);
        if (usedFamilies[q].has(fam) || seenCoords.has(key)) {
          cursors[q]++;
          excludedByCap.push({ ...candidate, exclusionReason: seenCoords.has(key) ? "coord_duplicate" : "family_duplicate" });
          continue;
        }
        picked = candidate;
        cursors[q]++;
        break;
      }
      // Second pass (family diversity exhausted): any remaining placement.
      if (!picked) {
        while (cursors[q] < list.length) {
          const candidate = list[cursors[q]];
          const key = coordKeyOf(candidate);
          cursors[q]++;
          if (seenCoords.has(key)) {
            excludedByCap.push({ ...candidate, exclusionReason: "coord_duplicate" });
            continue;
          }
          picked = candidate;
          break;
        }
      }
      if (picked) {
        const fam = picked?.familyId || picked?.phase || `q${q}`;
        usedFamilies[q].add(fam);
        seenCoords.add(coordKeyOf(picked));
        retained.push(picked);
        progress = true;
      }
    }
  }

  // Everything remaining in every bucket is excluded by the cap.
  for (const q of orderedQuantities) {
    const list = buckets[q] || [];
    while (cursors[q] < list.length) {
      excludedByCap.push({ ...list[cursors[q]++], exclusionReason: "cap_exceeded" });
    }
  }

  const quantityCoverage = Object.fromEntries(
    supportedQuantities.map((q) => [q, retained.filter((p) => p.quantity === q).length]),
  );
  const eligibleCounts = Object.fromEntries(
    supportedQuantities.map((q) => [q, (buckets[q] || []).length]),
  );

  return {
    retained,
    quantityCoverage,
    missingQuantities,
    excludedByCap,
    availableCounts,
    eligibleCounts,
  };
}