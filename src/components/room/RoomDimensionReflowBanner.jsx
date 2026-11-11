import React from "react";
import { AlertTriangle } from "lucide-react";
import { useAppState } from "@/components/AppStateProvider";

/**
 * Non-blocking informational banner shown when room dimensions change after a
 * completed engineering assessment has been published for this version.
 *
 * The previous RP22 and bass results are stale and need recalculation.
 * Geometry is NOT rebuilt automatically: manually positioned seats, speakers,
 * subwoofers, projectors and room elements are preserved. The banner clears
 * once a fresh complete assessment is published for the current design
 * (RoomDesigner clears the flag via clearLayoutRefreshPending).
 *
 * The flag is only set when a completed assessment existed before the
 * dimension change, so this banner never appears during initial design entry.
 *
 * Reads `layoutRefreshPending` from app state.
 */
export default function RoomDimensionReflowBanner() {
  const { layoutRefreshPending } = useAppState();
  if (!layoutRefreshPending) return null;

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
        border: "1px solid #F59E0B",
        background: "#FFFBEB",
        color: "#92400E",
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <AlertTriangle
        className="w-4 h-4 mt-0.5 shrink-0"
        style={{ color: "#D97706" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          Room dimensions changed
        </div>
        <div style={{ color: "#78350F" }}>
          Previous performance results are no longer current and need recalculation.
        </div>
      </div>
    </div>
  );
}