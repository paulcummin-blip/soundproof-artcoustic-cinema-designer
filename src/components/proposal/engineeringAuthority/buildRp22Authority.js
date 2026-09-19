/**
 * buildRp22Authority.js  (Stage 2A — category floors removed)
 * --------------------------------
 * Layer 1 — RP22 interpreted engineering sub-authority.
 *
 * CHANGED in Stage 2A: Local category-floor reconstruction (buildCategorySummary
 * with Math.min/Math.max over parameter levels) has been REMOVED. Category
 * floors are now read from the published scoped Design Rating authority via
 * snapshotCategoryFloors.js in the frozen snapshot builder.
 *
 * This module still owns:
 *   - Per-parameter engineering headlines (P1–P17)
 *   - Overall design rating entry
 *   - Strengths / weaknesses
 *   - Assumed parameters (P15, P21)
 *   - Assessment basis (P12/P13 modes)
 *
 * Pure function. No GPT. No side effects.
 */

import { CONFIDENCE, withConfidence, notCalculated, SOURCE } from './confidence';
import { PARAM_INTERPRETERS, interpretP15, interpretP21, LEVEL_MEANINGS } from './rp22ParameterInterpretations';

function getMetric(analysisResult, paramId) {
  return analysisResult?.gradedParameters?.primary?.[paramId] || null;
}

function buildParameterEntry(paramId, analysisResult) {
  const interpreter = PARAM_INTERPRETERS[paramId];
  if (!interpreter) return null;

  const metric = getMetric(analysisResult, paramId);
  const interpretation = interpreter.interpret(metric);

  return {
    parameter_id: paramId,
    parameter_key: interpreter.key,
    title: interpreter.title,
    category: interpreter.category,
    achieved_level: metric?.level || 'N/A',
    raw_value: Number.isFinite(Number(metric?.value)) ? Number(metric.value) : null,
    formatted_value: metric?.formatted || null,
    engineering_meaning: interpretation.statement,
    confidence: interpretation.confidence,
  };
}

function buildDesignRatingEntry(designRating) {
  if (!designRating) return notCalculated('Design rating not calculated.');

  const percentage = Number.isFinite(Number(designRating.displayPercentage))
    ? Number(designRating.displayPercentage)
    : null;
  const index = Number.isFinite(Number(designRating.designPerformanceIndex))
    ? Number(designRating.designPerformanceIndex)
    : null;
  const label = designRating.label || designRating.designation || '—';
  const level = designRating.level || null;

  let statement = `Artcoustic System Design Rating: ${label}`;
  if (percentage != null) statement += ` (${percentage.toFixed(0)}%)`;
  if (level) {
    statement += `. This design ${LEVEL_MEANINGS[level] || 'meets performance standards'}.`;
  }

  return withConfidence(statement, CONFIDENCE.COMPUTED_GEOMETRIC, SOURCE.RP22_CALCULATION);
}

function buildStrengthsWeaknesses(entries) {
  const LEVEL_NUMERIC = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0, 'N/A': null };
  const scored = entries.filter((e) => e && e.achieved_level && e.achieved_level !== 'N/A' && e.confidence > 0);

  const strengths = scored
    .filter((e) => LEVEL_NUMERIC[e.achieved_level] >= 3)
    .sort((a, b) => LEVEL_NUMERIC[b.achieved_level] - LEVEL_NUMERIC[a.achieved_level])
    .slice(0, 5)
    .map((e) => ({
      parameter_id: e.parameter_id,
      title: e.title,
      achieved_level: e.achieved_level,
      engineering_meaning: e.engineering_meaning,
      confidence: e.confidence,
    }));

  const weaknesses = scored
    .filter((e) => LEVEL_NUMERIC[e.achieved_level] <= 2)
    .sort((a, b) => LEVEL_NUMERIC[a.achieved_level] - LEVEL_NUMERIC[b.achieved_level])
    .slice(0, 3)
    .map((e) => ({
      parameter_id: e.parameter_id,
      title: e.title,
      achieved_level: e.achieved_level,
      engineering_meaning: e.engineering_meaning,
      confidence: e.confidence,
    }));

  return { strengths, weaknesses };
}

export function buildRp22Authority(analysisResult, designRating, _seats, assumedLevels = {}, assessmentModes = {}) {
  const p12Mode = assessmentModes.p12Mode || 'minimum';
  const p13Mode = assessmentModes.p13Mode || 'minimum';

  if (!analysisResult?.gradedParameters?.primary) {
    return {
      overall_design_rating: notCalculated('Design rating not calculated — analysis results unavailable.'),
      assessment_basis: {
        p12_mode: p12Mode,
        p13_mode: p13Mode,
        description: `P12/P13 assessed against ${p12Mode === 'recommended' ? 'Recommended' : 'Minimum'} thresholds.`,
      },
      assumed_parameters: {
        p15_noise_floor: interpretP15(assumedLevels.p15),
        p21_early_reflections: interpretP21(assumedLevels.p21),
      },
      strengths: [],
      weaknesses: [],
      all_parameters: [],
      confidence: CONFIDENCE.NOT_CALCULATED,
    };
  }

  const allEntries = [];
  for (const paramId of Object.keys(PARAM_INTERPRETERS)) {
    const entry = buildParameterEntry(Number(paramId), analysisResult);
    if (entry) allEntries.push(entry);
  }

  const { strengths, weaknesses } = buildStrengthsWeaknesses(allEntries);
  const overallRating = buildDesignRatingEntry(designRating);

  const bassInterpretation = weaknesses.some((w) => ['p18', 'p19', 'p20'].includes(w.parameter_key))
    ? withConfidence('Bass performance has areas requiring attention — see Bass Authority for detailed P14/P18/P19/P20 facts.', CONFIDENCE.MODEL_DEPENDENT, SOURCE.BASS_SIMULATION)
    : withConfidence('Bass performance analysis is available in the Bass Authority.', CONFIDENCE.MODEL_DEPENDENT, SOURCE.BASS_SIMULATION);

  return {
    overall_design_rating: overallRating,
    bass_interpretation: bassInterpretation,
    assessment_basis: {
      p12_mode: p12Mode,
      p13_mode: p13Mode,
      description: `P12/P13 assessed against ${p12Mode === 'recommended' ? 'Recommended' : 'Minimum'} thresholds.`,
    },
    assumed_parameters: {
      p15_noise_floor: interpretP15(assumedLevels.p15),
      p21_early_reflections: interpretP21(assumedLevels.p21),
    },
    strengths,
    weaknesses,
    all_parameters: allEntries,
    confidence: Math.min(...allEntries.map((e) => e.confidence).filter((c) => c > 0)) || CONFIDENCE.NOT_CALCULATED,
  };
}