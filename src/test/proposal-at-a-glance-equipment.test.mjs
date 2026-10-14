/**
 * THE AT A GLANCE ACCEPTANCE — proved on the Marquee Home / Original Design facts.
 *
 * The page states the display the design carries and the package the design was
 * saved with, read from the frozen snapshot's own values:
 *
 *   Display             100" TV
 *   Front Left          EVOLVE 3-1
 *   Front Right         EVOLVE 3-1
 *   Centre              C4-1
 *   Surrounds / wides   EVOLVE 2-1
 *   Subwoofers          2 × SUB2-12
 *
 * and never `88" 16:9 projection screen`, and never `LCR | EVOLVE 3-1`.
 */

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { buildPackageRows, screenStatement } from '../components/proposal/print/proposalPackAuthority.js';
import {
  frontStageProductRoles,
  resolveFrontStage,
} from '../components/proposal/engineeringAuthority/resolveFrontStageRoles.js';

// The version's placed speakers, verbatim: EVOLVE 3-1 left/right, C4-1 centre.
const MARQUEE_STAGE = [
  { role: 'FL', model: 'evolve-3-1' },
  { role: 'FC', model: 'c4-1' },
  { role: 'FR', model: 'evolve-3-1' },
];

test('the display card states a television by its nominal diagonal', () => {
  assert.equal(
    screenStatement({
      display_type: 'tv',
      television: true,
      diagonal_inches: 100,
      size_inches: 100,
      viewable_width_inches: 88,
      aspect_ratio: '16:9',
    }).value,
    '100" TV',
  );
});

test('a television is never stated as a projection screen of its viewable width', () => {
  const tv = screenStatement({
    display_type: 'tv',
    diagonal_inches: 100,
    size_inches: 100,
    viewable_width_inches: 88,
    aspect_ratio: '16:9',
  });
  assert.doesNotMatch(String(tv.value), /projection screen/);
  assert.doesNotMatch(String(tv.value), /88/);
});

test('a projection screen keeps the projection rule', () => {
  assert.equal(
    screenStatement({
      display_type: 'projector_screen',
      viewable_width_inches: 170,
      aspect_ratio: '2.35:1',
    }).value,
    '170" 2.35:1 projection screen',
  );
});

test('the package states the centre channel in its own row', () => {
  const rows = buildPackageRows({
    system: {
      product_roles: [
        ...frontStageProductRoles(resolveFrontStage(MARQUEE_STAGE)),
        {
          role: 'surround',
          role_description: 'Side surround',
          model_key: 'evolve-2-1',
          model_label: 'EVOLVE 2-1',
        },
      ],
      subwoofer_strategy: { count: 2, models: ['sub2-12'] },
    },
  });

  assert.deepEqual(rows, [
    { role: 'Front Left', model: 'EVOLVE 3-1' },
    { role: 'Front Right', model: 'EVOLVE 3-1' },
    { role: 'Centre', model: 'C4-1' },
    { role: 'Surrounds / wides', model: 'EVOLVE 2-1' },
    { role: 'Subwoofers', model: '2 × SUB2-12' },
  ]);
  // The mixed front stage is never collapsed into one LCR row.
  assert.equal(rows.some((row) => row.role === 'LCR'), false);
});

test('a genuinely identical LCR stage is still one row', () => {
  const rows = buildPackageRows({
    system: {
      product_roles: [
        {
          role: 'lcr',
          role_description: 'Left/Centre/Right (screen wall)',
          model_key: 'q6-3',
          model_label: 'Q6-3',
        },
      ],
    },
  });
  assert.deepEqual(rows, [{ role: 'LCR', model: 'Q6-3' }]);
});