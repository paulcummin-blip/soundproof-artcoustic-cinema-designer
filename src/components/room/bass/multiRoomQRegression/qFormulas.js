/**
 * qFormulas.js — Pure Q formulation functions for regression testing.
 * No imports, no side-effects. All functions are stateless.
 */

export const BASE_Q_BY_TYPE = { axial: 4.0, tangential: 3.9, oblique: 2.5 };
export const BASE_Q_AXIAL = 4.0;
export const ALPHA_TEST = 0.30;

export const SA_TEST = {
  front: ALPHA_TEST, back: ALPHA_TEST, left: ALPHA_TEST,
  right: ALPHA_TEST, floor: ALPHA_TEST, ceiling: ALPHA_TEST,
};

/** A — Current production */
export function qA(baseQ, absorptionQ) {
  return Math.max(1, Math.min(baseQ, absorptionQ));
}

/** B — Sabine direct */
export function qB(baseQ, absorptionQ) {
  return Math.max(1, absorptionQ);
}

/** C — Logistic saturation  (2.5×baseQ asymptote) */
export function qC(baseQ, absorptionQ) {
  const L  = baseQ * 2.5;
  const x0 = baseQ;
  const k  = 0.18;
  return Math.max(1, L / (1 + Math.exp(-k * (absorptionQ - x0))));
}

/** D — Soft harmonic limiter */
export function qD(baseQ, absorptionQ) {
  if (absorptionQ <= 0 || baseQ <= 0) return 1;
  return Math.max(1, (baseQ * absorptionQ) / (baseQ + absorptionQ));
}

export const VARIANTS = [
  { id: 'A', label: 'A — Current production',   formula: 'Math.min(baseQ, absorptionQ)',                       colour: '#dc2626', fn: qA },
  { id: 'B', label: 'B — Sabine direct',         formula: 'absorptionQ',                                       colour: '#2563eb', fn: qB },
  { id: 'C', label: 'C — Logistic saturation',   formula: '(2.5×baseQ)/(1+exp(-0.18×(absorptionQ-baseQ)))',    colour: '#0891b2', fn: qC },
  { id: 'D', label: 'D — Soft harmonic limiter', formula: '(baseQ×absorptionQ)/(baseQ+absorptionQ)',           colour: '#7c3aed', fn: qD },
];