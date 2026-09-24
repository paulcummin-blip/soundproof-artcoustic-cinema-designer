// materialImprovement.js
// ---------------------------------------------------------------------------
// ADI — Material Improvement Assessment
//
// A recommendation becomes a Trade-off only when:
//   - at least one engineering outcome improves materially
//   - AND
//   - at least one engineering outcome worsens materially
//
// Parameter badge changes alone are insufficient.
// Materiality thresholds remain empirical and configurable.
// Do not hard-code 0.5 dB.
//
// This module wraps the existing tradeOffClassifier and materialityGate
// modules in the ADI framework, adding configurable thresholds and
// the ADI-specific trade-off definition.
//
// This module is PURE: no React, no side effects.
// ---------------------------------------------------------------------------

import {
  classifyVerifiedTradeOff,
  findBestP19Improvement,
  findBestP20Improvement,
  findP19Worsening,
  findP20Worsening,
} from '@/components/room/bass/improveBassV2/tradeOffClassifier';
import { isMaterialImprovement } from '@/components/room/bass/improveBassV2/materialityGate';
import { DEFAULT_MATERIALITY_THRESHOLDS } from './adiConstants';

/**
 * Assess whether a candidate represents a material improvement, a trade-off,
 * or neither.
 *
 * A Trade-off requires:
 *   - At least one engineering outcome improves materially
 *   - AND at least one engineering outcome worsens materially
 *
 * A pure improvement has material improvement without material worsening.
 *
 * Parameter badge changes alone (without raw deviation changes) are
 * insufficient for a trade-off classification.
 *
 * @param {object} currentResult - baseline canonical result
 * @param {object} candidateResult - candidate canonical result
 * @param {object} [thresholds] - optional threshold overrides
 * @returns {{ isMaterial: boolean, isTradeOff: boolean, improvement: object|null, worsening: object|null, reason: string }}
 */
export function assessMaterialImprovement(currentResult, candidateResult, thresholds = {}) {
  if (!currentResult || !candidateResult) {
    return { isMaterial: false, isTradeOff: false, improvement: null, worsening: null, reason: 'Missing result data' };
  }

  // 1. Check materiality using the existing materialityGate
  const materiality = isMaterialImprovement(currentResult, candidateResult);
  if (!materiality.material) {
    return {
      isMaterial: false,
      isTradeOff: false,
      improvement: null,
      worsening: null,
      reason: materiality.reason,
    };
  }

  // 2. Check for trade-off using the existing tradeOffClassifier
  const tradeOff = classifyVerifiedTradeOff(currentResult, candidateResult);

  if (tradeOff.isTradeOff) {
    return {
      isMaterial: true,
      isTradeOff: true,
      improvement: tradeOff.improvement,
      worsening: tradeOff.worsening,
      reason: tradeOff.neutralText || 'Material improvement with material worsening — trade-off',
    };
  }

  // 3. Material improvement without material worsening = pure improvement
  return {
    isMaterial: true,
    isTradeOff: false,
    improvement: null,
    worsening: null,
    reason: materiality.reason || 'Material improvement without material worsening',
  };
}

/**
 * Check whether a candidate's improvement is genuine (not just a parameter
 * badge change). Parameter badge changes alone are insufficient.
 *
 * @param {object} currentResult
 * @param {object} candidateResult
 * @param {object} [thresholds]
 * @returns {boolean}
 */
export function isGenuineImprovement(currentResult, candidateResult, thresholds = {}) {
  const t = { ...DEFAULT_MATERIALITY_THRESHOLDS, ...thresholds };
  const assessment = assessMaterialImprovement(currentResult, candidateResult, t);
  return assessment.isMaterial;
}