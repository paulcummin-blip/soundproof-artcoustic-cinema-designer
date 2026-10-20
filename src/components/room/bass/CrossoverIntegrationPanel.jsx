import React from "react";
import CrossoverControls from "@/components/room/CrossoverControls";

/**
 * Crossover & Integration (Bass Response).
 *
 * Shows the speaker high-pass and the subwoofer low-pass together. Both are read
 * from, and written straight back to, the one project crossover authority, so a
 * change here is already in place in the LCR and Subwoofers panels — and a
 * change made there is already in place here.
 */
export default function CrossoverIntegrationPanel({
  crossover,
  limits,
  onChange,
  disabled = false,
}) {
  if (!crossover || !limits) return null;

  const linked = crossover.linkFrequencies !== false;
  const subwooferHz = Math.round(
    linked ? Number(crossover.frequencyHz) : Number(crossover.subwooferFrequencyHz),
  );

  return (
    <div style={{ border: "1px solid #DCDBD6", borderRadius: 12, background: "#FFFFFF", padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1B1A1A", fontFamily: "Didact Gothic, sans-serif" }}>
          Crossover &amp; Integration
        </div>
        <div style={{ fontSize: 13, color: "#213428", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>Speakers: </span>
          {Math.round(crossover.frequencyHz)} Hz · {crossover.speakerHpSlopeDbPerOct} dB/oct
          <span style={{ margin: "0 10px", color: "#DCDBD6" }}>|</span>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>Subwoofers: </span>
          {subwooferHz} Hz · {crossover.subwooferLpSlopeDbPerOct} dB/oct
        </div>
      </div>

      {disabled ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#625143" }}>
          Select the front left, centre and right speakers to set the crossover.
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <CrossoverControls
            variant="both"
            crossover={crossover}
            limits={limits}
            onChange={onChange}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#3E4349", cursor: "pointer", marginTop: 12 }}>
            <input
              type="checkbox"
              checked={!linked}
              onChange={(event) => onChange?.({ linkFrequencies: !event.target.checked })}
            />
            Independent subwoofer frequency
          </label>
        </div>
      )}
    </div>
  );
}