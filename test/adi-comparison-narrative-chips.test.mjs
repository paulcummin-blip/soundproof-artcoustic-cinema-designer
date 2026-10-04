/**
 * adi-comparison-narrative-chips.test.mjs
 * ---------------------------------------
 * Acceptance tests for the comparison-mode ADI narrative example chips in
 * Proposal Centre Step 4.
 *
 * A comparison proposal covers two or more selected versions, so its examples
 * must compare those versions and must never state one version's fact as though
 * it applied to the whole proposal. A fact identical in every selected version
 * may still be stated normally.
 *
 *   Single version  = describe that version.
 *   Comparison mode = compare all selected versions.
 *
 * Marquee Home fixture: Level 1 version (2 subs, 9.1.4) against Level 4 version
 * (4 subs, 9.1.6).
 */

import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildNarrativeFacts } from '../base44/shared/adiNarrativeFacts.js';
import { buildAuthorityChips } from '../base44/shared/adiNarrativeAuthority.js';
import {
  buildComparisonAuthorityChips,
  buildSharedAuthorityChips,
  distinctSubwooferCounts,
  resolveComparisonNarrativeChips,
  validateComparisonChip,
} from '../base44/shared/adiComparisonNarrativeChips.js';

// ── Marquee Home fixtures ───────────────────────────────────────────────────

function instances(front, rear, model) {
  return [
    ...Array.from({ length: front }, () => ({ enabled: true, legacyGroup: 'front', model })),
    ...Array.from({ length: rear }, () => ({ enabled: true, legacyGroup: 'rear', model })),
  ];
}

function headline(parameter_id, achieved_level, formatted_value) {
  return { parameter_id, achieved_level, formatted_value };
}

function marqueeSnapshot({ name, config, totalDiscrete, subs, dynamicRange }) {
  return {
    available: true,
    project: { name: 'Marquee Home' },
    room: {
      screen: { size_inches: 170, aspect_ratio: '2.35:1' },
      seating: { total_seats: 8, row_count: 2 },
      dimensions_text: '7.0 × 9.0 × 2.8 m',
    },
    system: {
      configuration: {
        dolby_config: config,
        total_discrete_channels: totalDiscrete,
        text: `${config} system`,
      },
      channel_layout: { total_discrete: totalDiscrete },
      subwoofer_strategy: { instances: subs, count: subs.length },
    },
    rp22: {
      parameter_headlines: [
        headline(1, 'L4', '100 %'),
        headline(5, 'L3', '0.9 m'),
        headline(9, 'L3', '1.1 m'),
        headline(12, dynamicRange, '105 dB'),
        headline(18, 'L3', '25 Hz'),
      ],
    },
    viewing: { available: true, project_floor: 'L4', per_seat: [] },
  };
}

const LEVEL_1 = {
  version_id: 'v-l1',
  version_name: 'Level 1 version',
  snapshot: marqueeSnapshot({
    name: 'Level 1 version',
    config: '9.1.4',
    totalDiscrete: 13,
    subs: instances(1, 1, 'sub3-12'),
    dynamicRange: 'L3',
  }),
};

const LEVEL_4 = {
  version_id: 'v-l4',
  version_name: 'Level 4 version',
  snapshot: marqueeSnapshot({
    name: 'Level 4 version',
    config: '9.1.6',
    totalDiscrete: 15,
    subs: instances(2, 2, 'sub4-12'),
    dynamicRange: 'L4',
  }),
};

const LEVEL_2 = {
  version_id: 'v-l2',
  version_name: 'Level 2 version',
  snapshot: marqueeSnapshot({
    name: 'Level 2 version',
    config: '7.1.4',
    totalDiscrete: 12,
    subs: instances(2, 0, 'sub3-12'),
    dynamicRange: 'L3',
  }),
};

const LEVEL_6 = {
  version_id: 'v-l6',
  version_name: 'Level 6 version',
  snapshot: marqueeSnapshot({
    name: 'Level 6 version',
    config: '9.1.6',
    totalDiscrete: 15,
    subs: instances(3, 3, 'sub4-12'),
    dynamicRange: 'L4',
  }),
};

function withFacts(entry) {
  return { ...entry, facts: buildNarrativeFacts(entry.snapshot) };
}

const PAIR = [withFacts(LEVEL_1), withFacts(LEVEL_4)];
const labels = (suggestions) => suggestions.map((chip) => chip.label);

// ── Fixture sanity: the facts really are read per version ───────────────────

test('COMPARISON MODE DETECTED — every selected version contributes its own facts', () => {
  expect(PAIR).toHaveLength(2);
  expect(PAIR.every((entry) => entry.facts.available === true)).toBe(true);
  expect(buildComparisonAuthorityChips(PAIR).length).toBeGreaterThan(0);
});

test('LEVEL 1 VERSION FACTS READ — 2 subs, 9.1.4, L3 dynamic range', () => {
  const [level1] = PAIR;
  expect(level1.facts.subwoofers.totalSubwooferCount).toBe(2);
  expect(level1.facts.channels.configuration).toBe('9.1.4');
  expect(level1.facts.screen.sizeInches).toBe(170);
  expect(level1.facts.parameters.p12.level).toBe('L3');
});

test('LEVEL 4 VERSION FACTS READ — 4 subs, 9.1.6, L4 dynamic range', () => {
  const [, level4] = PAIR;
  expect(level4.facts.subwoofers.totalSubwooferCount).toBe(4);
  expect(level4.facts.channels.configuration).toBe('9.1.6');
  expect(level4.facts.screen.sizeInches).toBe(170);
  expect(level4.facts.parameters.p12.level).toBe('L4');
});

// ── The comparison chip set ─────────────────────────────────────────────────

test('COMPARISON PROMPTS GENERATED — compare wording across the selected versions', () => {
  const found = labels(buildComparisonAuthorityChips(PAIR));
  for (const expected of [
    'Explain the main differences between the two versions',
    'Compare the dynamic range of both systems',
    'Compare the bass layouts of both systems',
    'Compare the spatial resolution of both systems',
    'Compare the speaker layouts of both systems',
    'Compare the screen and seating experience',
    'Compare the subwoofer strategies',
  ]) {
    expect(found).toContain(expected);
  }
});

test('SUBWOOFER COUNTS COMPARED — the exact 2-sub and 4-sub comparison is offered', () => {
  const chips = buildComparisonAuthorityChips(PAIR);
  const exact = chips.find((chip) => chip.label === 'Compare the 2-sub and 4-sub bass layouts');
  expect(exact).toBeDefined();
  // The reason names both versions and the count each one holds.
  expect(exact.reason).toContain('Level 1 version: 2 × SUB3-12');
  expect(exact.reason).toContain('Level 4 version: 4 × SUB4-12');
  expect(distinctSubwooferCounts(PAIR)).toEqual([2, 4]);
});

test('NO SINGLE-VERSION SUB CHIP IN COMPARISON MODE', () => {
  const { suggestions } = resolveComparisonNarrativeChips({ aiChips: [], versions: PAIR });
  const found = labels(suggestions);
  expect(found).not.toContain('Explain the 2 subwoofer front/rear configuration');
  expect(found).not.toContain('Explain the 4 subwoofer front/rear configuration');
  // Even when ADI offers one, it is rejected: the fact belongs to one version.
  for (const bad of [
    'Explain the 2 subwoofer front/rear configuration',
    'Explain the 4 subwoofer front/rear configuration',
    'Show the L3 screen Dynamic Range result',
  ]) {
    expect(validateComparisonChip(bad, PAIR).status).toBe('rejected');
  }
  expect(validateComparisonChip('Show the L4 screen Dynamic Range result', PAIR).status).toBe('rejected');
});

test('SHARED FACTS STILL ALLOWED — a fact identical in every version may be stated normally', () => {
  const shared = buildSharedAuthorityChips(PAIR).map((chip) => chip.label);
  expect(shared).toContain('Emphasise the 170 inch 2.35:1 screen');
  const { suggestions } = resolveComparisonNarrativeChips({ aiChips: [], versions: PAIR });
  expect(labels(suggestions)).toContain('Emphasise the 170 inch 2.35:1 screen');
  // A shared fact passes; a single-version value does not.
  expect(validateComparisonChip('Emphasise the 170 inch 2.35:1 screen', PAIR).status).toBe('passed');
  expect(validateComparisonChip('Emphasise the 185 inch screen', PAIR).status).toBe('rejected');
});

test('VERSION NAMES OFFICIAL — a chip may name the saved version names', () => {
  expect(validateComparisonChip('Compare Level 1 version and Level 4 version', PAIR).status).toBe('passed');
  expect(validateComparisonChip('Explain the main differences between the two versions', PAIR).status).toBe('passed');
  // A comparative chip may state a value from any selected version, but never a
  // value from no version at all.
  expect(validateComparisonChip('Compare the 2-sub and 4-sub bass layouts', PAIR).status).toBe('passed');
  expect(validateComparisonChip('Compare the 12-sub and 4-sub bass layouts', PAIR).status).toBe('rejected');
});

test('ADI suggestions are held to the same rule', () => {
  const { suggestions, diagnostics } = resolveComparisonNarrativeChips({
    versions: PAIR,
    aiChips: [
      { label: 'Explain the 4 subwoofer front/rear configuration', reason: 'Level 4 only.' },
      { label: 'Compare the bass extension of both systems', reason: 'Bass of both versions.' },
    ],
  });
  const found = labels(suggestions);
  expect(found).toContain('Compare the bass extension of both systems');
  expect(found).not.toContain('Explain the 4 subwoofer front/rear configuration');
  const rejected = diagnostics.find((entry) => entry.text === 'Explain the 4 subwoofer front/rear configuration');
  expect(rejected?.status).toBe('rejected');
});

// ── Mode and selection behaviour ────────────────────────────────────────────

test('SINGLE-VERSION PROMPTS STILL WORK', () => {
  const single = [withFacts(LEVEL_1)];
  // No comparison chips and no comparison resolution for one version.
  expect(buildComparisonAuthorityChips(single)).toEqual([]);
  expect(resolveComparisonNarrativeChips({ versions: single }).suggestions).toEqual([]);
  // The single-version examples are untouched.
  const singleChips = buildAuthorityChips(single[0].facts).map((chip) => chip.label);
  expect(singleChips).toContain('Explain the 2 subwoofer front/rear configuration');
  expect(singleChips).toContain('Explain the 9.1.4 system layout');
});

test('PROMPTS UPDATE WHEN VERSION SELECTION CHANGES', () => {
  const three = [withFacts(LEVEL_1), withFacts(LEVEL_4), withFacts(LEVEL_6)];
  const found = labels(buildComparisonAuthorityChips(three));
  expect(found).toContain('Explain the main differences across all selected versions');
  expect(found).toContain('Compare the dynamic range across all systems');
  // Three different subwoofer counts: no exact "x-sub and y-sub" chip is honest.
  expect(distinctSubwooferCounts(three)).toBeNull();
  expect(found.some((label) => label.includes('-sub and'))).toBe(false);

  const differentPair = [withFacts(LEVEL_2), withFacts(LEVEL_4)];
  expect(distinctSubwooferCounts(differentPair)).toEqual([2, 4]);
  expect(labels(buildComparisonAuthorityChips(differentPair)))
    .toContain('Compare the 2-sub and 4-sub bass layouts');
});

test('ACTIVE ROOM DESIGNER VERSION NOT USED — only the passed versions are read', () => {
  const { suggestions } = resolveComparisonNarrativeChips({ aiChips: [], versions: PAIR });
  const text = suggestions.map((chip) => `${chip.label} ${chip.reason}`).join(' | ');
  // Level 2 version exists in the project but was not selected, so nothing about
  // it can appear — and the unselected 7.1.4 layout is never stated.
  expect(text).not.toContain('Level 2 version');
  expect(text).not.toContain('7.1.4');
});

// ── Contracts: nothing else changed ─────────────────────────────────────────

test('NO READINESS LOGIC CHANGE — the chip authority reads no readiness source', () => {
  const files = [
    'base44/shared/adiComparisonNarrativeChips.js',
    'src/components/proposal/wizard/AdiSuggestionChips.jsx',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(/proposalReadiness|readinessAuthority|sourceAuthority/);
  }
  const chipSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/proposal/wizard/AdiSuggestionChips.jsx'),
    'utf8',
  );
  // The selected versions are read from their own snapshots, never from the
  // active Room Designer project version.
  expect(chipSource).toContain('version_snapshots');
  expect(chipSource).not.toMatch(/active_version_id|activeProjectId/);
});

test('the wizard brief step passes every selected version to the chips', () => {
  const brief = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/proposal/wizard/ClientBriefStep.jsx'),
    'utf8',
  );
  expect(brief).toContain('versionSnapshots={versionSnapshots}');
  const wizard = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/proposal/CreateProposalWizard.jsx'),
    'utf8',
  );
  expect(wizard).toContain('useSelectedVersionSnapshots');
  expect(wizard).toContain('versionSnapshots={selectedVersionSnapshots}');
});