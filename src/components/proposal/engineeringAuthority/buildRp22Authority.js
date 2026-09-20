/**
 * Passive RP22 proposal adapter.
 *
 * The canonical engineering summary already owns every level, category,
 * score, floor and ranking. This module only translates field names for the
 * proposal schema; it never grades, groups, filters, sorts or interprets.
 */

import { PARAM_INTERPRETERS } from "./rp22ParameterInterpretations";

function parameterNumber(key) {
  const match = String(key || "").match(/^p(\d+)$/);
  return match ? Number(match[1]) : null;
}

function adaptContribution(contribution) {
  const id = Number(contribution?.parameter) || parameterNumber(contribution?.key);
  const meta = PARAM_INTERPRETERS[id] || {};
  return {
    parameter_id: id,
    parameter_key: contribution?.key || (id ? `p${id}` : null),
    title: meta.title || contribution?.label || contribution?.title || (id ? `P${id}` : "Parameter"),
    achieved_level: contribution?.level || null,
    engineering_meaning: null,
    confidence: null,
  };
}

export function buildRp22Authority(engineeringSummary, _designRating, _seats, _assumedLevels = {}, assessmentModes = {}) {
  if (!engineeringSummary) {
    return {
      overall_design_rating: null,
      assessment_basis: null,
      assumed_parameters: null,
      strengths: [],
      weaknesses: [],
      all_parameters: [],
      confidence: null,
    };
  }

  const allParameters = Object.entries(engineeringSummary.parameterSummaries?.project || {}).map(([key, summary]) => {
    const id = parameterNumber(key);
    const meta = PARAM_INTERPRETERS[id] || {};
    const result = engineeringSummary.roomResultsByParameter?.[id] || null;
    return {
      parameter_id: id,
      parameter_key: key,
      title: meta.title || (id ? `P${id}` : key),
      category: meta.category || null,
      achieved_level: summary?.level || "N/A",
      raw_value: result?.value ?? null,
      formatted_value: result?.formatted ?? null,
      engineering_meaning: null,
      confidence: null,
    };
  });

  const scorecard = engineeringSummary.project?.scorecard || {};
  return {
    overall_design_rating: engineeringSummary.project?.rating || null,
    assessment_basis: {
      p12_mode: assessmentModes.p12Mode || "minimum",
      p13_mode: assessmentModes.p13Mode || "minimum",
    },
    assumed_parameters: {
      p15_noise_floor: engineeringSummary.roomResultsByParameter?.[15] || null,
      p21_early_reflections: engineeringSummary.roomResultsByParameter?.[21] || null,
    },
    strengths: (scorecard.highestPerformanceResults || []).map(adaptContribution),
    weaknesses: (scorecard.lowestPerformanceResults || []).map(adaptContribution),
    all_parameters: allParameters,
    confidence: null,
  };
}
