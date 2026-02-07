// components/models/speakers/registry.js
// CANONICAL SPEAKER REGISTRY — DO NOT EDIT WITHOUT APPROVAL
// Units: millimetres. Plan view uses widthMm (X) and depthMm (Y). Height is for reporting/UI.
// Overheads use diameterMm + depthMm and render as circles in plan view.

const mmToM = (mm) => Math.round((Number(mm) || 0) * 1e-3 * 1e6) / 1e6; // 1 µm precision

export const CATEGORY_ORDER = ["LCR", "SURROUNDS", "ARCHITECT", "SUBWOOFERS"];

export const MODELS = [
  // LCR — EXACT ORDER
  { key: "q4-3", label: "Q4-3", category: "LCR", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 98, nominalOhms: 8, max_power: 120, price_gbp_exVat: null, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
  { key: "q6-3", label: "Q6-3", category: "LCR", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 10, max_power: 120, price_gbp_exVat: null, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 39, minus3dB: 48, minus5dB: 64 } } },
  { key: "q4-5", label: "Q4-5", category: "LCR", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 99, sensitivity_dB_2p83: 99, nominalOhms: 8, max_power: 400, price_gbp_exVat: null, hfOffAxis16k: { minus3deg: 40, minus5deg: 50 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
  { key: "q8-5", label: "Q8-5", category: "LCR", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 106, nominalOhms: 4, max_power: 800, price_gbp_exVat: null, hfOffAxis16k: { minus3deg: 40, minus5deg: 50 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
  { key: "evolve-2-1", label: "EVOLVE 2-1", category: "LCR", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 100, nominalOhms: 4, max_power: 60, price_gbp_exVat: 780, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 31, minus3dB: 45, minus5dB: 64 } } },
  { key: "evolve-3-1", label: "EVOLVE 3-1", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 101, nominalOhms: 3, max_power: 90, price_gbp_exVat: 1170, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 39, minus3dB: 55, minus5dB: 73 } } },
  { key: "evolve-4-2", label: "EVOLVE 4-2", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 99, nominalOhms: 4, max_power: 120, price_gbp_exVat: 1780, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
  { key: "evolve-6-3", label: "EVOLVE 6-3", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 103, nominalOhms: 4, max_power: 180, price_gbp_exVat: 2250, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
  { key: "evolve-8-4", label: "EVOLVE 8-4", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 102, sensitivity_dB_2p83: 106, nominalOhms: 3, max_power: 240, price_gbp_exVat: 2720, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },

  // SURROUNDS — EXACT ORDER
  { key: "evolve-1-1_s", label: "EVOLVE 1-1", category: "SURROUNDS", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 96, nominalOhms: 8, max_power: 30, price_gbp_exVat: 550 },
  { key: "evolve-2-1_s", label: "EVOLVE 2-1", category: "SURROUNDS", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 100, nominalOhms: 4, max_power: 60, price_gbp_exVat: 780 },
  { key: "evolve-3-1_s", label: "EVOLVE 3-1", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 101, nominalOhms: 3, max_power: 90, price_gbp_exVat: 1170 },
  { key: "evolve-4-2_s", label: "EVOLVE 4-2", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 99, nominalOhms: 4, max_power: 120, price_gbp_exVat: 1780 },
  { key: "evolve-6-3_s", label: "EVOLVE 6-3", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 103, nominalOhms: 4, max_power: 180, price_gbp_exVat: 2250 },
  { key: "evolve-8-4_s", label: "EVOLVE 8-4", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 102, sensitivity_dB_2p83: 106, nominalOhms: 3, max_power: 240, price_gbp_exVat: 2720 },
  { key: "q4-3_s", label: "Q4-3", category: "SURROUNDS", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 98, nominalOhms: 8, max_power: 120, price_gbp_exVat: null },
  { key: "q6-3_s", label: "Q6-3", category: "SURROUNDS", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 10, max_power: 120, price_gbp_exVat: null },
  { key: "q4-5_s", label: "Q4-5", category: "SURROUNDS", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 99, sensitivity_dB_2p83: 99, nominalOhms: 8, max_power: 400, price_gbp_exVat: null },
  { key: "q8-5_s", label: "Q8-5", category: "SURROUNDS", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 106, nominalOhms: 4, max_power: 800, price_gbp_exVat: null },

  // ARCHITECT (OVERHEAD) — EXACT ORDER
  { 
    key: "architect-mikro",
    label: "ARCHITECT Mikro",
    category: "ARCHITECT",
    widthMm: 54,     // short edge (left/right)
    depthMm: 138,    // long edge (front/back)
    heightMm: 26,    // physical depth only for reporting
    round: false,    // MUST be explicitly false
    sensitivity_dB_1w1m: 86,
    sensitivity_dB_2p83: 86,
    nominalOhms: 8,
    max_power: 15,
            price_gbp_exVat: null,
            builtInTiltDeg: 0,
    dispersion: {
      horizontal: {
        minus1p5dB: 90,
        minus3dB: 90,
        minus5dB: 90,
      }
    }
  },
  { 
    key: "architect-2-1", 
    label: "ARCHITECT 2-1", 
    category: "ARCHITECT", 
    diameterMm: 240, 
    depthMm: 120, 
    round: true, 
    sensitivity_dB_1w1m: 97, 
    sensitivity_dB_2p83: 100, 
    nominalOhms: 4, 
    max_power: 60,
    price_gbp_exVat: 740,
    builtInTiltDeg: 5,
    dispersion: {
      horizontal: {
        minus1p5dB: 40,
        minus3dB: 55,
        minus5dB: 72,
      }
    }
  },
  { 
    key: "architect-4-2", 
    label: "ARCHITECT 4-2", 
    category: "ARCHITECT", 
    diameterMm: 300, 
    depthMm: 120, 
    round: true, 
    sensitivity_dB_1w1m: 97, 
    sensitivity_dB_2p83: 97, 
    nominalOhms: 4, 
    max_power: 120,
    price_gbp_exVat: 1230,
    builtInTiltDeg: 5,
    dispersion: {
      horizontal: {
        minus1p5dB: 30,
        minus3dB: 45,
        minus5dB: 63,
      }
    }
  },
  { 
    key: "architect-pas2-2", 
    label: "ARCHITECT PAS2-2", 
    category: "ARCHITECT", 
    diameterMm: 300, 
    depthMm: 150, 
    round: true, 
    sensitivity_dB_1w1m: 97, 
    sensitivity_dB_2p83: 97, 
    nominalOhms: 4, 
    max_power: 120,
    price_gbp_exVat: 1200,
    builtInTiltDeg: 20,
    dispersion: {
      horizontal: {
        minus1p5dB: 19,
        minus3dB: 33,
        minus5dB: 52,
      }
    }
  },

  // SUBWOOFERS — EXACT ORDER
  { 
    key: "sub2-12", 
    label: "SUB2-12", 
    category: "SUBWOOFERS", 
    widthMm: 500, 
    heightMm: 500, 
    depthMm: 255, 
    sensitivity_dB_1w1m: 94, 
    max_power: 350,
    price_gbp_exVat: 2190,
    frequency_response_curve: [[15, 80], [20, 86], [25, 90], [30, 92], [40, 94], [50, 94], [63, 93], [80, 91], [100, 87], [125, 82], [160, 75], [200, 68]]
  },
  { 
    key: "sub3-12", 
    label: "SUB3-12", 
    category: "SUBWOOFERS", 
    widthMm: 600, 
    heightMm: 600, 
    depthMm: 255, 
    sensitivity_dB_1w1m: 97, 
    max_power: 700,
    price_gbp_exVat: 3740,
    frequency_response_curve: [[15, 83], [20, 89], [25, 93], [30, 95], [40, 97], [50, 97], [63, 96], [80, 94], [100, 90], [125, 85], [160, 78], [200, 71]]
  },
  { 
    key: "sub4-12", 
    label: "SUB4-12", 
    category: "SUBWOOFERS", 
    widthMm: 440, 
    heightMm: 1700, 
    depthMm: 270, 
    sensitivity_dB_1w1m: 99, 
    max_power: 1400,
    price_gbp_exVat: 6000,
    frequency_response_curve: [[15, 85], [20, 91], [25, 95], [30, 97], [40, 99], [50, 99], [63, 98], [80, 96], [100, 92], [125, 87], [160, 80], [200, 73]]
  },
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
  s = s.replace(/^architect-mikro$/, "architect-mikro");
  
  // Safety net: normalise a trailing "-s" back to "_s"
  if (s.endsWith("-s")) {
      s = s.slice(0, -2) + "_s";
  }

  // allow "_s" variants for surrounds already keyed above
  return s;
}

// DISPLAY HELPER — Remove _s suffix for UI display
export function displayModelKey(modelKey = "") {
  const key = String(modelKey || "");
  return key.endsWith("_s") ? key.slice(0, -2) : key;
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
      price_gbp_exVat: null,
      sensitivity_dB_1w1m: null,
      sensitivity_dB_2p83: null,
      nominalOhms: null,
      max_power: null,
      frequency_response_curve: null,
    };
  }

  // If this is a SURROUNDS "_s" variant and it lacks dispersion data,
  // inherit dispersion (and hfOffAxis16k) from the matching non-s model.
  // This keeps P17 product-dependent for surrounds without duplicating tables.
  const inherited =
    (hit?.key && hit.key.endsWith("_s"))
      ? MODELS.find(m => m.key === hit.key.replace(/_s$/, ""))
      : null;

  const finalDispersion = hit?.dispersion ?? inherited?.dispersion ?? null;
  const finalHfOffAxis16k = hit?.hfOffAxis16k ?? inherited?.hfOffAxis16k ?? null;

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
      max_power: hit.max_power ?? null,
      hfOffAxis16k: finalHfOffAxis16k,
      builtInTiltDeg: hit.builtInTiltDeg ?? null,
      dispersion: finalDispersion,
      frequency_response_curve: hit.frequency_response_curve ?? null,
      price_gbp_exVat: hit.price_gbp_exVat ?? null,
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
    max_power: hit.max_power ?? null,
    hfOffAxis16k: finalHfOffAxis16k,
    builtInTiltDeg: hit.builtInTiltDeg ?? null,
    dispersion: finalDispersion,
    frequency_response_curve: hit.frequency_response_curve ?? null,
    price_gbp_exVat: hit.price_gbp_exVat ?? null,
  };
}

// SUBWOOFER RESPONSE CURVE ACCESSOR (for engine use)
export function hasSpeakerModel(modelName) {
        const key = normaliseModelKey(modelName);
        return MODELS.some(m => m.key === key);
      }
      
      export function getSpeakerPriceGbp(modelName) {
        const key = normaliseModelKey(modelName);
        const model = MODELS.find(m => m.key === key);
        return Number.isFinite(model?.price_gbp_exVat) ? model.price_gbp_exVat : null;
      }
      
      export function getSubResponseCurve(modelKey) {
  const normalized = normaliseModelKey(modelKey);
  const model = MODELS.find(m => m.key === normalized);
  
  if (!model || !model.frequency_response_curve) {
    return null;
  }
  
  // Convert [[hz, db], ...] array to [{frequency, spl}, ...] format
  return model.frequency_response_curve.map(([frequency, spl]) => ({
    frequency,
    spl
  }));
}

// VALIDATION HELPER
export function isValidCurve(curve) {
  if (!Array.isArray(curve)) return false;
  return curve.every(point => 
    Array.isArray(point) && 
    point.length === 2 && 
    typeof point[0] === 'number' && 
    typeof point[1] === 'number'
  );
}

// SUBWOOFER CURVE ACCESSOR (for chart plotting)
export function getSubwooferCurve(modelKey) {
  const normalized = normaliseModelKey(modelKey);
  const model = MODELS.find(m => m.key === normalized);
  
  if (!model || !model.frequency_response_curve) {
    return null;
  }
  
  const rawCurve = model.frequency_response_curve;
  if (!isValidCurve(rawCurve)) {
    return null;
  }
  
  // Convert [[hz, db], ...] to [{hz, db}, ...]
  return rawCurve.map(([hz, db]) => ({ hz, db }));
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

export default { getSpeakerModelMeta, getModelsByCategoryOrdered, normaliseModelKey, getSubResponseCurve, getSubwooferCurve, isValidCurve, getSpeakerPriceGbp, hasSpeakerModel, CATEGORY_ORDER, MODELS };