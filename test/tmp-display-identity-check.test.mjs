import { test } from 'vitest';
import assert from 'node:assert/strict';
import { canonicalScreenDescription } from '../base44/shared/canonicalScreenDescription.js';

// Genesis AV / Original Design: the frozen evidence states display_type 'tv'
// with a 115" diagonal, and the stored sentence it carries was written from the
// viewable width (100").
const GENESIS_STORED = '100" 16:9, manual dimensions TV on front wall, baffle wall construction, screen bottom at 0.70m from floor.';
const genesis = {
  display_type: 'tv',
  diagonal_inches: 115,
  interpretation: GENESIS_STORED,
};

test('a television description is resolved to its canonical diagonal', () => {
  const resolved = canonicalScreenDescription(genesis);
  assert.match(resolved, /^115" TV/);
  assert.ok(!resolved.includes('100"'), `no obsolete size may survive: ${resolved}`);
  assert.ok(resolved.includes('manual dimensions on front wall'));
  assert.ok(resolved.includes('baffle wall construction'));
  assert.ok(resolved.includes('screen bottom at 0.70m from floor'));
});

test('resolution is idempotent and leaves a projection screen alone', () => {
  const once = canonicalScreenDescription(genesis);
  assert.equal(canonicalScreenDescription({ ...genesis, interpretation: once }), once);
  const projector = { display_type: 'projector_screen', diagonal_inches: 115, interpretation: '100" 16:9 screen on front wall.' };
  assert.equal(canonicalScreenDescription(projector), projector.interpretation);
});

test('a sentence that states no size is never rewritten', () => {
  const sentence = 'Screen not configured.';
  assert.equal(canonicalScreenDescription({ display_type: 'tv', diagonal_inches: 115, interpretation: sentence }), sentence);
});