// stage1FamilyRegistry.js
// Stable family identities, display metadata, and search hierarchy for Stage 1.
// A is prohibited. B is gated/disabled for normal Stage 1.

import { STAGE1_FAMILY_POLICY_VERSION } from "./stage1Constants";

// ── Family IDs ──────────────────────────────────────────────────────────
export const FAMILY_IDS = Object.freeze({
  // One sub
  ONE_FRONT_MID: "ONE_FRONT_MID",
  ONE_FRONT_QUARTER: "ONE_FRONT_QUARTER",
  ONE_REAR_MID: "ONE_REAR_MID",
  ONE_SIDE_QUARTER: "ONE_SIDE_QUARTER",
  ONE_BOUNDARY_CUSTOM: "ONE_BOUNDARY_CUSTOM",

  // Two subs
  C_FRONT_PAIR: "C_FRONT_PAIR",
  FRONT_THIRD_PAIR: "FRONT_THIRD_PAIR",
  FRONT_CORNER_PAIR: "FRONT_CORNER_PAIR",
  REAR_QUARTER_PAIR: "REAR_QUARTER_PAIR",
  REAR_THIRD_PAIR: "REAR_THIRD_PAIR",
  REAR_CORNER_PAIR: "REAR_CORNER_PAIR",
  RP22_F: "RP22_F",
  RP22_G: "RP22_G",
  TWO_SYMMETRIC_BOUNDARY_CUSTOM: "TWO_SYMMETRIC_BOUNDARY_CUSTOM",
  TWO_ASYMMETRIC_BOUNDARY_CUSTOM: "TWO_ASYMMETRIC_BOUNDARY_CUSTOM",

  // Four subs
  RP22_C: "RP22_C",
  RP22_E: "RP22_E",
  FOUR_THIRD_PAIRS: "FOUR_THIRD_PAIRS",
  RP22_D: "RP22_D",
  FOUR_SYMMETRIC_BOUNDARY_CUSTOM: "FOUR_SYMMETRIC_BOUNDARY_CUSTOM",
  FOUR_ASYMMETRIC_BOUNDARY_CUSTOM: "FOUR_ASYMMETRIC_BOUNDARY_CUSTOM",
  RP22_B_LAST_RESORT: "RP22_B_LAST_RESORT",

  // Prohibited — never generated, never surfaces
  RP22_A: "RP22_A",
});

// ── Display metadata for UI (Stage 2 will consume) ──────────────────────
export const FAMILY_DISPLAY_METADATA = Object.freeze({
  [FAMILY_IDS.C_FRONT_PAIR]: {
    label: "Front quarter positions",
    description: "Derived from the front pair of RP22 layout C",
  },
  [FAMILY_IDS.FRONT_THIRD_PAIR]: {
    label: "Front third positions",
    description: "Front wall third positions (0.333W / 0.667W)",
  },
  [FAMILY_IDS.FRONT_CORNER_PAIR]: {
    label: "Front corners",
    description: "Front wall corner positions",
  },
  [FAMILY_IDS.REAR_QUARTER_PAIR]: {
    label: "Rear quarter positions",
    description: "Rear wall quarter positions (0.25W / 0.75W)",
  },
  [FAMILY_IDS.REAR_THIRD_PAIR]: {
    label: "Rear third positions",
    description: "Rear wall third positions (0.333W / 0.667W)",
  },
  [FAMILY_IDS.REAR_CORNER_PAIR]: {
    label: "Rear corners",
    description: "Rear wall corner positions",
  },
  [FAMILY_IDS.RP22_C]: {
    label: "RP22 C · Front/rear quarter positions",
    description: "Front and rear wall quarter positions",
  },
  [FAMILY_IDS.RP22_E]: {
    label: "RP22 E · Four corners",
    description: "Four corner positions",
  },
  [FAMILY_IDS.FOUR_THIRD_PAIRS]: {
    label: "Front/rear third positions",
    description: "Front and rear wall third positions (0.333W / 0.667W)",
  },
  [FAMILY_IDS.RP22_D]: {
    label: "RP22 D · Side-wall quarter positions",
    description: "Side-wall quarter positions",
  },
  [FAMILY_IDS.RP22_F]: {
    label: "RP22 F · Opposing wall midpoints",
    description: "Front and rear wall midpoints",
  },
  [FAMILY_IDS.RP22_G]: {
    label: "RP22 G · Side-wall midpoints",
    description: "Left and right wall midpoints",
  },
  [FAMILY_IDS.RP22_B_LAST_RESORT]: {
    label: "RP22 B · Four wall midpoints · fallback",
    description: "Four wall midpoints — last resort only",
  },
  [FAMILY_IDS.ONE_FRONT_MID]: { label: "Front wall midpoint", description: "Single front wall midpoint" },
  [FAMILY_IDS.ONE_FRONT_QUARTER]: { label: "Front wall quarter", description: "Single front wall quarter position" },
  [FAMILY_IDS.ONE_REAR_MID]: { label: "Rear wall midpoint", description: "Single rear wall midpoint" },
  [FAMILY_IDS.ONE_SIDE_QUARTER]: { label: "Side wall quarter", description: "Single side wall quarter position" },
  [FAMILY_IDS.ONE_BOUNDARY_CUSTOM]: { label: "Boundary custom", description: "Custom boundary position" },
  [FAMILY_IDS.TWO_SYMMETRIC_BOUNDARY_CUSTOM]: { label: "Symmetric boundary custom", description: "Custom symmetric boundary pair" },
  [FAMILY_IDS.TWO_ASYMMETRIC_BOUNDARY_CUSTOM]: { label: "Asymmetric boundary custom", description: "Custom asymmetric boundary pair" },
  [FAMILY_IDS.FOUR_SYMMETRIC_BOUNDARY_CUSTOM]: { label: "Symmetric boundary custom", description: "Custom symmetric boundary quad" },
  [FAMILY_IDS.FOUR_ASYMMETRIC_BOUNDARY_CUSTOM]: { label: "Asymmetric boundary custom", description: "Custom asymmetric boundary quad" },
  // RP22_A has NO display metadata — it must never surface.
});

// ── Search hierarchy (ordered preference) ──────────────────────────────
// Lower rank = higher preference. Used as the last lexicographic tiebreaker.
export const FAMILY_PREFERENCE_RANK = Object.freeze({
  // Two subs
  [FAMILY_IDS.C_FRONT_PAIR]: 1,
  [FAMILY_IDS.FRONT_THIRD_PAIR]: 2,
  [FAMILY_IDS.FRONT_CORNER_PAIR]: 3,
  [FAMILY_IDS.REAR_QUARTER_PAIR]: 4,
  [FAMILY_IDS.REAR_THIRD_PAIR]: 5,
  [FAMILY_IDS.REAR_CORNER_PAIR]: 6,
  [FAMILY_IDS.RP22_F]: 7,
  [FAMILY_IDS.RP22_G]: 8,
  [FAMILY_IDS.TWO_SYMMETRIC_BOUNDARY_CUSTOM]: 9,
  [FAMILY_IDS.TWO_ASYMMETRIC_BOUNDARY_CUSTOM]: 10,

  // Four subs
  [FAMILY_IDS.RP22_E]: 1,
  [FAMILY_IDS.RP22_C]: 2,
  [FAMILY_IDS.FOUR_THIRD_PAIRS]: 3,
  [FAMILY_IDS.RP22_D]: 4,
  [FAMILY_IDS.FOUR_SYMMETRIC_BOUNDARY_CUSTOM]: 5,
  [FAMILY_IDS.FOUR_ASYMMETRIC_BOUNDARY_CUSTOM]: 6,
  [FAMILY_IDS.RP22_B_LAST_RESORT]: 99,

  // One sub
  [FAMILY_IDS.ONE_FRONT_MID]: 1,
  [FAMILY_IDS.ONE_FRONT_QUARTER]: 2,
  [FAMILY_IDS.ONE_REAR_MID]: 3,
  [FAMILY_IDS.ONE_SIDE_QUARTER]: 4,
  [FAMILY_IDS.ONE_BOUNDARY_CUSTOM]: 5,
});

// ── Seed coordinates (normalised) ───────────────────────────────────────
// Wall coordinate = acoustic centre. No cabinet offset.
export const FAMILY_SEEDS = Object.freeze({
  // One sub
  [FAMILY_IDS.ONE_FRONT_MID]: [{ xNorm: 0.50, yNorm: 0 }],
  [FAMILY_IDS.ONE_FRONT_QUARTER]: [
    { xNorm: 0.25, yNorm: 0 },
    { xNorm: 0.75, yNorm: 0 },
  ],
  [FAMILY_IDS.ONE_REAR_MID]: [{ xNorm: 0.50, yNorm: 1 }],
  [FAMILY_IDS.ONE_SIDE_QUARTER]: [
    { xNorm: 0, yNorm: 0.25 },
    { xNorm: 0, yNorm: 0.75 },
    { xNorm: 1, yNorm: 0.25 },
    { xNorm: 1, yNorm: 0.75 },
  ],

  // Two subs
  [FAMILY_IDS.C_FRONT_PAIR]: [
    { xNorm: 0.25, yNorm: 0 },
    { xNorm: 0.75, yNorm: 0 },
  ],
  [FAMILY_IDS.FRONT_THIRD_PAIR]: [
    { xNorm: 0.333, yNorm: 0 },
    { xNorm: 0.667, yNorm: 0 },
  ],
  [FAMILY_IDS.FRONT_CORNER_PAIR]: [
    { xNorm: 0, yNorm: 0 },
    { xNorm: 1, yNorm: 0 },
  ],
  [FAMILY_IDS.REAR_QUARTER_PAIR]: [
    { xNorm: 0.25, yNorm: 1 },
    { xNorm: 0.75, yNorm: 1 },
  ],
  [FAMILY_IDS.REAR_THIRD_PAIR]: [
    { xNorm: 0.333, yNorm: 1 },
    { xNorm: 0.667, yNorm: 1 },
  ],
  [FAMILY_IDS.REAR_CORNER_PAIR]: [
    { xNorm: 0, yNorm: 1 },
    { xNorm: 1, yNorm: 1 },
  ],
  [FAMILY_IDS.RP22_F]: [
    { xNorm: 0.50, yNorm: 0 },
    { xNorm: 0.50, yNorm: 1 },
  ],
  [FAMILY_IDS.RP22_G]: [
    { xNorm: 0, yNorm: 0.50 },
    { xNorm: 1, yNorm: 0.50 },
  ],

  // Four subs
  [FAMILY_IDS.RP22_C]: [
    { xNorm: 0.25, yNorm: 0 },
    { xNorm: 0.75, yNorm: 0 },
    { xNorm: 0.25, yNorm: 1 },
    { xNorm: 0.75, yNorm: 1 },
  ],
  [FAMILY_IDS.RP22_E]: [
    { xNorm: 0, yNorm: 0 },
    { xNorm: 1, yNorm: 0 },
    { xNorm: 0, yNorm: 1 },
    { xNorm: 1, yNorm: 1 },
  ],
  [FAMILY_IDS.FOUR_THIRD_PAIRS]: [
    { xNorm: 0.333, yNorm: 0 },
    { xNorm: 0.667, yNorm: 0 },
    { xNorm: 0.333, yNorm: 1 },
    { xNorm: 0.667, yNorm: 1 },
  ],
  [FAMILY_IDS.RP22_D]: [
    { xNorm: 0, yNorm: 0.25 },
    { xNorm: 1, yNorm: 0.25 },
    { xNorm: 0, yNorm: 0.75 },
    { xNorm: 1, yNorm: 0.75 },
  ],
  // B last resort — gated, not generated during normal Stage 1
  [FAMILY_IDS.RP22_B_LAST_RESORT]: [
    { xNorm: 0.50, yNorm: 0 },
    { xNorm: 0.50, yNorm: 1 },
    { xNorm: 0, yNorm: 0.50 },
    { xNorm: 1, yNorm: 0.50 },
  ],
});

// ── Families enabled per quantity for normal Stage 1 search ─────────────
export const ENABLED_FAMILIES = Object.freeze({
  1: [
    FAMILY_IDS.ONE_FRONT_MID,
    FAMILY_IDS.ONE_FRONT_QUARTER,
    FAMILY_IDS.ONE_REAR_MID,
    FAMILY_IDS.ONE_SIDE_QUARTER,
  ],
  2: [
    FAMILY_IDS.C_FRONT_PAIR,
    FAMILY_IDS.FRONT_THIRD_PAIR,
    FAMILY_IDS.FRONT_CORNER_PAIR,
    FAMILY_IDS.REAR_QUARTER_PAIR,
    FAMILY_IDS.REAR_THIRD_PAIR,
    FAMILY_IDS.REAR_CORNER_PAIR,
    FAMILY_IDS.RP22_F,
    FAMILY_IDS.RP22_G,
  ],
  4: [
    FAMILY_IDS.RP22_E,
    FAMILY_IDS.RP22_C,
    FAMILY_IDS.FOUR_THIRD_PAIRS,
    FAMILY_IDS.RP22_D,
  ],
});

// B is gated/disabled for normal Stage 1.
export const B_FAMILY_ENABLED = false;

// A is always prohibited.
export const A_FAMILY_PROHIBITED = true;

export function getFamilyPreferenceRank(familyId) {
  return Number.isFinite(FAMILY_PREFERENCE_RANK[familyId]) ? FAMILY_PREFERENCE_RANK[familyId] : 999;
}

export function getFamilyDisplayMetadata(familyId) {
  return FAMILY_DISPLAY_METADATA[familyId] || null;
}

export function isProhibitedFamily(familyId) {
  return familyId === FAMILY_IDS.RP22_A;
}

export function isBFamily(familyId) {
  return familyId === FAMILY_IDS.RP22_B_LAST_RESORT;
}

export { STAGE1_FAMILY_POLICY_VERSION };