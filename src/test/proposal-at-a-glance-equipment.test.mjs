/**
 * THE AT A GLANCE ACCEPTANCE — proved on the Marquee Home / Original Design facts.
 *
 * The page states the display the design carries and the package the design was
 * saved with, read from the frozen snapshot's own values:
 *
 *   Display             100" TV
 *   Front left          EVOLVE 3-1          1
 *   Front right         EVOLVE 3-1          1
 *   Centre              C4-1                1
 *   Side surrounds      EVOLVE 2-1          2
 *   Rear subwoofers     SUB2-12             2
 *
 * Every row states Position | Model | Qty, as the version's own equipment
 * checklist does, and never `88" 16:9 projection screen`, and never
 * `LCR | EVOLVE 3-1`.
 */

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { buildPackageRows, screenStatement, unresolvedPackageQuantities } from '../components/proposal/print/proposalPackAuthority.js';
import { unresolvedQuantities } from '../components/proposal/print/equipmentQuantityAuthority.js';
import { productDisplayName } from '../components/report/reportProductsSelected.js';
import {
  frontStageProductRoles,
  resolveFrontStage,
} from '../components/proposal/engineeringAuthority/resolveFrontStageRoles.js';

/** The name the app states a model by, without ever guessing it in this test. */
const displayName = (model) => productDisplayName(model) || model;

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

test('the package states the centre channel in its own row, with its own Qty', () => {
  const rows = buildPackageRows({
    system: {
      product_roles: [
        ...frontStageProductRoles(resolveFrontStage(MARQUEE_STAGE)),
        {
          role: 'surround',
          role_description: 'Side surround',
          model_key: 'evolve-2-1',
          model_label: 'EVOLVE 2-1',
          quantity: 2,
        },
      ],
      // The version's own rear subwoofers, as Marquee Home holds them.
      subwoofer_strategy: {
        count: 2,
        models: ['sub2-12'],
        instances: [
          { model: 'sub2-12', group: 'rear' },
          { model: 'sub2-12', group: 'rear' },
        ],
      },
    },
  });

  assert.deepEqual(rows, [
    { role: 'Front left', model: 'EVOLVE 3-1', qty: 1 },
    { role: 'Front right', model: 'EVOLVE 3-1', qty: 1 },
    { role: 'Centre', model: 'C4-1', qty: 1 },
    { role: 'Side surrounds', model: 'EVOLVE 2-1', qty: 2 },
    { role: 'Rear subwoofers', model: displayName('sub2-12'), qty: 2 },
  ]);
  // The mixed front stage is never collapsed into one LCR row.
  assert.equal(rows.some((row) => row.role === 'LCR'), false);
  // The count is the Qty column's job: no model cell repeats it.
  rows.forEach((row) => assert.doesNotMatch(row.model, /×/));
  // EQUIPMENT QUANTITY IS AN INVARIANT: every row states a positive whole number of
  // loudspeakers, and the package has no unresolved quantity to report.
  rows.forEach((row) => assert.equal(Number.isInteger(row.qty) && row.qty >= 1, true, `${row.role} qty ${row.qty}`));
  assert.deepEqual(unresolvedQuantities(rows), []);
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
  assert.deepEqual(rows, [{ role: 'LCR', model: 'Q6-3', qty: null }]);
  // The row's own shape is unchanged — the blank cell stays the renderer's last-resort
  // safeguard — but a missing count is an EQUIPMENT-AUTHORITY FAILURE, and it is named
  // as one so the document is never issued with it.
  assert.deepEqual(unresolvedQuantities(rows), [{ role: 'LCR', model: 'Q6-3' }]);
  assert.deepEqual(unresolvedPackageQuantities({ system: { product_roles: [{ role: 'lcr', model_key: 'q6-3', model_label: 'Q6-3' }] } }),
    [{ role: 'LCR', model: 'Q6-3' }]);
});