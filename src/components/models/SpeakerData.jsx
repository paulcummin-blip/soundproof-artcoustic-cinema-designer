/**
 * Central catalogue of loudspeaker physical data (meters) + mount geometry helpers.
 * JS version with JSDoc types for editor hints.
 */

/**
 * @typedef {"SPITFIRE_Q4_3"|"SPITFIRE_Q6_3"|"SPITFIRE_Q4_5"|"SPITFIRE_Q8_5"|"EVOLVE_2_1"|"EVOLVE_3_1"|"EVOLVE_4_2"|"EVOLVE_6_3"|"EVOLVE_8_4"} SpeakerId
 */

/**
 * @typedef {Object} SpeakerDims
 * @property {number} widthM  Horizontal size (left-right on the wall), in meters
 * @property {number} heightM Vertical size (top-bottom on the wall), in meters
 * @property {number} depthM  Physical cabinet depth (front baffle to back), in meters
 */

/**
 * @typedef {Object} SpeakerSpec
 * @property {SpeakerId} id
 * @property {"Artcoustic"} brand
 * @property {string} model
 * @property {"Spitfire"|"Evolve"} series
 * @property {SpeakerDims} dims
 * @property {number} minScreenClearanceM  Minimum clearance in front of baffle to the screen (default 0.02 m)
 * @property {"on-wall"} defaultMount
 */

/** Convert centimeters to meters */
const cm = (v) => v / 100;

/** @type {Record<SpeakerId, SpeakerSpec>} */
export const SPEAKERS = {
  // ─────────── Spitfire ───────────
  SPITFIRE_Q4_3: {
    id: "SPITFIRE_Q4_3",
    brand: "Artcoustic",
    model: "Spitfire Q4-3",
    series: "Spitfire",
    dims: { widthM: cm(28), heightM: cm(21), depthM: cm(11.5) },
    minScreenClearanceM: 0.02,
    defaultMount: "on-wall",
  },
  SPITFIRE_Q6_3: {
    id: "SPITFIRE_Q6_3",
    brand: "Artcoustic",
    model: "Spitfire Q6-3",
    series: "Spitfire",
    dims: { widthM: cm(28), heightM: cm(28), depthM: cm(11.5) },
    minScreenClearanceM: 0.02,
    defaultMount: "on-wall",
  },
  SPITFIRE_Q4_5: {
    id: "SPITFIRE_Q4_5",
    brand: "Artcoustic",
    model: "Spitfire Q4-5",
    series: "Spitfire",
    dims: { widthM: cm(50), heightM: cm(40), depthM: cm(16.7) },
    minScreenClearanceM: 0.02,
    defaultMount: "on-wall",
  },
  SPITFIRE_Q8_5: {
    id: "SPITFIRE_Q8_5",
    brand: "Artcoustic",
    model: "Spitfire Q8-5",
    series: "Spitfire",
    dims: { widthM: cm(50), heightM: cm(60), depthM: cm(16.7) },
    minScreenClearanceM: 0.02,
    defaultMount: "on-wall",
  },

  // ─────────── Evolve ───────────
  EVOLVE_2_1: {
    id: "EVOLVE_2_1",
    brand: "Artcoustic",
    model: "Evolve 2-1",
    series: "Evolve",
    dims: { widthM: cm(20), heightM: cm(20), depthM: cm(8.2) },
    minScreenClearanceM: 0.02,
    defaultMount: "on-wall",
  },
  EVOLVE_3_1: {
    id: "EVOLVE_3_1",
    brand: "Artcoustic",
    model: "Evolve 3-1",
    series: "Evolve",
    dims: { widthM: cm(27), heightM: cm(27), depthM: cm(8.3) }, // “8.3mm” interpreted as 8.3 cm
    minScreenClearanceM: 0.02,
    defaultMount: "on-wall",
  },
  EVOLVE_4_2: {
    id: "EVOLVE_4_2",
    brand: "Artcoustic",
    model: "Evolve 4-2",
    series: "Evolve",
    dims: { widthM: cm(27), heightM: cm(27), depthM: cm(8.3) },
    minScreenClearanceM: 0.02,
    defaultMount: "on-wall",
  },
  EVOLVE_6_3: {
    id: "EVOLVE_6_3",
    brand: "Artcoustic",
    model: "Evolve 6-3",
    series: "Evolve",
    dims: { widthM: cm(27), heightM: cm(27), depthM: cm(8.3) },
    minScreenClearanceM: 0.02,
    defaultMount: "on-wall",
  },
  EVOLVE_8_4: {
    id: "EVOLVE_8_4",
    brand: "Artcoustic",
    model: "Evolve 8-4",
    series: "Evolve",
    dims: { widthM: cm(27), heightM: cm(27), depthM: cm(8.3) },
    minScreenClearanceM: 0.02,
    defaultMount: "on-wall",
  },
};

/** Quick accessor */
export function getSpeaker(id) {
  return SPEAKERS[id];
}

/**
 * Effective normal-to-wall projection for an ON-WALL speaker yawed by `angleDeg`.
 * We model the bracket as adding a fixed 0.10 m stand-off, and yaw adds (width/2)*sin(|angle|).
 * If not angled or no finite angle, returns base depth.
 * @param {number} baseDepthM
 * @param {number} widthM
 * @param {number|null|undefined} angleDeg
 * @param {boolean} isAngled
 */
export function effectiveDepthOnWall(baseDepthM, widthM, angleDeg, isAngled) {
  const ang = Number(angleDeg);
  if (!isAngled || !Number.isFinite(ang)) return Number(baseDepthM) || 0;
  const a = Math.abs(ang) * (Math.PI / 180);
  const extraFromYaw = (Number(widthM) / 2) * Math.sin(a); // inner corner swings out
  const bracket = 0.10; // 10 cm bracket allowance
  return (Number(baseDepthM) || 0) + bracket + extraFromYaw;
}

/**
 * Convenience: compute effective depth from a speaker spec for a given yaw angle.
 * @param {SpeakerSpec} spec
 * @param {number} [angleDeg=0]
 * @param {boolean} [isAngled=false]
 */
export function getEffectiveDepth(spec, angleDeg = 0, isAngled = false) {
  if (!spec || !spec.dims) return 0;
  return effectiveDepthOnWall(spec.dims.depthM, spec.dims.widthM, angleDeg, !!isAngled);
}