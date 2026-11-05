import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildSeatingApplyPositions, buildSeatingUndoPositions, buildSeatingRspUpdate,
} from '../components/room/bass/optimiserPlan/optimiserPlanLeverApply.js';

const seats = [1.72, 2.32, 2.92, 3.52].map((x, i) => ({
  id: 'seat-r1-c' + (i + 1), x, y: 2.71, z: 1.2,
  priority: i === 1 || i === 2 ? 'primary' : 'secondary',
}));
const lever = { key: 'seating', changes: seats.map(s => ({
  seatId: s.id, fromY: s.y, toY: 2.21,
})) };
const reference = (before, after, y = 2.71, rspMode = 'manual_position') =>
  buildSeatingRspUpdate({seatingPositions: before, nextSeatingPositions: after, manualRspY_m: y, rspMode});

test('evaluated whole-block apply preserves seat identity, spacing, priority and manual RSP relationship', () => {
  const result = buildSeatingApplyPositions({ lever, seatingPositions: seats });
  assert.equal(result.ok, true);
  assert.deepEqual(result.affectedSeatIds, seats.map(s => s.id));
  result.seatingPositions.forEach((s, i) => assert.deepEqual(s, { ...seats[i], y: 2.21 }));
  assert.deepEqual(reference(seats, result.seatingPositions), { ok: true, manualRspY_m: 2.21 });
  assert.equal(seats[0].y, 2.71);
});

test('undo restores seats and manual RSP and repeating apply does not move RSP twice', () => {
  const moved = buildSeatingApplyPositions({ lever, seatingPositions: seats }).seatingPositions;
  const repeated = buildSeatingApplyPositions({ lever, seatingPositions: moved }).seatingPositions;
  assert.deepEqual(reference(moved, repeated, 2.21), { ok: true, manualRspY_m: 2.21 });
  const restored = buildSeatingUndoPositions({ lever, seatingPositions: moved }).seatingPositions;
  assert.deepEqual(restored, seats);
  assert.deepEqual(reference(moved, restored, 2.21), { ok: true, manualRspY_m: 2.71 });
});

test('seat order is immaterial but missing IDs and partial movements cannot invent a manual RSP destination', () => {
  const moved = buildSeatingApplyPositions({ lever, seatingPositions: seats }).seatingPositions;
  assert.deepEqual(reference(seats, [...moved].reverse()), { ok: true, manualRspY_m: 2.21 });
  assert.equal(reference(seats, moved.slice(1)).ok, false);
  assert.equal(reference(seats, moved.map((s,i) => i ? s : {...s,id:'unknown'})).ok, false);
  assert.equal(reference(seats, moved.map((s,i) => i ? s : seats[0])).ok, false);
  assert.equal(reference(seats, moved, null).ok, false);
});

test('automatic and seat-linked RSP retain their existing authority', () => {
  assert.deepEqual(reference(seats, seats, null, 'designated_seat'), { ok: true, manualRspY_m: null });
  assert.deepEqual(reference(seats, seats, null, 'auto'), { ok: true, manualRspY_m: null });
});
