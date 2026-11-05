import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveMissingSystemItems } from '../src/components/engineering/deriveMissingSystemItems.js';

const inst = (role, model = 'SP-2-8') => ({
  role, model, position: { x: 1, y: 1 },
});

function subs(n) {
  return Array.from({ length: n }, () => ({ id: 's', model: 'SUB', enabled: true }));
}

test('5.1.2 with only LCR → missing surrounds, overheads, sub', () => {
  const missing = deriveMissingSystemItems({
    placedSpeakers: [inst('FL'), inst('FC'), inst('FR')],
    subwooferInstances: [],
    dolbyLayout: '5.1.2',
  });
  assert.deepEqual(missing, ['surround speakers', 'overhead speaker models', 'subwoofer system']);
});

test('5.1.2 with LCR + surrounds but no overheads/sub → missing overheads + sub', () => {
  const missing = deriveMissingSystemItems({
    placedSpeakers: [inst('FL'), inst('FC'), inst('FR'), inst('SL'), inst('SR')],
    subwooferInstances: [],
    dolbyLayout: '5.1.2',
  });
  assert.deepEqual(missing, ['overhead speaker models', 'subwoofer system']);
});

test('complete 5.1.2 system → no missing items', () => {
  const missing = deriveMissingSystemItems({
    placedSpeakers: [inst('FL'), inst('FC'), inst('FR'), inst('SL'), inst('SR'), inst('TML'), inst('TMR')],
    subwooferInstances: subs(1),
    dolbyLayout: '5.1.2',
  });
  assert.deepEqual(missing, []);
});

test('5.1 (no heights) with LCR + surrounds + sub → no overheads required', () => {
  const missing = deriveMissingSystemItems({
    placedSpeakers: [inst('FL'), inst('FC'), inst('FR'), inst('SL'), inst('SR')],
    subwooferInstances: subs(1),
    dolbyLayout: '5.1',
  });
  assert.deepEqual(missing, []);
});

test('7.1.4 missing surrounds → only surrounds missing when LCR + sub present', () => {
  const missing = deriveMissingSystemItems({
    placedSpeakers: [inst('FL'), inst('FC'), inst('FR'), inst('TFL'), inst('TFR'), inst('TRL'), inst('TRR')],
    subwooferInstances: subs(1),
    dolbyLayout: '7.1.4',
  });
  assert.deepEqual(missing, ['surround speakers']);
});

test('no LCR → front speakers missing', () => {
  const missing = deriveMissingSystemItems({
    placedSpeakers: [inst('SL'), inst('SR')],
    subwooferInstances: subs(1),
    dolbyLayout: '5.1',
  });
  assert.deepEqual(missing, ['front left, centre and right speakers']);
});