import React from "react";
import CrossoverControls from "@/components/room/CrossoverControls";
import { useProjectCrossover } from "@/components/room/useProjectCrossover";

/**
 * Crossover & Integration (Bass Response).
 *
 * Shows the speaker high-pass and the subwoofer low-pass together, stacked.
 * Both are read from, and written straight back to, the one project crossover
 * authority (useProjectCrossover), so a change here is already in place in the
 * LCR and Subwoofers panels — and a change made there is already in place here.
 *
 * It reads the authority directly rather than accepting values as props, so the
 * permitted range is always the one derived from the selected LCR models: the
 * same range the LCR panel enforces. Nothing here depends on a bass calculation
 * having run, and a missing provisional result never hides or disables editing.
 */
export default function CrossoverIntegrationPanel() {
  const { crossover, limits, setCrossover } = useProjectCrossover();
  const linked = crossover.linkFrequencies !== false;

  return (
    <div style={{ border: "1px solid #DCDBD6", borderRadius: 12, background: "#FFFFFF", padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1B1A1A", fontFamily: "Didact Gothic, sans-serif" }}>
        Crossover &amp; Integration
      </div>

      <div style={{ marginTop: 14 }}>
        <CrossoverControls
          variant="both"
          stack
          crossover={crossover}
          limits={limits}
          onChange={setCrossover}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#3E4349", cursor: "pointer", marginTop: 12 }}>
          <input
            type="checkbox"
            checked={!linked}
            onChange={(event) => setCrossover({ linkFrequencies: !event.target.checked })}
          />
          Independent subwoofer frequency
        </label>
      </div>
    </div>
  );
}