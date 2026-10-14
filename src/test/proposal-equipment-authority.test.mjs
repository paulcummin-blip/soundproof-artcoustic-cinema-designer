/**
 * The proposal states the DISPLAY and the EQUIPMENT from the same authorities the
 * Project Report and the Speaker Design state them from.
 *
 * Two failures are locked out here.
 *
 * 1. A television frozen as a projection screen. The report's own evidence builder
 *    resolved the display type from a hand-picked key set (`display_type`,
 *    screen_manual_config, television) while the capture carries the designer's TV
 *    evidence as a TV preset key and a saved TV width. A 100" `tv100` design was
 *    therefore evidenced as a projection screen, with the diagonal derived off its
 *    87.8" viewable width (101"), and the proposal — which reads that evidence —
 *    stated `88" 16:9 projection screen`.
 *
 * 2. A mixed front stage collapsed to one "LCR" row of the left/right model. The
 *    proposal's system authority reads one model per role, so a stage of
 *    EVOLVE 3-1 left/right with a C4-1 centre became `LCR: EVOLVE 3-1` and the
 *    centre disappeared. The Project Report and the Speaker Design both state the
 *    centre, because both read every placed speaker.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

import {
  frontStageProductRoles,
  frontStageStatesPositions,
  isMixedCentreStage,
  resolveFrontStage,
} from '../components/proposal/engineeringAuthority/resolveFrontStageRoles.js';
import {
  displayPhrase,
  resolveDisplayType,
  savedDiagonalInches,
} from '../components/models/screen/displayTypeAuthority.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const EVIDENCE = read('components/report/reportEvidenceAuthority.js');
const SYSTEM = read('components/proposal/engineeringAuthority/buildSystemAuthority.js');
const PACK = read('components/proposal/print/proposalPackAuthority.js');
const SPEAKER_DESIGN = read('components/report/speakerDesign/speakerDesignRows.js');

// ── The Marquee Home / Original Design facts, verbatim ──────────────────────
const MIXED_STAGE = [
  { role: 'FL', model: 'evolve-3-1' },
  { role: 'FC', model: 'c4-1' },
  { role: 'FR', model: 'evolve-3-1' },
  { role: 'SL', model: 'evolve-2-1' },
  { role: 'SR', model: 'evolve-2-1' },
];
// The design's own screen authority: a 100" television (design_state tv100).
const TV_SCREEN = {
  visibleWidthInches: 87.8,
  tvPresetKey: 'tv100',
  tvWidthMm: 2230,
  aspectRatio: '16:9',
  screen_manual_config: undefined,
};

/* ── 1 · mixed front-stage TV system ─────────────────────────────────────── */

test('1. a mixed front stage is stated position by position, never as one LCR', () => {
  const frontStage = resolveFrontStage(MIXED_STAGE);
  assert.equal(frontStage.structure, 'mixed_centre');
  assert.equal(isMixedCentreStage(frontStage), true);
  assert.equal(frontStageStatesPositions(frontStage), true);
  assert.equal(frontStage.leftModel, 'evolve-3-1');
  assert.equal(frontStage.rightModel, 'evolve-3-1');
  assert.equal(frontStage.centreModel, 'c4-1');

  const roles = frontStageProductRoles(frontStage);
  const positions = roles.map((role) => [role.position_label, role.model_label]);
  assert.deepEqual(positions, [
    ['Front Left / Right', 'EVOLVE 3-1'],
    ['Centre', 'C4-1'],
  ]);
  // The stage is never stated as a collapsed LCR of the sides' model.
  assert.equal(roles.some((role) => role.role === 'lcr'), false);
  // The centre is its own position with its own cabinet, not a second channel.
  const centre = roles.find((role) => role.role === 'centre');
  assert.equal(centre.channel_count, 1);
  assert.equal(centre.cabinet_count, 1);
  assert.equal(centre.model_statement, 'C4-1');
});

test('1b. the proposal system authority never collapses a mixed stage to LCR', () => {
  assert.match(SYSTEM, /const frontStageByPosition = frontStageStatesPositions\(frontStage\);/);
  assert.match(SYSTEM, /if \(frontStageByPosition\) productRoles\.push\(\.\.\.frontStageProductRoles\(frontStage\)\);/);
  assert.match(SYSTEM, /if \(frontStageByPosition && role === 'lcr'\) continue;/);
});

test('1c. the projection screen never appears: the display states the television', () => {
  assert.equal(resolveDisplayType(TV_SCREEN), 'tv');
  assert.equal(savedDiagonalInches(TV_SCREEN), 100);
  assert.equal(displayPhrase(TV_SCREEN), '100" TV');
});

/* ── 2 · an identical LCR stage still collapses ──────────────────────────── */

test('2. a stage whose centre IS the left/right model still collapses to one LCR row', () => {
  const frontStage = resolveFrontStage([
    { role: 'FL', model: 'q6-3' },
    { role: 'FC', model: 'q6-3' },
    { role: 'FR', model: 'q6-3' },
  ]);
  assert.equal(frontStage.structure, 'single_centre');
  assert.equal(isMixedCentreStage(frontStage), false);
  assert.equal(frontStageStatesPositions(frontStage), false);
  assert.deepEqual(frontStageProductRoles(frontStage), []);
});

test('2b. a design with no centre collapses nothing and invents nothing', () => {
  const frontStage = resolveFrontStage([
    { role: 'FL', model: 'evolve-3-1' },
    { role: 'FR', model: 'evolve-3-1' },
  ]);
  assert.equal(isMixedCentreStage(frontStage), false);
  assert.equal(frontStageStatesPositions(frontStage), false);
});

/* ── 3 · a projector system keeps the projection rule ───────────────────── */

test('3. a projection screen states its viewable width and aspect, never an invented diagonal', () => {
  const projector = { screen_size: 170, aspect_ratio: '2.35:1' };
  assert.equal(resolveDisplayType(projector), 'projector_screen');
  assert.equal(displayPhrase(projector), '170" 2.35:1 projection screen');
  // The derived 185" diagonal is never written for a projection screen.
  assert.doesNotMatch(displayPhrase(projector), /185/);
});

test('3b. the report evidence states the display the design chose', () => {
  // The display's own evidence is handed over whole, so a TV preset or a saved TV
  // width can never be invisible to the resolver again.
  assert.match(EVIDENCE, /const displayType = resolveDisplayType\(screen \|\| \{\}\);/);
  assert.doesNotMatch(EVIDENCE, /resolveDisplayType\(\{\s*\n\s*display_type: screen\?\.display_type,/);
  // A television's diagonal comes from THE display authority, not from narrowing
  // its viewable width back up.
  assert.match(EVIDENCE, /const viewableDiagonalIn = displayType === DISPLAY_TYPE_TV\n\s*\? round\(savedDiagonalInches\(screen\), 1\)/);
});

/* ── 4 · the Speaker Design workflow ────────────────────────────────────── */

test('4. the front stage is stated from the same authority the Speaker Design states it', () => {
  // The Speaker Design states the centre as its own position, from the physical
  // speakers — the same reading the proposal's front stage now takes.
  assert.match(SPEAKER_DESIGN, /\{ key: 'FL', group: 'front_stage', position: 'Front left' \}/);
  assert.match(SPEAKER_DESIGN, /\{ key: 'FR', group: 'front_stage', position: 'Front right' \}/);
  assert.match(SPEAKER_DESIGN, /\{ key: 'FC', group: 'front_stage', position: 'Centre' \}/);
  // And the pack prints the position the role itself names, so a stated position
  // is never re-grouped into a generic LCR row.
  assert.match(PACK, /const label = role\?\.position_label \|\| PACKAGE_GROUP_LABELS\[key\]/);
  assert.match(PACK, /'Front left',\n\s*'Front right',\n\s*'Front Left \/ Right',/);
});