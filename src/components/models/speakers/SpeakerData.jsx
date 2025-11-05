/** SpeakerData — minimal product catalogue for plan/clearance logic */

/**
 * @typedef {"rect"|"round"|"column"} SpeakerShape
 */

/**
 * @typedef {Object} ProductDims
 * @property {number} w   // width  (m)
 * @property {number} h   // height (m)
 * @property {number} d   // depth  (m)
 * @property {SpeakerShape} shape
 */

/**
 * @typedef {Object} SpeakerProduct
 * @property {string} id
 * @property {"SUB"|"LCR"|"SURROUND"|"OVERHEAD"} family
 * @property {ProductDims} dims
 * @property {string=} label
 */

// --- utility ---
const cm = (v) => v / 100;

// --- existing exports would stay as-is; append subs here ---
/** @type {Record<string, SpeakerProduct>} */
export const PRODUCTS = {
  // Subwoofers
  "SUB2-12": {
    id: "SUB2-12",
    family: "SUB",
    dims: { w: cm(50), h: cm(50), d: cm(26.3), shape: "rect" },
    label: "SUB2‑12",
  },
  "SUB3-12": {
    id: "SUB3-12",
    family: "SUB",
    dims: { w: cm(50), h: cm(50), d: cm(26.3), shape: "rect" },
    label: "SUB3‑12",
  },
  "SUB4": {
    id: "SUB4",
    family: "SUB",
    dims: { w: cm(44), h: cm(170), d: cm(27), shape: "column" }, // tall column
    label: "SUB4",
  },
};