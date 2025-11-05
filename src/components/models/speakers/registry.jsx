
// components/models/speakers/registry.js
// CANONICAL SPEAKER REGISTRY — DO NOT EDIT WITHOUT APPROVAL
// Units: millimetres. Plan view uses widthMm (X) and depthMm (Y). Height is for reporting/UI.
// Overheads use diameterMm + depthMm and render as circles in plan view.

const mmToM = (mm) => Math.round((Number(mm) || 0) * 1e-3 * 1e6) / 1e6; // 1 µm precision

export const CATEGORY_ORDER = ["LCR", "SURROUNDS", "ARCHITECT", "SUBWOOFERS"];

export const MODELS = [
  // LCR — EXACT ORDER
  { key: "q4-3", label: "Q4-3", category: "LCR", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "q6-3", label: "Q6-3", category: "LCR", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 8 },
  { key: "q4-5", label: "Q4-5", category: "LCR", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "q8-5", label: "Q8-5", category: "LCR", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "evolve-2-1", label: "EVOLVE 2-1", category: "LCR", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "evolve-3-1", label: "EVOLVE 3-1", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "evolve-4-2", label: "EVOLVE 4-2", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "evolve-6-3", label: "EVOLVE 6-3", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "evolve-8-4", label: "EVOLVE 8-4", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },

  // SURROUNDS — EXACT ORDER
  { key: "evolve-2-1_s", label: "EVOLVE 2-1", category: "SURROUNDS", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "evolve-3-1_s", label: "EVOLVE 3-1", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "evolve-4-2_s", label: "EVOLVE 4-2", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "evolve-6-3_s", label: "EVOLVE 6-3", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "evolve-8-4_s", label: "EVOLVE 8-4", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "q4-3_s", label: "Q4-3", category: "SURROUNDS", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "q6-3_s", label: "Q6-3", category: "SURROUNDS", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 8 },
  { key: "q4-5_s", label: "Q4-5", category: "SURROUNDS", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "q8-5_s", label: "Q8-5", category: "SURROUNDS", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },

  // ARCHITECT (OVERHEAD) — EXACT ORDER (round plan)
  { key: "architect-2-1", label: "ARCHITECT 2-1", category: "ARCHITECT", diameterMm: 240, depthMm: 120, round: true, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "architect-4-2", label: "ARCHITECT 4-2", category: "ARCHITECT", diameterMm: 300, depthMm: 120, round: true, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },
  { key: "architect-pas2-2", label: "ARCHITECT PAS2-2", category: "ARCHITECT", diameterMm: 300, depthMm: 150, round: true, sensitivity_dB_1w1m: 87, sensitivity_dB_2p83: 87, nominalOhms: 8 },

  // SUBWOOFERS — EXACT ORDER
  { key: "sub2-12", label: "SUB2-12", category: "SUBWOOFERS", widthMm: 500, heightMm: 500, depthMm: 255 },
  { key: "sub3-12", label: "SUB3-12", category: "SUBWOOFERS", widthMm: 600, heightMm: 600, depthMm: 255 },
  { key: "sub4-12", label: "SUB4-12", category: "SUBWOOFERS", widthMm: 440, heightMm: 1700, depthMm: 270 },
];

// NORMALISATION — TOLERANT TO SPACES/CASE/EXTRA TEXT
export function normaliseModelKey(name = "") {
  const raw = String(name).toLowerCase();
  // STEP 1: Preserve underscores in the sanitiser
  let s = raw.replace(/[()]/g, " ").replace(/[^a-z0-9_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  // unify known families
  s = s.replace(/^spitfire-q-(\d+)-(\d+)$/, "q$1-$2");
  s = s.replace(/^evolve-(\d+)-(\d+)$/, "evolve-$1-$2");
  s = s.replace(/^architect-(pas2-2)$/, "architect-$1");
  
  // Safety net: normalise a trailing "-s" back to "_s"
  if (s.endsWith("-s")) {
      s = s.slice(0, -2) + "_s";
  }

  // allow “_s” variants for surrounds already keyed above
  return s;
}

// PRIMARY ACCESSOR — RETURNS METRICS IN METRES, WITH PLAN SHAPE HINTS
export function getSpeakerModelMeta(modelName) {
  const key = normaliseModelKey(modelName);
  const hit =
    MODELS.find(m => m.key === key) ||
    // allow mapping of LCR keys into surrounds if labels match
    MODELS.find(m => m.label.toLowerCase() === String(modelName).trim().toLowerCase());

  if (!hit) {
    // HARD FAIL SAFE — don't silently substitute sizes
    return { 
      widthM: 0.27, 
      heightM: 0.27, 
      depthM: 0.082, 
      round: false, 
      notFound: true, 
      key, 
      label: String(modelName),
      sensitivity_dB_1w1m: null,
      sensitivity_dB_2p83: null,
      nominalOhms: null,
    };
  }

  if (hit.round) {
    return {
      round: true,
      diameterM: mmToM(hit.diameterMm),
      depthM: mmToM(hit.depthMm),
      widthM: mmToM(hit.diameterMm),   // for generic callers
      heightM: mmToM(hit.diameterMm),  // for generic callers
      key: hit.key,
      label: hit.label,
      category: hit.category,
      sensitivity_dB_1w1m: hit.sensitivity_dB_1w1m ?? null,
      sensitivity_dB_2p83: hit.sensitivity_dB_2p83 ?? null,
      nominalOhms: hit.nominalOhms ?? null,
    };
  }

  return {
    round: false,
    widthM: mmToM(hit.widthMm),
    heightM: mmToM(hit.heightMm),
    depthM: mmToM(hit.depthMm),
    key: hit.key,
    label: hit.label,
    category: hit.category,
    sensitivity_dB_1w1m: hit.sensitivity_dB_1w1m ?? null,
    sensitivity_dB_2p83: hit.sensitivity_dB_2p83 ?? null,
    nominalOhms: hit.nominalOhms ?? null,
  };
}

// CATEGORY LISTS IN EXACT UI ORDER
export function getModelsByCategoryOrdered() {
  const byCat = { LCR: [], SURROUNDS: [], ARCHITECT: [], SUBWOOFERS: [] };
  MODELS.forEach(m => { 
    if (byCat[m.category]) { // Ensure category exists before pushing
      byCat[m.category].push(m); 
    }
  });
  const ordered = {};
  CATEGORY_ORDER.forEach(cat => { ordered[cat] = byCat[cat] || []; });
  return ordered;
}

export default { getSpeakerModelMeta, getModelsByCategoryOrdered, normaliseModelKey, CATEGORY_ORDER, MODELS };
