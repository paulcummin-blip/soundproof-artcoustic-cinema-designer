// at-a-glance-versions.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the at-a-glance page of a comparison shows every selected
// version, not one.
//
// Root cause under test: the page was built from a single engineering snapshot,
// so a comparison covering two versions showed the client one system while the
// document was about several. The page now carries one block per selected
// version, built from the same calculated comparison rows the Key Differences
// table prints, so the page and the table can never state different values.
//
//   TEST 1  one block per selected version, titled with the exact saved name
//   TEST 2  each block states that version's own column, both versions included
//   TEST 3  a shared value appears in both blocks (it is not dropped)
//   TEST 4  the single-version facts that would stand in for both are not used
//   TEST 5  a single version (or no table) keeps the page's single-system form
//   TEST 6  the page and the pack actually pass the comparison in
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildComparisonGlance } from '../components/proposal/print/atAGlanceVersions.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const VERSIONS = [
  { version_id: 'v1', label: 'Option A', version_name: 'Level 1 version' },
  { version_id: 'v2', label: 'Option B', version_name: 'Level 4 version' },
];

const ROWS = [
  { key: 'system_layout', area: 'System layout', values: ['5.1', '9.1.6'], change: '5.1 → 9.1.6', identical: false },
  { key: 'speakers', area: 'Speaker package', values: ['Left/Centre/Right: Evolve 3-1', 'Left/Centre/Right: Evolve 5-1'], change: 'Left/Centre/Right: Evolve 3-1 → Left/Centre/Right: Evolve 5-1', identical: false },
  { key: 'subwoofers', area: 'Subwoofers', values: ['2 × SUB2-12', '4 × SUB4-12'], change: '2 × SUB2-12 → 4 × SUB4-12', identical: false },
  { key: 'seating', area: 'Seating', values: ['2 rows, 6 seats', '2 rows, 6 seats'], change: 'No change', identical: true },
  { key: 'screen_size', area: 'Screen size', values: ['150" (16:9)', '150" (16:9)'], change: 'No change', identical: true },
  { key: 'rp23_viewing', area: 'Viewing angle / RP23', values: ['Level 3 · 57.5°', 'Level 4 · 55°'], change: 'L3 → L4', identical: false },
];

const PROJECT_CARDS = [
  { label: 'Project', value: 'Demonstration Cinema' },
  { label: 'Client', value: 'Client' },
  { label: 'Project reference', value: 'SP-001' },
  { label: 'Design version', value: 'Level 1 version' },
  { label: 'Prepared date', value: '04/10/2026' },
];

const ROOM_CARDS = [
  { label: 'Room size', value: '6.8 × 5.2 × 2.7 m' },
  { label: 'Screen', value: '150" 16:9 viewable image' },
  { label: 'Seating', value: '6 seats' },
  { label: 'Viewing geometry', value: 'Row 1 · 57.5° · RP23 L3' },
  { label: 'Acoustic treatment', value: '8 Abfuser panels' },
];

const build = (rows = ROWS, versions = VERSIONS) => buildComparisonGlance({
  comparisonRows: rows,
  comparisonVersions: versions,
  projectCards: PROJECT_CARDS,
  roomCards: ROOM_CARDS,
});

test('TEST 1 — one block per selected version, titled with the exact saved name', () => {
  const glance = build();
  assert.deepEqual(
    glance.versionGroups.map((group) => group.name),
    ['Level 1 version', 'Level 4 version'],
    'every selected version gets its own block, named exactly as it is saved',
  );
});

test('TEST 2 — each block states that version’s own values, both versions included', () => {
  const [first, second] = build().versionGroups;
  const value = (group, label) => group.cards.find((card) => card.label === label)?.value;

  assert.equal(value(first, 'System layout'), '5.1');
  assert.equal(value(second, 'System layout'), '9.1.6', 'the second version is stated, not the first one repeated');
  assert.equal(value(second, 'Subwoofers'), '4 × SUB4-12');
  assert.equal(value(second, 'Viewing geometry'), 'Level 4 · 55°');
  assert.equal(value(first, 'Speakers'), 'Left/Centre/Right: Evolve 3-1');
});

test('TEST 3 — a shared value appears in both blocks rather than being dropped', () => {
  const [first, second] = build().versionGroups;
  const sharedValue = (group) => group.cards.find((card) => card.label === 'Seating')?.value;

  assert.equal(sharedValue(first), '2 rows, 6 seats');
  assert.equal(sharedValue(second), '2 rows, 6 seats', 'a fact both versions share is still stated for both');
});

test('TEST 4 — the single-version facts that would stand in for both are left out', () => {
  const glance = build();
  const projectLabels = glance.projectCards.map((card) => card.label);
  const roomLabels = glance.roomCards.map((card) => card.label);

  assert.ok(!projectLabels.includes('Design version'), 'each block names its own version, so no single version card is printed');
  assert.deepEqual(roomLabels, ['Room size'], 'only the room itself is shared: screen and seating are per version');
  assert.ok(!roomLabels.includes('Acoustic treatment'));
  const roomCardLabels = glance.versionGroups[1].cards.map((card) => card.label);
  assert.ok(roomCardLabels.includes('Screen') && roomCardLabels.includes('Seating'), 'and they are stated per version instead');
});

test('TEST 5 — a single version or no calculated table keeps the single-system page', () => {
  assert.deepEqual(build(ROWS, [VERSIONS[0]]).versionGroups, [], 'one version is not a comparison');
  assert.deepEqual(build([], VERSIONS).versionGroups, [], 'no calculated table leaves the page as it was');
  assert.deepEqual(build(null, null).versionGroups, []);
});

test('TEST 6 — the at-a-glance page and the pack pass the comparison in', () => {
  const page = read('src/components/proposal/print/AtAGlancePage.jsx');
  assert.match(page, /comparison\.versionGroups\.map/, 'the page renders a block per selected version');
  assert.match(page, /comparisonRows/, 'built from the calculated comparison rows');

  const pack = read('src/components/proposal/print/ProposalPackDocument.jsx');
  assert.match(pack, /comparisonRows=\{comparisonRows\}/, 'the pack hands the comparison rows to the page');
  assert.match(pack, /comparisonVersions=\{comparisonVersions\}/, 'and the option columns');
  assert.match(pack, /\|\| hasComparisonGlance/, 'a comparison page is not skipped when the other groups are empty');
});