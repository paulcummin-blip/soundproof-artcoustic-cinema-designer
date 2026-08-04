/**
 * rp22PillarGrouping
 * -----------------
 * Presentation-only metadata mapping RP22 P1–P21 to three client-facing pillars.
 * No scores are calculated here — this is a static grouping consumed by the
 * three-pillar summary page.
 *
 * Pillar assignments (per CEDIA RP22 category structure):
 *   Spatial Resolution : P1–P11  (geometry, coverage, placement, angles)
 *   Dynamics           : P12–P15 (SPL capability, headroom, construction)
 *   Timbre             : P16–P21 (HF off-axis, bass extension, consistency, reflections)
 */

export const RP22_PILLAR_GROUPING = {
  spatial: {
    key: "spatial",
    name: "Spatial Resolution",
    paramIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
  dynamics: {
    key: "dynamics",
    name: "Dynamics",
    paramIds: [12, 13, 14, 15],
  },
  timbre: {
    key: "timbre",
    name: "Timbre",
    paramIds: [16, 17, 18, 19, 20, 21],
  },
};

export const PILLAR_ORDER = ["spatial", "dynamics", "timbre"];

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

/**
 * Development assertion: every P1–P21 appears exactly once across all pillars
 * and no out-of-range IDs are present. Runs only in Vite dev mode.
 */
export function assertPillarGroupingComplete() {
  if (!isDev) return { ok: true, errors: [] };

  const errors = [];
  const allIds = [];
  for (const pillar of Object.values(RP22_PILLAR_GROUPING)) {
    allIds.push(...pillar.paramIds);
  }

  for (let i = 1; i <= 21; i++) {
    const count = allIds.filter((id) => id === i).length;
    if (count !== 1) {
      errors.push(`P${i} appears ${count} time(s) (expected 1)`);
    }
  }

  const extra = allIds.filter((id) => id < 1 || id > 21);
  if (extra.length > 0) {
    errors.push(`Unexpected IDs: ${extra.join(", ")}`);
  }

  if (errors.length > 0 && typeof console !== "undefined" && console.warn) {
    console.warn("[rp22PillarGrouping] Assertion failures:", errors);
  }

  return { ok: errors.length === 0, errors };
}