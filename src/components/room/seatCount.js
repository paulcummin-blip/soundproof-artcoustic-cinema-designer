export function normaliseSeatCount(rawCount) {
  const parsed = Number.parseInt(rawCount, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

export function stepSeatCount(currentCount, direction) {
  const delta = direction < 0 ? -1 : direction > 0 ? 1 : 0;
  return Math.max(1, normaliseSeatCount(currentCount) + delta);
}
