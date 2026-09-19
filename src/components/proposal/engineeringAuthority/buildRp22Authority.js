/**
 * buildRp22Authority.js
 * --------------------------------
 * Layer 1 — RP22 interpreted engineering sub-authority.
 * Does NOT expose raw parameter tables.
 * Provides interpreted engineering facts with confidence.
 * Pure function. No GPT. No side effects.
 */

import { CONFIDENCE, withConfidence, notCalculated } from './confidence';
import { PARAM_INTERPRETERS, interpretP15, interpretP21, LEVEL_MEANINGS } from './rp22ParameterInterpretations';

const LEVEL_NUMERIC = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0, 'N/A': null };

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

function buildCategorySummary(categoryName, entries) {
  if (!entries || entries.length === 0) {
    return {
      category: categoryName,
      parameters: [],
      summary: 'Not calculated.',
      confidence: CONFIDENCE.NOT_CALCULATED,
    };
  }

  const scored = entries.filter((e) => e.achieved_level && e.achieved_level !== 'N/A');
  if (scored.length === 0) {
    return {
      category: categoryName,
      parameters: entries.map((e) => e.parameter_id),
      summary: 'Not calculated.',
      confidence: CONFIDENCE.NOT_CALCULATED,
    };
  }

  const levels = scored.map((e) => LEVEL_NUMERIC[e.achieved_level] ?? 0);
  const minLevel = Math.min(...levels);
  const maxLevel = Math.max(...levels);
  const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;

  const minLevelLabel = minLevel === 0 ? 'FAIL' : `L${minLevel}`;
  const maxLevelLabel = maxLevel === 0 ? 'FAIL' : `L${maxLevel}`;

  const summary = `${categoryName.replace(/_/g, ' ')}: ${minLevel === maxLevel ? maxLevelLabel : `${minLevelLabel}–${maxLevelLabel}`} across ${scored.length} parameter${scored.length !== 1 ? 's' : ''}.`;

  return {
    category: categoryName,
    parameters: entries.map((e) => e.parameter_id),
    min_level: minLevelLabel,
    max_level: maxLevelLabel,
    average_level: avgLevel,
    summary,
    confidence: Math.min(...scored.map((e) => e.confidence)),
  };
}

function buildDesignRatingEntry(designRating) {
  if (!designRating) return notCalculated('Design rating not calculated.');

  const percentage = Number(designRating.percentage) || 0;
  const label = designRating.label || '—';
  const level = designRating.level || null;

  let statement = `Artcoustic System Design Rating: ${label} (${percentage.toFixed(0)}%).`;
  if (level) {
    statement += ` This design ${LEVEL_MEANINGS[level] || 'meets performance standards'}.`;
  }

  return withConfidence(statement, CONFIDENCE.COMPUTED_GEOMETRIC);
}

function buildStrengthsWeaknesses(entries) {
  const scored = entries.filter((e) => e && e.achieved_level && e.achieved_level !== 'N/A' && e.confidence > 0);

  // Strengths: L3 and L4 parameters
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

  // Weaknesses: L1, L2, and FAIL parameters
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

export function buildRp22Authority(analysisResult, designRating, _seats, assumedLevels = {}) {
  // If no analysis result, return empty authority
  if (!analysisResult?.gradedParameters?.primary) {
    return {
      overall_design_rating: notCalculated('Design rating not calculated — analysis results unavailable.'),
      dynamic_range: buildCategorySummary('dynamic_range', []),
      spatial_resolution: buildCategorySummary('spatial_resolution', []),
      timbre: buildCategorySummary('timbre', []),
      bass_interpretation: notCalculated('Bass interpretation not available — see Bass Authority.'),
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

  // Build all parameter entries
  const allEntries = [];
  for (const paramId of Object.keys(PARAM_INTERPRETERS)) {
    const entry = buildParameterEntry(Number(paramId), analysisResult);
    if (entry) allEntries.push(entry);
  }

  // Group by category
  const dynamicRangeEntries = allEntries.filter((e) => e.category === 'dynamic_range');
  const spatialResolutionEntries = allEntries.filter((e) => e.category === 'spatial_resolution');
  const timbreEntries = allEntries.filter((e) => e.category === 'timbre');

  // Build category summaries
  const dynamicRange = buildCategorySummary('dynamic_range', dynamicRangeEntries);
  const spatialResolution = buildCategorySummary('spatial_resolution', spatialResolutionEntries);
  const timbre = buildCategorySummary('timbre', timbreEntries);

  // Strengths and weaknesses
  const { strengths, weaknesses } = buildStrengthsWeaknesses(allEntries);

  // Overall design rating
  const overallRating = buildDesignRatingEntry(designRating);

  // Bass interpretation summary (detailed facts are in Bass Authority)
  const bassInterpretation = weaknesses.some((w) => ['p18', 'p19', 'p20'].includes(w.parameter_key))
    ? withConfidence('Bass performance has areas requiring attention — see Bass Authority for detailed P14/P18/P19/P20 facts.', CONFIDENCE.MODEL_DEPENDENT)
    : withConfidence('Bass performance analysis is available in the Bass Authority.', CONFIDENCE.MODEL_DEPENDENT);

  return {
    overall_design_rating: overallRating,
    dynamic_range: dynamicRange,
    spatial_resolution: spatialResolution,
    timbre: timbre,
    bass_interpretation: bassInterpretation,
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