import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useAppState } from "@/components/AppStateProvider";

/**
 * Non-blocking warning banner shown when room dimensions have changed on a
 * loaded project and dependent geometry needs reflow. Renders a single
 * "Refresh Layout" action — there is no "Keep Current Positions" option.
 *
 * Reads `layoutRefreshPending` and `reflowLayout` from app state.
 */
export default function RoomDimensionReflowBanner() {
  const { layoutRefreshPending, reflowLayout } = useAppState();
  const [isReflowing, setIsReflowing] = React.useState(false);

  // Reset the reflowing flag when the pending flag clears
  React.useEffect(() => {
    if (!layoutRefreshPending) setIsReflowing(false);
  }, [layoutRefreshPending]);

  if (!layoutRefreshPending) return null;

  const handleRefresh = () => {
    setIsReflowing(true);
    try {
      reflowLayout();
    } catch (e) {
      setIsReflowing(false);
    }
  };

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
          Room dimensions have changed
        </div>
        <div style={{ color: "#78350F" }}>
          Refresh layout positions for the updated room. Bass and RP22 results
          will require recalculation after refresh.
        </div>
      </div>
      <button
        onClick={handleRefresh}
        disabled={isReflowing}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #213428",
          background: "#213428",
          color: "#FFFFFF",
          fontSize: 12,
          fontWeight: 600,
          cursor: isReflowing ? "wait" : "pointer",
          opacity: isReflowing ? 0.7 : 1,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <RefreshCw
          className="w-3.5 h-3.5"
          style={{ animation: isReflowing ? "spin 0.8s linear infinite" : undefined }}
        />
        {isReflowing ? "Refreshing…" : "Refresh Layout"}
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}