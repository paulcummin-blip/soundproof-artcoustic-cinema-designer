/**
 * TechnicalSeatGrid.jsx
 * ----------------------
 * The Technical Report print variant's seat-scoped block.
 *
 * It renders the shared seat-layout result map, so the printed report and the
 * on-screen report present seat results in the same physical row shape — one
 * implementation, one layout, no linear "Row 1 - Seat 3" tables.
 *
 * Props:
 *   data — [{ row, seats: [{ id, level, value, isPrimary, priority }] }]
 */

import React from "react";
import SeatResultMap from "../SeatResultMap";

export default function TechnicalSeatGrid({ data }) {
  if (!data || !data.length) return null;
  return <SeatResultMap rows={data} print />;
}