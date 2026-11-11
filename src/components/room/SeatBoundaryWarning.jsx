import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAppState } from "@/components/AppStateProvider";

/**
 * SeatBoundaryWarning
 * Non-blocking warning shown when a room resize leaves manually positioned
 * (or any) seating outside the new room bounds.
 *
 * Detection is non-destructive: no seat coordinates are modified. The warning
 * names the affected rows so the designer can reposition them or regenerate
 * seating explicitly. It only raises after a genuine room-dimension change
 * (not on initial load) and clears once every seat is back inside the room.
 *
 * Self-contained: reads seating positions and room dimensions from app state.
 */
const INSET_M = 0.30;

export default function SeatBoundaryWarning() {
  const { seatingPositions, roomDims } = useAppState();
  const prevDimsRef = useRef(null);
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    const W = Number(roomDims?.widthM);
    const L = Number(roomDims?.lengthM);
    if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) return;

    const prev = prevDimsRef.current;
    const dimsChanged = !!prev && (
      Math.abs(prev.width - W) > 0.001 || Math.abs(prev.length - L) > 0.001
    );
    prevDimsRef.current = { width: W, length: L };

    const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
    const offending = seats.filter((s) => {
      if (!s) return false;
      const x = Number(s.x);
      const y = Number(s.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      return x < INSET_M || x > W - INSET_M || y < INSET_M || y > L - INSET_M;
    });

    if (offending.length === 0) {
      setWarning(null);
      return;
    }
    // Only raise after a genuine resize; never on first load or seat-only edits.
    if (!dimsChanged) return;

    const labels = offending
      .map((s) => `Row ${s.rowNumber || 1}`)
      .join(", ");
    setWarning({ count: offending.length, labels });
  }, [roomDims?.widthM, roomDims?.lengthM, seatingPositions]);

  if (!warning) return null;

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        marginBottom: 8,
        borderRadius: 8,
        border: "1px solid #DC2626",
        background: "#FEF2F2",
        color: "#991B1B",
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <AlertTriangle
        className="w-4 h-4 mt-0.5 shrink-0"
        style={{ color: "#DC2626" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          Seating outside room bounds
        </div>
        <div style={{ color: "#7F1D1D" }}>
          {warning.count} seat{warning.count === 1 ? "" : "s"} ({warning.labels}) now sit
          outside the resized room. Reposition them manually or regenerate seating.
        </div>
      </div>
    </div>
  );
}