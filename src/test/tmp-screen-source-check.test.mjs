import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildRoomAuthority } from '../components/proposal/engineeringAuthority/buildRoomAuthority.js';

// The Genesis AV / Original Design screen facts, as the version's design_state
// records them: a manual 115" television whose stored screen_size is its 100"
// viewable width.
const GENESIS_PROJECT = {
  roomDims: JSON.stringify({ widthM: 4.64, lengthM: 5.09, heightM: 2.6 }),
  screen_size: 100.23118676932316,
  aspect_ratio: '16:9',
  manual_dimensions: true,
  manual_width_m: 2.55,
  manual_height_m: 1.43,
  display_type: 'tv',
  screen_manual_config: { enabled: true, displayType: 'tv', mode: 'diagonal', widthM: 2.55, heightM: 1.43, diagonalInches: 115, aspect: '16:9' },
  screen_height_from_floor: 0.7,
  screen_wall: 'front',
  screen_mount_mode: 'baffle',
};

test('a manually sized television is described by its nominal diagonal', () => {
  const room = buildRoomAuthority(GENESIS_PROJECT, null);
  assert.equal(room.screen.display_type, 'tv');
  assert.equal(room.screen.diagonal_inches, 115);
  assert.match(room.screen.interpretation, /^115" TV/);
  assert.ok(!room.screen.interpretation.includes('100"'), room.screen.interpretation);
  assert.ok(room.screen.interpretation.includes('manual dimensions on front wall'));
  // The geometry the sentence carries is untouched.
  assert.equal(room.screen.manual_width_m, 2.55);
  assert.equal(room.screen.manual_height_m, 1.43);
  assert.equal(room.screen.size_inches, 100); // the viewable-width authority, unchanged
  assert.equal(room.dimensions_text, '5.1m × 4.6m × 2.6m (L × W × H)');
});

test('a projection screen keeps its existing description', () => {
  const room = buildRoomAuthority({
    roomDims: JSON.stringify({ widthM: 4.0, lengthM: 6.0, heightM: 2.6 }),
    screen_size: 170,
    aspect_ratio: '16:9',
    manual_dimensions: false,
    display_type: 'projector_screen',
    screen_height_from_floor: 0.6,
    screen_wall: 'front',
    screen_mount_mode: 'baffle',
  }, null);
  assert.match(room.screen.interpretation, /^170" 16:9 screen on front wall/);
});