/**
 * snapshotSeats.js
 * --------------------------------
 * Reads the exact version seat snapshot: identity, row/order, position,
 * and canonical priority. Priority source is resolveSeatPriority() — RSP
 * never implies Primary.
 *
 * Pure function. No React. No side effects.
 */

import { resolveSeatPriority } from '@/components/utils/seatPriorityAuthority';

const REFERENCE_IDS = new Set(['rsp', 'mlp', 'synthetic-rsp', 'synthetic_rsp']);

function isReferenceSeat(seat) {
  const id = String(seat?.id || '').trim().toLowerCase();
  return REFERENCE_IDS.has(id) || seat?.__isSyntheticRsp || seat?.isSyntheticRsp;
}

/**
 * @param {Array} seats — canonical seating positions (appState.seatingPositions)
 * @returns {Array<{ id, row, column, position, priority, is_reference }>}
 */
export function buildSnapshotSeats(seats) {
  const list = Array.isArray(seats) ? seats : [];
  return list
    .filter((s) => s && s.id)
    .map((seat) => {
      const row = Number(seat.row ?? seat.rowNumber);
      const column = Number(seat.column ?? seat.col ?? seat.indexInRow ?? seat.seatNumber);
      const x = Number(seat.x ?? seat.position?.x);
      const y = Number(seat.y ?? seat.position?.y);
      const z = Number(seat.z ?? seat.position?.z ?? seat.earHeightM ?? seat.ear_h);
      return {
        id: seat.id,
        label: seat.label || seat.id,
        row: Number.isFinite(row) ? row : null,
        column: Number.isFinite(column) ? column : null,
        position: {
          x: Number.isFinite(x) ? x : null,
          y: Number.isFinite(y) ? y : null,
          z: Number.isFinite(z) ? z : null,
        },
        priority: resolveSeatPriority(seat),
        is_reference: isReferenceSeat(seat),
      };
    });
}