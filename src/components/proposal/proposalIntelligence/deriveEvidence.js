/**
 * deriveEvidence.js
 * --------------------------------
 * Derive project strengths and honest limitations from engineering evidence.
 *
 * Strengths    = what the proposal should celebrate (engineering evidence only).
 * Limitations  = compromises to acknowledge professionally (never hidden, never exaggerated).
 *
 * Pure function. No GPT. No side effects. No invention.
 */

import { withDecisionConfidence } from './confidence';

const LEVEL_NUMERIC = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0, 'N/A': null };

/**
 * Derive project strengths from RP22 achievements, system capabilities,
 * room characteristics, and acoustic treatment.
 */
export function deriveProjectStrengths({ engineeringAuthority, productIntelligence }) {
  const strengths = [];
  const rp22 = engineeringAuthority?.rp22 || {};
  const system = engineeringAuthority?.system || {};
  const room = engineeringAuthority?.room || {};
  const bass = engineeringAuthority?.bass || {};

  // RP22 strengths (L3/L4 parameters)
  for (const s of rp22.strengths || []) {
    strengths.push({
      strength: `${s.title} achieved at ${s.achieved_level}`,
      evidence: s.engineering_meaning?.statement || s.engineering_meaning || `${s.title}: ${s.achieved_level}`,
      ...withDecisionConfidence(s.confidence || 0.85),
    });
  }

  // System architecture strengths
  const config = system.configuration || {};
  if ((config.overhead_channels || 0) > 0) {
    strengths.push({
      strength: `Complete Dolby Atmos architecture with ${config.overhead_channels} overhead channel${config.overhead_channels !== 1 ? 's' : ''}`,
      evidence: `${config.dolby_config} configuration with discrete overhead channels`,
      ...withDecisionConfidence(config.confidence || 0.99),
    });
  }

  // Bass strengths
  if (bass.available) {
    const p20 = bass.p20 || {};
    if (p20.achieved_level && LEVEL_NUMERIC[p20.achieved_level] >= 3) {
      strengths.push({
        strength: `Seat-to-seat bass consistency at ${p20.achieved_level}`,
        evidence: p20.engineering_meaning?.statement || p20.engineering_meaning || `P20: ${p20.achieved_level}`,
        ...withDecisionConfidence(p20.confidence || 0.80),
      });
    }
  }

  // Acoustic treatment
  const treatment = room.acoustic_treatment || {};
  if (treatment.enabled && treatment.quantity > 0) {
    strengths.push({
      strength: `Dedicated acoustic treatment (${treatment.quantity} Abfuser panels)`,
      evidence: treatment.interpretation || `${treatment.quantity} Artcoustic Abfuser panels specified`,
      ...withDecisionConfidence(treatment.confidence || 0.99),
    });
  }

  // Room proportions
  const classification = room.classification;
  if (classification?.statement && classification.statement.includes('golden ratio')) {
    strengths.push({
      strength: `Favourable golden-ratio room proportions`,
      evidence: classification.statement,
      ...withDecisionConfidence(classification.confidence || 0.95),
    });
  }

  // Product strengths from Product Intelligence
  if (Array.isArray(productIntelligence)) {
    for (const pi of productIntelligence) {
      if (!pi || pi.status !== 'complete') continue;
      for (const productStrength of (pi.strengths || []).slice(0, 1)) {
        strengths.push({
          strength: `${pi.identity?.name || 'Product'}: ${productStrength.replace(/_/g, ' ')}`,
          evidence: pi.product_story || pi.engineering_purpose || 'Product selected for its engineering strengths.',
          ...withDecisionConfidence(0.85),
        });
      }
    }
  }

  return strengths.slice(0, 8);
}

/**
 * Derive honest limitations from RP22 weaknesses, product design compromises,
 * and room constraints. Each limitation includes a professional framing —
 * how to acknowledge it without hiding or exaggerating.
 */
export function deriveHonestLimitations({ engineeringAuthority, productIntelligence }) {
  const limitations = [];
  const rp22 = engineeringAuthority?.rp22 || {};
  const room = engineeringAuthority?.room || {};
  const bass = engineeringAuthority?.bass || {};

  // RP22 weaknesses (L1/L2/FAIL parameters)
  for (const w of rp22.weaknesses || []) {
    limitations.push({
      limitation: `${w.title} at ${w.achieved_level}`,
      professional_framing: frameRp22Weakness(w),
      ...withDecisionConfidence(w.confidence || 0.85),
    });
  }

  // Bass limitations
  if (bass.available) {
    const p19 = bass.p19 || {};
    if (p19.achieved_level && LEVEL_NUMERIC[p19.achieved_level] <= 2) {
      limitations.push({
        limitation: `Bass smoothness at ${p19.achieved_level} (P19)`,
        professional_framing: 'Acknowledge that bass smoothness at the reference position is moderate; multi-subwoofer calibration has improved consistency but residual room modes remain below the transition frequency.',
        ...withDecisionConfidence(p19.confidence || 0.80),
      });
    }
  }

  // Room constraints
  const classification = room.classification;
  if (classification?.statement) {
    if (classification.statement.includes('long tunnel')) {
      limitations.push({
        limitation: `Long tunnel room proportions`,
        professional_framing: 'The room length-to-width ratio causes axial mode clustering; subwoofer placement and bass management address this but cannot fully eliminate it.',
        ...withDecisionConfidence(classification.confidence || 0.95),
      });
    }
    if (classification.statement.includes('near-cubic')) {
      limitations.push({
        limitation: `Near-cubic room proportions`,
        professional_framing: 'Approximately equal dimensions cause modal overlap; acoustic treatment and subwoofer optimisation are critical and have been specified.',
        ...withDecisionConfidence(classification.confidence || 0.95),
      });
    }
  }

  // Product design compromises from Product Intelligence
  if (Array.isArray(productIntelligence)) {
    for (const pi of productIntelligence) {
      if (!pi || pi.status !== 'complete') continue;
      for (const compromise of (pi.design_compromises || []).slice(0, 1)) {
        limitations.push({
          limitation: `${pi.identity?.name || 'Product'}: ${compromise.replace(/_/g, ' ')}`,
          professional_framing: frameProductCompromise(compromise, pi),
          ...withDecisionConfidence(0.85),
        });
      }
    }
  }

  // No acoustic treatment
  const treatment = room.acoustic_treatment || {};
  if (!treatment.enabled) {
    limitations.push({
      limitation: `No acoustic treatment specified`,
      professional_framing: 'The room does not include dedicated acoustic treatment; early reflections and reverberation will rely on room furnishings. Treatment can be added as a future upgrade.',
      ...withDecisionConfidence(treatment.confidence || 0.99),
    });
  }

  return limitations.slice(0, 6);
}

function frameRp22Weakness(w) {
  const level = w.achieved_level;
  if (level === 'FAIL') {
    return `${w.title} does not meet the minimum RP22 threshold; this is a known limitation of the current system configuration.`;
  }
  if (level === 'L1') {
    return `${w.title} achieves the entry-level RP22 threshold; the system meets minimum standards but has headroom for improvement in this area.`;
  }
  return `${w.title} achieves ${level}; the system performs adequately here but does not reach reference levels.`;
}

function frameProductCompromise(compromise, pi) {
  const compromiseText = compromise.replace(/_/g, ' ');
  if (compromise.includes('subwoofer')) {
    return `${pi.identity?.name} is not designed for full-range bass; a dedicated subwoofer is specified to handle frequencies below the transition point.`;
  }
  if (compromise.includes('surround_not_lcr')) {
    return `${pi.identity?.name} is optimised for surround rather than LCR use; it is deployed in its intended role.`;
  }
  return `${pi.identity?.name}: ${compromiseText}. This is an inherent design trade-off acknowledged in the product specification.`;
}