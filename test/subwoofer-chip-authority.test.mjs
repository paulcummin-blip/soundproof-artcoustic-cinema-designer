/**
 * Acceptance tests — the ADI example chips state the SELECTED version's own
 * subwoofer configuration.
 *
 * Defect under test: the subwoofer example was assembled from the Dolby notation
 * digit (in 9.1.6 the 1 is one LFE channel), so a Marquee Home version with two
 * subwoofers offered "Explain the 1 subwoofer configuration". The chip, the
 * writer's evidence block and the client-summary payload now read ONE shared
 * reading of the version's subwoofer instances.
 *
 *   1. The Dolby notation digit is never the subwoofer count
 *   2. Level 1 shape (1 front + 1 rear) reads 2 with a front/rear layout
 *   3. Level 4 shape (2 front + 2 rear) reads 4, never 1
 *   4. Switched-off instances are not counted as configuration
 *   5. A false "1 subwoofer" example is rejected for a two-sub version
 *   6. No subwoofer data omits the example instead of inventing one
 *   7. Prompt source data states the same count and layout
 *   8. A version's chip never borrows another version's configuration
 *
 * Pure: no React, no database.
 *
 * Run: node test/subwoofer-chip-authority.test.mjs
 */

import assert from 'node:assert/strict';

import { summariseSubwooferConfiguration } from '../base44/shared/subwooferConfigurationSummary.js';
import { buildNarrativeFacts, buildNarrativeFactsBlock } from '../base44/shared/adiNarrativeFacts.js';
import { buildAuthorityChips, validateNarrativeChip } from '../base44/shared/adiNarrativeAuthority.js';
import { buildEngineeringEvidence } from '../base44/shared/engineeringSnapshotEvidence.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const results = [];
const test = (name, fn) => {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${error.message}`);
  }
};

const inst = (model, group, enabled = true) => ({ model, legacyGroup: group, enabled });

/** A minimal version snapshot carrying only what the facts layer reads. */
const versionSnapshot = ({ dolby = '9.1.6', instances = [], channelSubCount = null }) => ({
  available: true,
  room: {},
  system: {
    configuration: { dolby_config: dolby },
    channel_layout: {
      total_discrete: 15,
      subwoofer_count: channelSubCount,
      configuration_text: `${dolby} Dolby Atmos configuration`,
    },
    subwoofer_strategy: {
      count: instances.filter((s) => s.enabled !== false).length,
      models: [...new Set(instances.map((s) => s.model))],
      instances,
    },
  },
});

const subwooferChip = (facts) => buildAuthorityChips(facts)
  .find((chip) => /subwoofer/i.test(chip.label));

// Marquee Home Level 1: SUB4-12, one front and one rear active.
const LEVEL_1 = versionSnapshot({
  instances: [inst('sub4-12', 'front'), inst('sub4-12', 'rear')],
  channelSubCount: 1, // the Dolby digit, deliberately left as the misleading "1"
});

// Marquee Home Level 4 as designed: two front and two rear SUB3-12.
const LEVEL_4 = versionSnapshot({
  instances: [
    inst('sub3-12', 'front'), inst('sub3-12', 'front'),
    inst('sub3-12', 'rear'), inst('sub3-12', 'rear'),
  ],
  channelSubCount: 1,
});

// ── 1. The Dolby notation digit is not a subwoofer count ────────────────────

test('1. the count comes from the instances, never the Dolby digit', () => {
  const facts = buildNarrativeFacts(LEVEL_1);
  assert.equal(facts.channels.configuration, '9.1.6');
  assert.equal(facts.channels.subwooferCount, 2, 'the Dolby 1 is not the configuration');
  assert.equal(facts.subwoofers.totalSubwooferCount, 2);
});

// ── 2. Level 1: one front, one rear ─────────────────────────────────────────

test('2. a 1 front / 1 rear version reads 2 with a front/rear layout', () => {
  const summary = summariseSubwooferConfiguration(LEVEL_1.system);
  assert.equal(summary.totalSubwooferCount, 2);
  assert.equal(summary.frontCount, 1);
  assert.equal(summary.rearCount, 1);
  assert.equal(summary.layoutLabel, 'front/rear');
  assert.equal(summary.modelLabel, 'SUB4-12');
  assert.equal(summary.humanReadableSummary, '2 × SUB4-12 · 1 front / 1 rear layout');

  const chip = subwooferChip(buildNarrativeFacts(LEVEL_1));
  assert.equal(chip.label, 'Explain the 2 subwoofer front/rear configuration');
  assert.ok(!chip.label.includes('1 subwoofer'), 'never states the false single subwoofer');
});

// ── 3. Level 4: two front, two rear ─────────────────────────────────────────

test('3. a 2 front / 2 rear version reads 4 with a front/rear layout', () => {
  const summary = summariseSubwooferConfiguration(LEVEL_4.system);
  assert.equal(summary.totalSubwooferCount, 4);
  assert.equal(summary.frontCount, 2);
  assert.equal(summary.rearCount, 2);
  assert.equal(summary.layoutLabel, 'front/rear');
  assert.equal(summary.humanReadableSummary, '4 × SUB3-12 · 2 front / 2 rear layout');

  const chip = subwooferChip(buildNarrativeFacts(LEVEL_4));
  assert.equal(chip.label, 'Explain the 4 subwoofer front/rear configuration');
});

// ── 4. Switched-off instances are not configuration ─────────────────────────

test('4. disabled instances are not counted as the configuration', () => {
  const facts = buildNarrativeFacts(versionSnapshot({
    instances: [
      inst('sub4-12', 'front'),
      inst('sub4-12', 'front', false),
      inst('sub4-12', 'rear'),
      inst('sub4-12', 'rear', false),
    ],
  }));
  assert.equal(facts.subwoofers.totalSubwooferCount, 2);
  assert.equal(facts.subwoofers.frontCount, 1);
  assert.equal(facts.subwoofers.rearCount, 1);
});

// ── 5. The false example cannot be shown ────────────────────────────────────

test('5. a "1 subwoofer" example is rejected for a two-sub version', () => {
  const facts = buildNarrativeFacts(LEVEL_1);
  assert.equal(validateNarrativeChip('Explain the 1 subwoofer configuration', facts).status, 'rejected');
  assert.equal(validateNarrativeChip(subwooferChip(facts).label, facts).status, 'passed');
});

// ── 6. Missing subwoofer data omits the example ─────────────────────────────

test('6. no subwoofer data omits the example instead of inventing one', () => {
  const bare = { available: true, room: {}, system: { configuration: { dolby_config: '9.1.6' } } };
  const facts = buildNarrativeFacts(bare);
  assert.equal(facts.channels.subwooferCount, null);
  assert.equal(facts.subwoofers.available, false);
  assert.equal(subwooferChip(facts), undefined, 'no subwoofer example is offered');
});

// ── 7. Prompt source data states the same configuration ─────────────────────

test('7. the writer is given the same count and layout', () => {
  const facts = buildNarrativeFacts(LEVEL_4);
  const block = buildNarrativeFactsBlock(facts);
  assert.ok(block.includes('4 × SUB3-12 · 2 front / 2 rear layout'), 'facts block states the configuration');

  const evidence = buildEngineeringEvidence(LEVEL_4);
  assert.ok(evidence.includes('Subwoofer configuration: 4 × SUB3-12 · 2 front / 2 rear layout'),
    'engine evidence states the same configuration');
});

// ── 8. One version never borrows another's configuration ────────────────────

test('8. each version states only its own configuration', () => {
  const one = subwooferChip(buildNarrativeFacts(LEVEL_1)).label;
  const four = subwooferChip(buildNarrativeFacts(LEVEL_4)).label;
  assert.ok(one.includes('2 subwoofer') && !one.includes('4 subwoofer'));
  assert.ok(four.includes('4 subwoofer') && !four.includes('2 subwoofer'));
  assert.equal(summariseSubwooferConfiguration(LEVEL_1.system).modelLabel, 'SUB4-12');
  assert.equal(summariseSubwooferConfiguration(LEVEL_4.system).modelLabel, 'SUB3-12');
});

// ── Report ──────────────────────────────────────────────────────────────────

const failures = results.filter((line) => line.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
if (failures.length > 0) process.exitCode = 1;