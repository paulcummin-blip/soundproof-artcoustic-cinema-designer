/**
 * Canonical ProjectVersion selection.
 *
 * One shared rule decides which ProjectVersion record a normal workflow may list,
 * select and judge readiness against when a version slot holds more than one
 * record. These tests pin the rule's four required behaviours:
 *
 *   1. Genesis — an active pointer selects the real design, and the empty
 *      migration artefact is excluded.
 *   2. A genuine V1–V5 project keeps all five versions.
 *   3. Two same-slot records that both carry independent design data are BOTH
 *      kept and flagged, never silently reduced to one.
 *   4. Recency and array order are never the tie-breaker.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/lib/canonicalVersionSelection.js', import.meta.url),
  'utf8',
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {
  selectCanonicalVersions,
  hasMeaningfulDesignState,
  COLLISION_REASON,
} = await import(moduleUrl);

const designState = (speakers = 0, seats = 0, subs = 0) => ({
  selected_speakers: Array.from({ length: speakers }, (_, i) => ({ id: `S${i}`, role: 'FL' })),
  seating_positions: Array.from({ length: seats }, (_, i) => ({ id: `seat${i}` })),
  subwooferInstances: Array.from({ length: subs }, (_, i) => ({ id: `sub${i}` })),
});

const version = (id, slot, name, extra = {}) => ({
  id,
  project_id: 'P1',
  version_number: slot,
  version_name: name,
  design_state: {},
  ...extra,
});

test('Genesis: the active pointer keeps the real V1 and excludes the empty artefact', () => {
  const canonicalId = '6ac7a189d093a8d8a68eec91';
  const duplicateId = '6ac7a18981cec7fe2a1072ff';

  const result = selectCanonicalVersions({
    versions: [
      version(duplicateId, 1, 'Original Design', { design_state: { screen_size: 120, target_spl: 105 } }),
      version(canonicalId, 1, 'Original Design', {
        design_state: designState(16, 8, 4),
        published_fingerprint: 'fp-canonical',
      }),
    ],
    activeVersionId: canonicalId,
  });

  assert.equal(result.versions.length, 1);
  assert.equal(result.versions[0].id, canonicalId);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].id, duplicateId);
  assert.deepEqual(result.collisions, []);
  // The excluded record is still resolvable by its own id — nothing is lost.
  assert.equal(result.byId.get(duplicateId).id, duplicateId);
});

test('a genuine V1–V5 project keeps all five versions', () => {
  const versions = [1, 2, 3, 4, 5].map((slot) =>
    version(`v${slot}`, slot, `Version ${slot}`, { design_state: designState(1, 1, 1) }),
  );

  const result = selectCanonicalVersions({ versions, activeVersionId: 'v3' });

  assert.equal(result.versions.length, 5);
  assert.deepEqual(result.versions.map((v) => v.version_number), [1, 2, 3, 4, 5]);
  assert.deepEqual(result.duplicates, []);
  assert.deepEqual(result.collisions, []);
});

test('two same-slot independent designs are both kept and flagged', () => {
  const result = selectCanonicalVersions({
    versions: [
      version('a', 2, 'Cinema A', { design_state: designState(7, 6, 2) }),
      version('b', 2, 'Cinema B', { design_state: designState(9, 8, 4) }),
    ],
    activeVersionId: null,
  });

  assert.equal(result.versions.length, 2, 'neither record may be discarded');
  assert.deepEqual(result.versions.map((v) => v.id), ['a', 'b']);
  assert.deepEqual(result.duplicates, []);
  assert.equal(result.collisions.length, 1);
  assert.equal(result.collisions[0].reason, COLLISION_REASON.INDEPENDENT_DESIGN_DATA);
  assert.deepEqual(result.collisions[0].versionIds, ['a', 'b']);
});

test('recency and array order never break a tie', () => {
  const older = version('older', 1, 'Design', {
    design_state: designState(8, 6, 2),
    created_date: '2026-01-01T00:00:00.000000',
  });
  const newer = version('newer', 1, 'Design', {
    design_state: designState(8, 6, 2),
    created_date: '2026-10-01T00:00:00.000000',
  });

  const forward = selectCanonicalVersions({ versions: [older, newer] });
  const reversed = selectCanonicalVersions({ versions: [newer, older] });

  assert.equal(forward.versions.length, 2);
  assert.equal(reversed.versions.length, 2);
  assert.equal(forward.collisions.length, 1);
  assert.equal(reversed.collisions.length, 1);
});

test('verified evidence decides an unresolvable pointer, never the timestamp', () => {
  const empty = version('empty', 1, 'Original Design', {
    created_date: '2026-10-01T00:00:00.000000',
    design_state: { screen_size: 120 },
  });
  const real = version('real', 1, 'Original Design', {
    created_date: '2026-01-01T00:00:00.000000',
    design_state: designState(16, 8, 4),
  });

  const result = selectCanonicalVersions({ versions: [empty, real] });

  assert.equal(result.versions.length, 1);
  assert.equal(result.versions[0].id, 'real');
  assert.equal(result.duplicates[0].id, 'empty');
});

test('no reliable evidence at all is flagged, never guessed', () => {
  const result = selectCanonicalVersions({
    versions: [
      version('x', 1, 'Original Design', { design_state: { screen_size: 120 } }),
      version('y', 1, 'Original Design', { design_state: { screen_size: 120 } }),
    ],
  });

  assert.equal(result.versions.length, 2);
  assert.equal(result.collisions.length, 1);
  assert.equal(result.collisions[0].reason, COLLISION_REASON.NO_RELIABLE_EVIDENCE);
});

test('scalar defaults alone are not a design', () => {
  assert.equal(hasMeaningfulDesignState({ screen_size: 120, target_spl: 105, rsp_mode: 'auto_from_screen' }), false);
  assert.equal(hasMeaningfulDesignState({ seating_positions: '[]', selected_speakers: '[]' }), false);
  assert.equal(hasMeaningfulDesignState({ seating_positions: '[{"id":"a"}]' }), true);
  assert.equal(hasMeaningfulDesignState(designState(1, 0, 0)), true);
  assert.equal(hasMeaningfulDesignState(null), false);
});

test('deduplication is scoped to one project and one slot', () => {
  const result = selectCanonicalVersions({
    versions: [
      version('p1v1', 1, 'A', { project_id: 'P1', design_state: designState(1, 1, 1) }),
      version('p2v1', 1, 'B', { project_id: 'P2', design_state: designState(1, 1, 1) }),
    ],
    activeVersionIdByProject: new Map([['P1', 'p1v1'], ['P2', 'p2v1']]),
  });

  assert.equal(result.versions.length, 2);
  assert.deepEqual(result.collisions, []);
});