/**
 * deriveProducts.js
 * --------------------------------
 * Derive product highlights and upgrade opportunities.
 *
 * Product highlights       = which products deserve explanation in the proposal.
 * Upgrade opportunities    = where additional budget would create the greatest
 *                             engineering benefit.
 *
 * Pure function. No GPT. No side effects. No invention.
 */

import { withDecisionConfidence, letterToNumeric } from './confidence';

const LEVEL_NUMERIC = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0, 'N/A': null };

/**
 * Identify which products deserve explanation. Not every product requires
 * equal coverage — products enabling key capabilities or carrying notable
 * engineering stories should receive more attention.
 */
export function deriveProductHighlights({ engineeringAuthority, productIntelligence }) {
  const highlights = [];
  if (!Array.isArray(productIntelligence)) return highlights;

  const system = engineeringAuthority?.system || {};
  const productRoles = system.product_roles || [];

  for (const pi of productIntelligence) {
    if (!pi || pi.status !== 'complete') continue;

    const role = productRoles.find((r) => r.model_key === pi.identity?.model || r.model_label === pi.identity?.name);
    const deservesCoverage = determineCoverage(pi, role);
    if (!deservesCoverage) continue;

    highlights.push({
      product_id: pi.product_id,
      product_name: pi.identity?.name || pi.identity?.model || 'Unknown',
      role: role?.role_description || pi.identity?.role || null,
      highlight: deriveHighlight(pi, role),
      why_deserves_coverage: deriveWhy(pi, role),
      ...withDecisionConfidence(letterToNumeric(pi.confidence?.overall || 'D')),
    });
  }

  return highlights;
}

function determineCoverage(pi, role) {
  // Deserves coverage if it has a product story, engineering purpose, or strengths
  return !!(
    pi.product_story ||
    pi.engineering_purpose ||
    (pi.strengths && pi.strengths.length > 0)
  );
}

function deriveHighlight(pi, role) {
  if (pi.product_story) return pi.product_story;
  if (pi.engineering_purpose) return pi.engineering_purpose;
  if (pi.strengths && pi.strengths.length > 0) {
    return `Key strength: ${pi.strengths[0].replace(/_/g, ' ')}`;
  }
  return 'Selected for its role in the system architecture.';
}

function deriveWhy(pi, role) {
  const reasons = [];
  if (role) reasons.push(`Serves as ${role.role_description}`);
  if (pi.strengths && pi.strengths.length > 0) {
    reasons.push(`Engineering strengths: ${pi.strengths.map((s) => s.replace(/_/g, ' ')).join(', ')}`);
  }
  if (pi.upgrade_path?.next) {
    reasons.push(`Part of an upgrade chain (previous: ${pi.upgrade_path.previous || '—'}, next: ${pi.upgrade_path.next || '—'})`);
  }
  return reasons.join('. ') || 'Product contributes to the overall system performance.';
}

/**
 * Derive upgrade opportunities — where additional budget would create the
 * greatest engineering benefit. Based on product upgrade paths and RP22
 * parameters that are close to the next level.
 */
export function deriveUpgradeOpportunities({ engineeringAuthority, productIntelligence }) {
  const opportunities = [];
  const rp22 = engineeringAuthority?.rp22 || {};
  const bass = engineeringAuthority?.bass || {};

  // Product upgrade paths
  if (Array.isArray(productIntelligence)) {
    for (const pi of productIntelligence) {
      if (!pi || pi.status !== 'complete') continue;
      const upgrade = pi.upgrade_path;
      if (upgrade?.next) {
        opportunities.push({
          opportunity: `Upgrade ${pi.identity?.name || 'product'} to ${upgrade.next}`,
          engineering_benefit: deriveUpgradeBenefit(pi, upgrade.next),
          ...withDecisionConfidence(letterToNumeric(pi.confidence?.upgrade_path || 'D')),
        });
      }
    }
  }

  // RP22 near-miss parameters (L2 close to L3)
  for (const param of rp22.all_parameters || []) {
    if (param.achieved_level === 'L2') {
      opportunities.push({
        opportunity: `Improve ${param.title} from L2 to L3`,
        engineering_benefit: `${param.title} is one level below reference; targeted treatment or calibration could close this gap. ${param.engineering_meaning?.statement || param.engineering_meaning || ''}`.trim(),
        ...withDecisionConfidence(param.confidence || 0.85),
      });
    }
  }

  // Bass upgrade (if P19/P20 at L2, more subs could help)
  if (bass.available) {
    const p20 = bass.p20 || {};
    if (p20.achieved_level === 'L2') {
      const subCount = engineeringAuthority?.system?.subwoofer_strategy?.count || 0;
      if (subCount < 4) {
        opportunities.push({
          opportunity: `Add subwoofers to improve seat-to-seat bass consistency`,
          engineering_benefit: `Current P20 at L2 with ${subCount} subwoofer${subCount !== 1 ? 's' : ''}; a four-subwoofer arrangement would smooth room modes across all seats.`,
          ...withDecisionConfidence(p20.confidence || 0.80),
        });
      }
    }
  }

  // Acoustic treatment upgrade
  const treatment = engineeringAuthority?.room?.acoustic_treatment || {};
  if (!treatment.enabled) {
    opportunities.push({
      opportunity: `Add acoustic treatment`,
      engineering_benefit: `Dedicated acoustic treatment (Artcoustic Abfuser panels) would control early reflections and reverberation, improving dialogue clarity and imaging.`,
      ...withDecisionConfidence(0.95),
    });
  }

  return opportunities.slice(0, 5);
}

function deriveUpgradeBenefit(pi, nextModel) {
  if (pi.upgrade_path?.previous) {
    return `Moving from ${pi.identity?.model || 'current'} to ${nextModel} would provide greater output capability and lower distortion at reference levels.`;
  }
  return `Upgrading to ${nextModel} would extend the system's dynamic capability and low-frequency headroom.`;
}