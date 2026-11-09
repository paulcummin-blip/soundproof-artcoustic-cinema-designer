// classifyStagingUpdate.js
// ---------------------------------------------------------------------------
// Pure diff between the staging workbook and the live Speaker Database.
//
// Identity uses the SAME normalisers the Speaker Database and the comparison
// engine use (manufacturerIdentity), so a workbook row that is the same
// product under a different spelling ("S-150 mkII" vs "S150 MKII") is matched,
// and a row that is genuinely different ("Sinergy" vs "Cinergy", "CT8 LCR" vs
// "CT8.2 LCR") is NOT merged.
//
// Output groups:
//   existingUnchanged — already in the database; left exactly as it is.
//   newProducts        — no match; a new product the admin can approve.
//   needsReview        — uncertain identity or a likely duplicate; never
//                        auto-created. Each carries a plain-English reason.
//   manufacturerMappings — workbook manufacturer name that probably maps to an
//                          existing manufacturer under a different spelling
//                          ("Triad" → "Triad Speakers"). The admin chooses.
//   newManufacturers    — brands without models, not yet in the database.
//   existingManufacturers — brands without models already present.
//   brandAmbiguous      — brand without models whose name probably maps to an
//                          existing manufacturer ("JBL" → "JBL Synthesis").
//
// Nothing here writes, calculates an engineering value, or publishes.

import {
  normaliseManufacturerIdentity,
  normaliseModelIdentity,
} from "@/components/utils/spl/manufacturerIdentity";

// Explicit attention the brief calls out by name. Keyed on
// `${normManufacturer}::${normModel}` so it survives spelling differences.
const ATTENTION = {
  "mksound::iw19": "Confirm this is a real M and K model. The brief asks to check it against IW95 — no IW95 exists in the database today, so this is likely a new model, but verify the model name before creating it.",
  "monitoraudio::sinergy100": "The manufacturer URL says 'cinergy'. Confirm the canonical model name is 'Cinergy 100' (not 'Sinergy') before creating.",
  "monitoraudio::sinergy200": "The manufacturer URL says 'cinergy'. Confirm the canonical model name is 'Cinergy 200' (not 'Sinergy') before creating.",
  "monitoraudio::sinergy300": "The manufacturer URL says 'cinergy'. Confirm the canonical model name is 'Cinergy 300' (not 'Sinergy') before creating.",
  "bowerswilkins::ct8lcr": "The database already has 'CT8.2 LCR'. Confirm whether 'CT8 LCR' is the same model or a distinct one before creating.",
  "ascendoimmersiveaudio::the10propassive": "The database has 'THE10 PASSIVE ON WALL' (non-PRO). Confirm THE10 PRO PASSIVE is a distinct PRO variant and not a duplicate.",
};

// Workbook manufacturers whose name does not match an existing manufacturer
// exactly but very likely IS one (a containment match on the normalised name).
const MANUFACTURER_MAPPING_NOTES = {
  triad: "The workbook uses 'Triad'. The database has 'Triad Speakers'. These are almost certainly the same manufacturer.",
};

function urlKind(url) {
  if (!url) return null;
  return /\.pdf(\?|$)/i.test(url) || /pdf/i.test(url.split("/").pop() || "") ? "pdf" : "page";
}

function isPlacementDescriptorDifference(a, b) {
  // "THE5 PASSIVE" vs "THE5 PASSIVE ON WALL" — the only difference is a trailing
  // placement descriptor. Treat as a likely duplicate needing review.
  const tokens = ["onwall", "inwall", "onceiling", "inceiling", "ow", "iw"];
  const strip = (s) => tokens.reduce((acc, t) => acc.replace(new RegExp(t, "g"), ""), s);
  return strip(a) === strip(b) && a !== b;
}

function asArray(value) {
  return Array.isArray(value) ? value : value?.items || [];
}

/**
 * @param {object} params { workbook, existing }
 *   workbook: { models: [{manufacturer, model, url}], brandsWithoutModels: [name] }
 *   existing: { manufacturers: [{id,name}], products: [{id, manufacturer_id, manufacturer_name, model}] }
 * @returns {object} classification
 */
export function classifyStagingUpdate({ workbook, existing }) {
  const manufacturers = asArray(existing?.manufacturers);
  const products = asArray(existing?.products);

  const manufByNorm = new Map();
  for (const m of manufacturers) manufByNorm.set(normaliseManufacturerIdentity(m.name), m);

  // manufacturer containment candidates (workbook name ⊂ existing name or vice versa)
  const findManufacturerCandidates = (normName) => {
    if (!normName) return [];
    const out = [];
    for (const m of manufacturers) {
      const n = normaliseManufacturerIdentity(m.name);
      if (n === normName) continue;
      if (n.includes(normName) || normName.includes(n)) out.push(m);
    }
    return out;
  };

  // products grouped by normalised manufacturer name -> normalised model -> product
  const productsByManufNorm = new Map();
  for (const p of products) {
    if (!p.manufacturer_id && !p.manufacturer_name) continue;
    const mk = normaliseManufacturerIdentity(p.manufacturer_name || "");
    if (!productsByManufNorm.has(mk)) productsByManufNorm.set(mk, new Map());
    const modelMap = productsByManufNorm.get(mk);
    const modKey = normaliseModelIdentity(p.model);
    if (!modelMap.has(modKey)) modelMap.set(modKey, p);
  }

  const existingUnchanged = [];
  const newProducts = [];
  const needsReview = [];
  const manufacturerMappings = {}; // workbookNorm -> { workbookName, candidates: [{id,name}], models: [workbookModels] }

  for (const row of workbook.models || []) {
    const wbManuf = String(row.manufacturer || "").trim();
    const wbModel = String(row.model || "").trim();
    if (!wbManuf || !wbModel) continue;
    const manufNorm = normaliseManufacturerIdentity(wbManuf);
    const modelNorm = normaliseModelIdentity(wbModel);
    const kind = urlKind(row.url);
    const base = { manufacturer: wbManuf, model: wbModel, url: row.url || null, urlKind: kind };
    const attentionKey = `${manufNorm}::${modelNorm}`;
    const attention = ATTENTION[attentionKey] || null;

    const exactManuf = manufByNorm.get(manufNorm) || null;

    if (exactManuf) {
      const modelMap = productsByManufNorm.get(manufNorm);
      const exactProd = modelMap?.get(modelNorm) || null;
      if (exactProd) {
        existingUnchanged.push({ ...base, existingProductId: exactProd.id });
        continue;
      }
      // near model under the same manufacturer — likely duplicate
      let near = null;
      if (modelMap) {
        for (const [existingModelNorm, prod] of modelMap.entries()) {
          if (existingModelNorm === modelNorm) continue;
          if (isPlacementDescriptorDifference(existingModelNorm, modelNorm)
              || existingModelNorm.includes(modelNorm)
              || modelNorm.includes(existingModelNorm)) {
            near = prod;
            break;
          }
        }
      }
      if (near) {
        needsReview.push({
          ...base,
          reason: `Probably the same product as the existing ${exactManuf.name} ${near.model}. The workbook spells the model differently. Confirm before creating.`,
          attention,
        });
        continue;
      }
      if (attention) {
        needsReview.push({ ...base, reason: "Flagged for review in the brief.", attention });
        continue;
      }
      newProducts.push({ ...base, manufacturerId: exactManuf.id, manufacturerName: exactManuf.name });
      continue;
    }

    // no exact manufacturer — look for a containment candidate (Triad vs Triad Speakers)
    const candidates = findManufacturerCandidates(manufNorm);
    if (candidates.length) {
      if (!manufacturerMappings[manufNorm]) {
        manufacturerMappings[manufNorm] = {
          workbookName: wbManuf,
          note: MANUFACTURER_MAPPING_NOTES[manufNorm] || "The workbook manufacturer name probably maps to an existing manufacturer under a different spelling.",
          candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
          models: [],
        };
      }
      manufacturerMappings[manufNorm].models.push(base);
      needsReview.push({
        ...base,
        reason: `Manufacturer '${wbManuf}' is not in the database, but it may be '${candidates[0].name}'. Choose a manufacturer mapping before approving.`,
        attention,
      });
      continue;
    }

    if (attention) {
      needsReview.push({ ...base, reason: "Flagged for review in the brief.", attention });
      continue;
    }
    // genuinely new manufacturer + new product
    newProducts.push({ ...base, manufacturerName: wbManuf, manufacturerId: null });
  }

  // Brands without models
  const newManufacturers = [];
  const existingManufacturersList = [];
  const brandAmbiguous = [];
  for (const name of workbook.brandsWithoutModels || []) {
    const clean = String(name || "").trim();
    if (!clean) continue;
    const norm = normaliseManufacturerIdentity(clean);
    const exact = manufByNorm.get(norm);
    if (exact) {
      existingManufacturersList.push({ name: clean, existingName: exact.name });
      continue;
    }
    const candidates = findManufacturerCandidates(norm);
    if (candidates.length) {
      brandAmbiguous.push({
        workbookName: clean,
        note: `Probably the same manufacturer as '${candidates[0].name}'. Choose map-to-existing or create-new.`,
        candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
      });
      continue;
    }
    newManufacturers.push({ name: clean });
  }

  return {
    existingUnchanged,
    newProducts,
    needsReview,
    manufacturerMappings,
    newManufacturers,
    existingManufacturers: existingManufacturersList,
    brandAmbiguous,
    counts: {
      existingUnchanged: existingUnchanged.length,
      newProducts: newProducts.length,
      needsReview: needsReview.length,
      newManufacturers: newManufacturers.length,
      existingManufacturers: existingManufacturersList.length,
      brandAmbiguous: brandAmbiguous.length,
    },
  };
}