// Reproduces the exact seat-building logic from useSeatingRebuild for a
// 3 -> 4 seat-count change on a loaded single-row project, to prove the
// rebuild logic itself produces 4 seats (narrowing any "first change fails"
// bug to effect timing / an overwrite, not the build logic).

import assert from 'node:assert';

// Mirror of getRowZ from useSeatingRebuild (1.2 + rowIndex * 0.3)
const getRowZ = (rowIndex, rowEarHeights = []) => {
  const h = rowEarHeights?.[rowIndex];
  if (Number.isFinite(h) && h > 0) return h;
  return 1.2 + rowIndex * 0.3;
};

const resolveSeatPriority = (s) => (s && s.isSecondary ? 'secondary' : 'primary');

// Mirror of the seatsEqualWithin1mm guard
const seatsEqualWithin1mm = (prev = [], next = []) => {
  if (!Array.isArray(prev) || !Array.isArray(next)) return false;
  if (prev.length !== next.length) return false;
  return next.every((b, i) => String(b?.id) === String(prev[i]?.id));
};

// The seat-building block from useSeatingRebuild (regenerateAll path).
function buildSeats({ list, centers, roomWidth, seatSpacing, currentSeats, regenerateAll, rowEarHeights }) {
  const centerX = roomWidth / 2;
  const spacingX = Number(seatSpacing) || 0.6;
  const prevSeatById = new Map((currentSeats || []).map((s) => [s.id, s]));
  const seats = [];
  list.forEach((rawCount, rowIndex) => {
    const count = Math.max(1, Number(rawCount) || 1);
    const y = Number(centers[rowIndex]);
    const totalWidth = (count - 1) * spacingX;
    const startX = centerX - totalWidth / 2;
    for (let i = 0; i < count; i++) {
      const seatId = `seat-r${rowIndex + 1}-c${i + 1}`;
      const prev = prevSeatById.get(seatId);
      const isUserPlaced = !regenerateAll && prev?.positionSource === 'user';
      const defaultPlatformH = rowIndex === 0 ? 0 : Math.max(0, getRowZ(rowIndex, rowEarHeights) - getRowZ(0, rowEarHeights));
      seats.push({
        id: seatId,
        x: isUserPlaced ? Number(prev.x) : startX + i * spacingX,
        y: isUserPlaced ? Number(prev.y) : y,
        z: getRowZ(rowIndex, rowEarHeights),
        rowNumber: rowIndex + 1,
        positionSource: regenerateAll ? 'auto' : (prev?.positionSource || 'auto'),
        isPrimary: prev?.isPrimary || false,
        isSecondary: prev?.isSecondary || false,
        platformHeightM: Number.isFinite(prev?.platformHeightM) ? prev.platformHeightM : defaultPlatformH,
        priority: resolveSeatPriority(prev),
      });
    }
  });
  return seats;
}

// Loaded 3-seat project (single row, centered, center seat primary)
const loaded3 = [
  { id: 'seat-r1-c1', x: 1.65, y: 3.5, z: 1.2, rowNumber: 1, isPrimary: false, positionSource: 'auto' },
  { id: 'seat-r1-c2', x: 2.25, y: 3.5, z: 1.2, rowNumber: 1, isPrimary: true,  positionSource: 'auto' },
  { id: 'seat-r1-c3', x: 2.85, y: 3.5, z: 1.2, rowNumber: 1, isPrimary: false, positionSource: 'auto' },
];

const roomWidth = 4.5;
const seatSpacing = 0.6;
const centers = [3.5]; // single row center
const rowEarHeights = [1.2];

// 3 -> 4 change (regenerateAll = true, userHasChangedSeatingSinceLoad)
const seats4 = buildSeats({
  list: [4], centers, roomWidth, seatSpacing,
  currentSeats: loaded3, regenerateAll: true, rowEarHeights,
});

assert.equal(seats4.length, 4, '4 seats should be built for a 3->4 change');
assert.equal(seats4[0].id, 'seat-r1-c1');
assert.equal(seats4[1].id, 'seat-r1-c2');
assert.equal(seats4[2].id, 'seat-r1-c3');
assert.equal(seats4[3].id, 'seat-r1-c4');
// Centered: startX = 2.25 - 0.9 = 1.35
assert.ok(Math.abs(seats4[0].x - 1.35) < 1e-9, 'seat 1 recentered');
assert.ok(Math.abs(seats4[3].x - 3.15) < 1e-9, 'seat 4 at new right edge');
// Primary preserved on seat-r1-c2
assert.equal(seats4[1].isPrimary, true);
assert.equal(seats4[3].isPrimary, false);
// setSeats guard: 3 != 4 so it WOULD write
assert.equal(seatsEqualWithin1mm(loaded3, seats4), false, 'setSeats must write (length differs)');

// 4 -> 3 change (going back)
const seats3 = buildSeats({
  list: [3], centers, roomWidth, seatSpacing,
  currentSeats: seats4, regenerateAll: true, rowEarHeights,
});
assert.equal(seats3.length, 3, '3 seats should be built for a 4->3 change');
assert.equal(seatsEqualWithin1mm(seats4, seats3), false, 'setSeats must write (length differs)');

// Repeated changes stay stable
const seats4b = buildSeats({
  list: [4], centers, roomWidth, seatSpacing,
  currentSeats: seats3, regenerateAll: true, rowEarHeights,
});
assert.equal(seats4b.length, 4);
assert.equal(seatsEqualWithin1mm(seats4, seats4b), true, '4-seat layout is stable across repeated changes');

console.log('seat-count-first-change: all assertions passed (3->4, 4->3, repeated)');