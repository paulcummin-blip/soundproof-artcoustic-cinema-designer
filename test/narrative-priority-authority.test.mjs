/**
 * test/narrative-priority-authority.test.mjs
 * ------------------------------------------
 * THE PROPOSAL'S EMPHASIS IS DECIDED BY IMPORTANCE, RESULT AND BRIEF — IN THAT
 * ORDER — and never by achieved level alone.
 *
 * This suite walks the authority the way the app uses it:
 *
 *   1. ONE ASDR authority, traced and reused, with no second weight table;
 *   2. a lightly weighted L4 is never promoted, whatever level it reached;
 *   3. a heavily weighted, on-brief L1 or L2 may be told positively;
 *   4. a heavily weighted L4 may carry flagship language;
 *   5. the same result changes class when the brief changes;
 *   6. do not discuss overrides everything, and changes no evidence;
 *   7. the achieved level chooses the STRENGTH OF THE WORDS only after a topic has
 *      earned narrative relevance;
 *   8. the highlights and the narrative steer read the same classification;
 *   9. the Expert View exposes it to the designer and never to a client document;
 *  10. no RP22 or RP23 calculation, threshold or result is touched.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import {
  LEVEL_MULTIPLIERS,
  PARAM_WEIGHTS,
  TOTAL_WEIGHT,
} from '../base44/shared/canonicalParameterWeights.js';
import {
  NARRATIVE_PRIORITY,
  PRIORITY_LABEL,
  buildNarrativePriorityRows,
  isNarrativeCandidate,
  mayUseFlagshipLanguage,
  narrativeCandidateRows,
  parameterNarrativePriority,
  phraseAfterRelevance,
  topicNarrativePriority,
  weightTier,
} from '../base44/shared/narrativePriorityAuthority.js';
import {
  BRIEF_INTENT,
  BRIEF_RELEVANCE,
  readBriefRelevance,
} from '../base44/shared/briefRelevance.js';
import {
  admitStrengthStories,
  attachStoryNarrativePriority,
} from '../base44/shared/strengthStories.js';
import { summaryFromReportEvidence } from '../base44/shared/strengthImportance.js';
import { flattenedResultTerms } from '../base44/shared/performanceLanguageAuthority.js';
import { presentSteerTopics, topicIsSuggested } from '../src/components/proposal/wizard/narrativeSteer.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ASDR_MODULE = 'src/components/report/technical/artcousticSystemDesignRating.js';

/** Marquee-style media lounge: television, one row, 5.1, bass present. */
const MEDIA_LOUNGE = readBriefRelevance({
  intent: BRIEF_INTENT.MEDIA_LOUNGE,
  design: { display: true, speakers: true, seats: 3, bass: true, spatial: true, timbre: true, screenChannels: true },
});

/** The same room, declared as a reference-grade dedicated cinema. */
const REFERENCE_CINEMA = readBriefRelevance({
  intent: BRIEF_INTENT.DEDICATED_CINEMA,
  design: { display: true, speakers: true, seats: 12, bass: true, spatial: true, timbre: true, screenChannels: true },
});

/** One frozen-evidence report state, read the way the reports read it. */
const summaryOf = (rows) => summaryFromReportEvidence({
  parameters: rows.map(([parameter_id, level, scope = 'room']) => ({ parameter_id, level, state: 'scored', scope })),
});

test('ONE ASDR authority: the table is defined once and re-exported, never copied', () => {
  // The documented canonical values, from the table the whole app ranks by.
  assert.equal(PARAM_WEIGHTS.p18, 12);
  assert.equal(PARAM_WEIGHTS.p14, 9);
  assert.equal(PARAM_WEIGHTS.p12, 8);
  assert.equal(PARAM_WEIGHTS.p16, 5);
  assert.equal(PARAM_WEIGHTS.p7, 4);
  assert.equal(PARAM_WEIGHTS.p8, 2);
  assert.equal(TOTAL_WEIGHT, Object.values(PARAM_WEIGHTS).reduce((a, b) => a + b, 0));
  assert.deepEqual({ ...LEVEL_MULTIPLIERS }, { L4: 12, L3: 8, L2: 4, L1: 2, FAIL: -5 });

  // The Room Designer's rating module reads that same table instead of holding a
  // second copy of it: it imports and re-exports, and defines no weight literals.
  const asdr = source(ASDR_MODULE);
  assert.match(asdr, /shared\/canonicalParameterWeights\.js/);
  assert.match(asdr, /export \{ PARAM_WEIGHTS, LEVEL_MULTIPLIERS, TOTAL_WEIGHT \}/);
  assert.doesNotMatch(asdr, /p18:\s*12/);
  assert.doesNotMatch(asdr, /L4:\s*12,\s*L3:\s*8/);

  // NO new weighting system: the narrative authority defines no weights of its own
  // and reaches no grading or threshold authority.
  const narrative = source('base44/shared/narrativePriorityAuthority.js');
  assert.doesNotMatch(narrative, /PARAM_WEIGHTS\s*=\s*\{/);
  assert.doesNotMatch(narrative, /rp22Catalog|applyCatalogThresholds|resolveParamThresholds|gradeP\d/);
  assert.match(narrative, /parameterWeight\(key, summary\?\.parameterAuthority\)/);
});

test('a lightly weighted L4 is never promoted by its level', () => {
  const lowWeightL4 = parameterNarrativePriority({ key: 'p7', weight: PARAM_WEIGHTS.p7, level: 'L4' });
  assert.equal(lowWeightL4.tier, 'low');
  assert.equal(lowWeightL4.priority, NARRATIVE_PRIORITY.TECHNICAL_ONLY);
  assert.equal(isNarrativeCandidate(lowWeightL4.priority), false);

  // On an on-brief subject it may reach supporting evidence — and never a headline.
  const onBriefLow = parameterNarrativePriority({
    key: 'p7', weight: PARAM_WEIGHTS.p7, level: 'L4', relevance: BRIEF_RELEVANCE.HIGH,
  });
  assert.equal(onBriefLow.priority, NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE);
  assert.equal(mayUseFlagshipLanguage(onBriefLow.priority), false);

  // P8 is the documented example: an L4 that is correct engineering and no story.
  const p8 = parameterNarrativePriority({
    key: 'p8', weight: PARAM_WEIGHTS.p8, level: 'L4', relevance: BRIEF_RELEVANCE.HIGH,
  });
  assert.equal(p8.priority, NARRATIVE_PRIORITY.TECHNICAL_ONLY);
  assert.match(p8.reason, /assumption/);
});

test('a heavily weighted L1 or L2 may be told positively when the brief is built around it', () => {
  for (const level of ['L1', 'L2']) {
    const classified = parameterNarrativePriority({
      key: 'p18', weight: PARAM_WEIGHTS.p18, level, relevance: BRIEF_RELEVANCE.HIGH,
    });
    assert.equal(classified.tier, 'high');
    assert.equal(classified.priority, NARRATIVE_PRIORITY.LEAD_STORY, level);
  }

  // And the language that result has earned is positive, not a hedge.
  const l1 = phraseAfterRelevance({ key: 'p18', level: 'L1', priority: NARRATIVE_PRIORITY.LEAD_STORY });
  const l2 = phraseAfterRelevance({ key: 'p18', level: 'L2', priority: NARRATIVE_PRIORITY.LEAD_STORY });
  assert.match(l1, /solid bass depth/);
  assert.match(l1, /weight and scale/);
  assert.match(l2, /deep bass/);
  assert.match(l2, /impact and excitement/);
  assert.deepEqual(flattenedResultTerms(`${l1} ${l2}`), []);
  assert.notEqual(l1, l2, 'the two levels must not flatten into one sentence');
});

test('a heavily weighted L4 earns flagship language, and only when it is a lead story', () => {
  const classified = parameterNarrativePriority({
    key: 'p18', weight: PARAM_WEIGHTS.p18, level: 'L4', relevance: BRIEF_RELEVANCE.HIGH,
  });
  assert.equal(classified.priority, NARRATIVE_PRIORITY.LEAD_STORY);
  assert.equal(mayUseFlagshipLanguage(classified.priority), true);
  const phrase = phraseAfterRelevance({ key: 'p18', level: 'L4', priority: classified.priority });
  assert.match(phrase, /exceptional/);
  assert.notEqual(phrase, phraseAfterRelevance({ key: 'p18', level: 'L2', priority: classified.priority }));
});

test('the same result changes class when the brief changes', () => {
  // A moderate-importance L4: a lead story for a reference cinema, worth mentioning
  // otherwise. The level did not change; the brief did.
  const onBrief = parameterNarrativePriority({
    key: 'p16', weight: PARAM_WEIGHTS.p16, level: 'L4', relevance: REFERENCE_CINEMA.byArea.timbre_matching,
  });
  const offBrief = parameterNarrativePriority({
    key: 'p16', weight: PARAM_WEIGHTS.p16, level: 'L4', relevance: MEDIA_LOUNGE.byArea.timbre_matching,
  });
  assert.equal(onBrief.priority, NARRATIVE_PRIORITY.LEAD_STORY);
  assert.equal(offBrief.priority, NARRATIVE_PRIORITY.WORTH_MENTIONING);
  assert.notEqual(onBrief.priority, offBrief.priority);

  // The media lounge reads bass as central and tonal consistency as standard; the
  // reference cinema reads both as central.
  assert.equal(MEDIA_LOUNGE.byArea.bass_capability, BRIEF_RELEVANCE.HIGH);
  assert.equal(MEDIA_LOUNGE.byArea.timbre_matching, BRIEF_RELEVANCE.STANDARD);
  assert.equal(REFERENCE_CINEMA.byArea.timbre_matching, BRIEF_RELEVANCE.HIGH);

  // A subject the design does not contain states nothing, whatever its level.
  const absent = readBriefRelevance({ intent: BRIEF_INTENT.MEDIA_LOUNGE, design: { bass: false } });
  assert.equal(absent.byArea.bass_capability, BRIEF_RELEVANCE.NONE);
  assert.equal(
    parameterNarrativePriority({ key: 'p18', weight: PARAM_WEIGHTS.p18, level: 'L4', relevance: BRIEF_RELEVANCE.NONE }).priority,
    NARRATIVE_PRIORITY.TECHNICAL_ONLY,
  );
});

test('do not discuss overrides the selection and changes no evidence', () => {
  const excluded = parameterNarrativePriority({
    key: 'p18', weight: PARAM_WEIGHTS.p18, level: 'L4', relevance: BRIEF_RELEVANCE.HIGH, excluded: true,
  });
  assert.equal(excluded.priority, NARRATIVE_PRIORITY.DO_NOT_DISCUSS);
  assert.equal(isNarrativeCandidate(excluded.priority), false);
  assert.equal(mayUseFlagshipLanguage(excluded.priority), false);
  assert.equal(phraseAfterRelevance({ key: 'p18', level: 'L4', priority: excluded.priority }), null);

  // The evidence itself is untouched: the row is still there, with its own weight,
  // its own level and its own contribution.
  const summary = summaryOf([[18, 'L4'], [19, 'L4'], [20, 'L3']]);
  const before = JSON.stringify(summary);
  const { rows } = buildNarrativePriorityRows({
    summary,
    intent: BRIEF_INTENT.DEDICATED_CINEMA,
    design: { bass: true },
    excludedKeys: ['p18'],
  });
  const p18 = rows.find((row) => row.key === 'p18');
  assert.equal(p18.priority, NARRATIVE_PRIORITY.DO_NOT_DISCUSS);
  assert.equal(p18.level, 'L4');
  assert.equal(p18.weight, PARAM_WEIGHTS.p18);
  assert.equal(JSON.stringify(summary), before, 'classification must not touch the evidence');
  // The other bass parameters keep their own classes.
  assert.equal(rows.find((row) => row.key === 'p19').priority, NARRATIVE_PRIORITY.LEAD_STORY);
});

test('the achieved level chooses the strength of the words, and only after relevance', () => {
  const at = (priority) => phraseAfterRelevance({ key: 'p12', level: 'L4', priority });
  assert.equal(at(NARRATIVE_PRIORITY.TECHNICAL_ONLY), null, 'technical evidence carries no narrative language');
  assert.equal(at(NARRATIVE_PRIORITY.DO_NOT_DISCUSS), null);
  assert.match(at(NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE), /exceptional/);
  assert.match(at(NARRATIVE_PRIORITY.WORTH_MENTIONING), /exceptional/);
  assert.match(at(NARRATIVE_PRIORITY.LEAD_STORY), /exceptional/);

  // The order itself is the rule: a level with no earned relevance produces nothing.
  const topic = topicNarrativePriority('speaker_positioning', { level: 'L4', relevance: BRIEF_RELEVANCE.NONE });
  assert.equal(topic.priority, NARRATIVE_PRIORITY.TECHNICAL_ONLY);
  assert.equal(phraseAfterRelevance({ key: 'p5', level: 'L4', priority: topic.priority }), null);
});

test('the Expert View rows state weight, result, contribution and class', () => {
  const summary = summaryOf([[18, 'L1'], [14, 'L3'], [7, 'L4'], [8, 'L4'], [16, 'L4'], [19, 'L4']]);
  const { rows, brief } = buildNarrativePriorityRows({
    summary,
    intent: BRIEF_INTENT.MEDIA_LOUNGE,
    design: { display: true, speakers: true, seats: 3, bass: true, spatial: true, timbre: true, screenChannels: true },
  });
  assert.equal(brief.intent, BRIEF_INTENT.MEDIA_LOUNGE);

  const p18 = rows.find((row) => row.key === 'p18');
  assert.equal(p18.weight, 12);
  assert.equal(p18.tier, 'high');
  assert.equal(p18.level, 'L1');
  assert.equal(p18.multiplier, LEVEL_MULTIPLIERS.L1);
  assert.equal(p18.contribution, LEVEL_MULTIPLIERS.L1 * 12);
  assert.equal(p18.maximum, LEVEL_MULTIPLIERS.L4 * 12);
  assert.equal(p18.brief_relevance, BRIEF_RELEVANCE.HIGH);
  assert.equal(p18.priority_label, PRIORITY_LABEL[NARRATIVE_PRIORITY.LEAD_STORY]);
  assert.equal(p18.performance_area, 'Bass performance');

  const p7 = rows.find((row) => row.key === 'p7');
  assert.equal(p7.priority, NARRATIVE_PRIORITY.TECHNICAL_ONLY);
  assert.equal(p7.level, 'L4', 'a technical-only row still states its result');

  const p8 = rows.find((row) => row.key === 'p8');
  assert.equal(p8.priority, NARRATIVE_PRIORITY.TECHNICAL_ONLY);

  // The two filters the Expert View offers, read from the same classification.
  assert.equal(rows.filter((row) => row.tier === 'high').length, 3);
  const candidates = narrativeCandidateRows(rows);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((row) => isNarrativeCandidate(row.priority)));
  assert.ok(!candidates.some((row) => row.key === 'p7' || row.key === 'p8'));
});

test('the highlights are selected by the same classification', () => {
  const story = (id, members, level) => ({
    id, members, level, material: false, importance: members.reduce((sum, member) => sum + member.weight, 0), scope: 'room', order: 1,
  });
  const lowWeightL4 = attachStoryNarrativePriority(story('wide-speakers', [{ key: 'p7', weight: PARAM_WEIGHTS.p7, level: 'L4' }], 'L4'), { brief: MEDIA_LOUNGE });
  const onBriefBassL2 = attachStoryNarrativePriority(story('bass', [{ key: 'p18', weight: PARAM_WEIGHTS.p18, level: 'L2' }], 'L2'), { brief: MEDIA_LOUNGE });

  assert.equal(lowWeightL4.narrative_priority, NARRATIVE_PRIORITY.TECHNICAL_ONLY);
  assert.equal(onBriefBassL2.narrative_priority, NARRATIVE_PRIORITY.LEAD_STORY);

  // The page keeps the on-brief result even though it is below the floor, and drops
  // the L4 that was never a story.
  const { admitted } = admitStrengthStories([lowWeightL4, onBriefBassL2], { floor: 3, brief: MEDIA_LOUNGE });
  assert.deepEqual(admitted.map((entry) => entry.id), ['bass']);

  // Without a brief the previous selection rule still decides, unchanged: the L4 is
  // the only admitted story and the L2 bass result stays below the floor. The brief
  // is what promotes the on-brief result — never the level alone.
  const withoutBrief = admitStrengthStories([lowWeightL4, onBriefBassL2], { floor: 3 });
  assert.deepEqual(withoutBrief.admitted.map((entry) => entry.id), ['wide-speakers']);
});

test('the narrative steer suggests by importance and brief, never by level alone', () => {
  assert.equal(topicIsSuggested('bass_extension', 'Bass extension result L3 · 25 Hz'), true);
  assert.equal(topicIsSuggested('bass_extension', 'Bass extension result L1 · 22 Hz'), false);
  // A lightly weighted subject at L2 is not suggested; the result alone does not win.
  assert.equal(topicIsSuggested('overhead_arrangement', 'Overhead spacing result L2 · 1.2 m'), false);
  assert.equal(topicIsSuggested('overhead_arrangement', 'Overhead spacing result L3 · 1.2 m'), true);
  // A count and the seating are never suggested, at any level.
  assert.equal(topicIsSuggested('channel_count', 'The 9 discrete channels L4'), false);
  assert.equal(topicIsSuggested('seating_arrangement', 'Seating positions L4'), false);

  // The brief ranks the suggestions, and each topic carries its own class.
  const chips = [
    { label: 'Explain the L4 screen timbre result', reason: 'Screen timbre result for this version: L4 · 2.1 dB.', area: 'timbre_matching' },
    { label: 'Highlight the bass extension result', reason: 'Bass extension result for this version: L2 · 28 Hz.', area: 'bass_capability' },
  ];
  const topics = presentSteerTopics({ chips, brief: MEDIA_LOUNGE });
  assert.equal(topics[0].topic_key, 'bass_extension', 'the on-brief, heavily weighted subject leads');
  assert.equal(topics[0].suggested, true);
  assert.equal(topics[0].narrative_priority, NARRATIVE_PRIORITY.LEAD_STORY);
  assert.ok(topics.every((topic) => typeof topic.narrative_priority === 'string'));
  // Everything is still offered: only the order changed.
  assert.ok(topics.some((topic) => topic.topic_key === 'seating_arrangement'));
});

test('the Expert View is designer-facing only, and no client document imports it', () => {
  const component = source('src/components/roomdesigner/ExpertViewDesignWeighting.jsx');
  for (const heading of ['ASDR weight', 'Result', 'Primary-seat result', 'Secondary-seat result', 'ASDR contribution', 'Brief relevance', 'Narrative role']) {
    assert.match(component, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(component, /buildNarrativePriorityRows/);
  assert.match(component, /never included in a client proposal or report/);
  for (const filter of ['All', 'High-weight', 'Narrative candidates', 'Design rationale']) {
    assert.match(component, new RegExp(`label: '${filter}'`));
  }
  // It is opened from the Room Designer's Options panel and nowhere else.
  const importers = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.(?:js|jsx|ts|tsx)$/.test(entry)) continue;
      if (readFileSync(path, 'utf8').includes('ExpertViewDesignWeighting')) importers.push(path);
    }
  };
  walk('src');
  assert.deepEqual(
    importers.map((path) => path.split('/').pop()).sort(),
    ['ExpertViewDesignWeighting.jsx', 'OptionsPanel.jsx'],
  );
});

test('no RP22 or RP23 calculation, threshold or grading path is touched', () => {
  const asdr = source(ASDR_MODULE);
  // The grading machinery this module owns is untouched by the change.
  for (const line of [
    'import { resolveParamThresholds } from "@/components/report/technical/roomParameterLevelAuthority";',
    'import { rp23LevelForAngleDeg } from "@/components/utils/viewingAngleUtils";',
    'function applyCatalogThresholds(rawValue, thresholds, direction) {',
    'export function calculateRoomDesignRating(authority) {',
  ]) {
    assert.ok(asdr.includes(line), line);
  }
  // The narrative authority reads weights and levels only: it grades nothing and
  // reaches no RP22/RP23 threshold authority of its own.
  const narrative = source('base44/shared/narrativePriorityAuthority.js');
  assert.doesNotMatch(narrative, /applyCatalogThresholds|resolveParamThresholds|rp23LevelForAngleDeg|rp22Catalog|gradeP\d/);
  assert.match(narrative, /Pure: no React/);
});