// shortlist-material-equivalence.test.mjs
// Unit tests for the material-equivalence predicate that deduplicates the ADI
// Starting Layout shortlist. Locks the contract: same quantity + model +
// P19/P20 Levels + worst-seat variation (within tolerance) + pairwise cabinet
// geometry (within tolerance) → equivalent. Any material difference → distinct.
//
// Run: node --import ./test/_alias-register.mjs --test test/shortlist-material-equivalence.test.mjs

import assert from 'node:assert/strict';
import { isMateriallyEquivalentLayout, GEOMETRY_TOLERANCE_M, VARIATION_TOLERANCE_DB } from '@/components/room/bass/bda/shortlistMaterialEquivalence';

const CONTEXT = { selectedSubModel: 'sub2-12' };

function makeResult({ quantity = 4, selectedProduct = 'sub2-12', coordinates = [], p19Level = 4, p20PrimaryLevel = 1, p20PrimaryVariation = 6.0, p20SecondaryLevel = 1, p20SecondaryVariation = 15.0 } = {}) {
  return {
    quantity,
    selectedProduct,
    coordinates,
    achievedP19Level: p19Level,
    rankingData: {
      primarySummary: {
        seats: [
          { seatId: 's1', p20Level: p20PrimaryLevel, p20VariationDb: p20PrimaryVariation },
          { seatId: 's2', p20Level: p20PrimaryLevel, p20VariationDb: p20PrimaryVariation },
        ],
      },
      secondarySummary: {
        seats: [
          { seatId: 's3', p20Level: p20SecondaryLevel, p20VariationDb: p20SecondaryVariation },
        ],
      },
    },
  };
}

// 1. Documented case: 86 mm apart, identical outcomes → equivalent.
{
  const a = makeResult({ coordinates: [{ x: 1.677, y: 0.1375 }, { x: 2.623, y: 0.1375 }, { x: 1.677, y: 6.8625 }, { x: 2.623, y: 6.8625 }] });
  const b = makeResult({ coordinates: [{ x: 1.763, y: 0.1375 }, { x: 2.537, y: 0.1375 }, { x: 1.763, y: 6.8625 }, { x: 2.537, y: 6.8625 }] });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), true, '86 mm-apart identical outcomes are equivalent');
  console.log('  ✔ 86 mm-apart identical outcomes equivalent');
}

// 2. Just inside geometry tolerance → equivalent.
{
  const a = makeResult({ coordinates: [{ x: 1.0, y: 0.1375 }, { x: 4.0, y: 0.1375 }, { x: 1.0, y: 6.8625 }, { x: 4.0, y: 6.8625 }] });
  const b = makeResult({ coordinates: [{ x: 1.0 + GEOMETRY_TOLERANCE_M, y: 0.1375 }, { x: 4.0, y: 0.1375 }, { x: 1.0, y: 6.8625 }, { x: 4.0, y: 6.8625 }] });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), true, 'within geometry tolerance equivalent');
  console.log('  ✔ Within geometry tolerance equivalent');
}

// 3. Just outside geometry tolerance → distinct.
{
  const a = makeResult({ coordinates: [{ x: 1.0, y: 0.1375 }, { x: 4.0, y: 0.1375 }, { x: 1.0, y: 6.8625 }, { x: 4.0, y: 6.8625 }] });
  const b = makeResult({ coordinates: [{ x: 1.0 + GEOMETRY_TOLERANCE_M + 0.01, y: 0.1375 }, { x: 4.0, y: 0.1375 }, { x: 1.0, y: 6.8625 }, { x: 4.0, y: 6.8625 }] });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), false, 'outside geometry tolerance distinct');
  console.log('  ✔ Outside geometry tolerance distinct');
}

// 4. Different quantity → distinct (even with identical Levels + near geometry).
{
  const a = makeResult({ quantity: 2, coordinates: [{ x: 1.677, y: 0.1375 }, { x: 2.623, y: 0.1375 }] });
  const b = makeResult({ quantity: 4, coordinates: [{ x: 1.677, y: 0.1375 }, { x: 2.623, y: 0.1375 }, { x: 1.677, y: 6.8625 }, { x: 2.623, y: 6.8625 }] });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), false, 'different quantities distinct');
  console.log('  ✔ Different quantities distinct');
}

// 5. Different model → distinct.
{
  const a = makeResult({ selectedProduct: 'sub2-12' });
  const b = makeResult({ selectedProduct: 'sub3-12' });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), false, 'different models distinct');
  console.log('  ✔ Different models distinct');
}

// 6. Different P19 Level → distinct.
{
  const a = makeResult({ p19Level: 4 });
  const b = makeResult({ p19Level: 3 });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), false, 'different P19 Level distinct');
  console.log('  ✔ Different P19 Level distinct');
}

// 7. Different Primary P20 Level → distinct.
{
  const a = makeResult({ p20PrimaryLevel: 1 });
  const b = makeResult({ p20PrimaryLevel: 2 });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), false, 'different Primary P20 Level distinct');
  console.log('  ✔ Different Primary P20 Level distinct');
}

// 8. Same Levels but materially different Primary variation → distinct.
{
  const a = makeResult({ p20PrimaryVariation: 6.0 });
  const b = makeResult({ p20PrimaryVariation: 6.0 + VARIATION_TOLERANCE_DB + 1.0 });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), false, 'materially different primary variation distinct');
  console.log('  ✔ Materially different primary variation distinct');
}

// 9. Same Levels, variation within tolerance → equivalent.
{
  const a = makeResult({ p20PrimaryVariation: 6.0 });
  const b = makeResult({ p20PrimaryVariation: 6.0 + VARIATION_TOLERANCE_DB });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), true, 'variation within tolerance equivalent');
  console.log('  ✔ Variation within tolerance equivalent');
}

// 10. Different Secondary variation → distinct.
{
  const a = makeResult({ p20SecondaryVariation: 15.0 });
  const b = makeResult({ p20SecondaryVariation: 15.0 + VARIATION_TOLERANCE_DB + 2.0 });
  assert.equal(isMateriallyEquivalentLayout(a, b, CONTEXT), false, 'materially different secondary variation distinct');
  console.log('  ✔ Materially different secondary variation distinct');
}

// 11. Null/missing inputs → not equivalent (defensive).
{
  assert.equal(isMateriallyEquivalentLayout(null, makeResult(), CONTEXT), false, 'null a distinct');
  assert.equal(isMateriallyEquivalentLayout(makeResult(), null, CONTEXT), false, 'null b distinct');
  console.log('  ✔ Null inputs not equivalent');
}

// 12. Different wall pattern (front/rear vs side) → geometry distinct.
{
  const frontRear = makeResult({ coordinates: [{ x: 1.677, y: 0.1375 }, { x: 2.623, y: 0.1375 }, { x: 1.677, y: 6.8625 }, { x: 2.623, y: 6.8625 }] });
  const sideWall = makeResult({ coordinates: [{ x: 0.1375, y: 1.75 }, { x: 4.8625, y: 1.75 }, { x: 0.1375, y: 5.25 }, { x: 4.8625, y: 5.25 }] });
  assert.equal(isMateriallyEquivalentLayout(frontRear, sideWall, CONTEXT), false, 'front/rear vs side-wall distinct');
  console.log('  ✔ Front/rear vs side-wall geometry distinct');
}

console.log('\nshortlist-material-equivalence: all checks passed');