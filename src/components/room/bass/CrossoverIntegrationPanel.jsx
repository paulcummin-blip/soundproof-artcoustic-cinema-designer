import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CROSSOVER_SLOPES_DB_PER_OCT } from "@/components/room/bass/crossoverAuthority";

/**
 * Crossover & Integration.
 *
 * The designer sees the current crossover settings in one line and can change
 * them without leaving Bass Response. The permitted range comes from the
 * selected speaker models: a frequency below a speaker's minimum is never
 * presented and never accepted.
 */
export default function CrossoverIntegrationPanel({
  crossover,
  limits,
  lcrModelCount = 0,
  onChange,
  combinedSystem = null,
  disabled = false,
}) {
  if (!crossover || !limits) return null;
  const speakerHz = crossover.frequencyHz;
  const subwooferHz = crossover.linkFrequencies === false ? crossover.subwooferFrequencyHz : crossover.frequencyHz;
  const linked = crossover.linkFrequencies !== false;
  const rangeLabel = `Permitted ${Math.round(limits.minHz)}–${Math.round(limits.maxHz)} Hz`;

  const commit = (patch) => {
    if (typeof onChange === "function") onChange(patch);
  };
  const commitFrequency = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    commit({ frequencyHz: parsed });
  };

  const inputStyle = {
    width: 76,
    border: "1px solid #DCDBD6",
    borderRadius: 6,
    background: "#FFFFFF",
    padding: "5px 8px",
    fontSize: 12,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    color: "#1B1A1A",
  };
  const selectStyle = { ...inputStyle, width: 96, textAlign: "left" };

  return (
    <div
      style={{
        border: "1px solid #DCDBD6",
        borderRadius: 12,
        background: "#FFFFFF",
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1B1A1A", fontFamily: "Didact Gothic, sans-serif" }}>
          Crossover &amp; Integration
        </div>
        <div style={{ fontSize: 13, color: "#213428", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>Speakers: </span>
          {Math.round(speakerHz)} Hz · {crossover.speakerHpSlopeDbPerOct} dB/octave
          <span style={{ margin: "0 10px", color: "#DCDBD6" }}>|</span>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>Subwoofers: </span>
          {Math.round(subwooferHz)} Hz · {crossover.subwooferLpSlopeDbPerOct} dB/octave
        </div>
      </div>

      {disabled ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#625143" }}>
          Select the front left, centre and right speakers to set the crossover.
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          <div>
            <Label className="text-xs text-[#3E4349]">{linked ? "Crossover frequency" : "Speaker high-pass frequency"}</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <input
                type="number"
                min={limits.minHz}
                max={limits.maxHz}
                step="1"
                value={Math.round(speakerHz)}
                onChange={(event) => commitFrequency(event.target.value)}
                autoComplete="off"
                inputMode="numeric"
                style={inputStyle}
              />
              <span style={{ fontSize: 11, color: "#625143" }}>Hz</span>
            </div>
            <div style={{ fontSize: 11, color: "#625143", marginTop: 4 }}>{rangeLabel}</div>
          </div>

          <div>
            <Label className="text-xs text-[#3E4349]">Speaker high-pass</Label>
            <div style={{ marginTop: 6 }}>
              <select
                value={crossover.speakerHpSlopeDbPerOct}
                onChange={(event) => commit({ speakerHpSlopeDbPerOct: Number(event.target.value) })}
                style={selectStyle}
              >
                {CROSSOVER_SLOPES_DB_PER_OCT.map((slope) => (
                  <option key={slope} value={slope}>{slope} dB/octave</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-[#3E4349]">Subwoofer low-pass</Label>
            <div style={{ marginTop: 6 }}>
              <select
                value={crossover.subwooferLpSlopeDbPerOct}
                onChange={(event) => commit({ subwooferLpSlopeDbPerOct: Number(event.target.value) })}
                style={selectStyle}
              >
                {CROSSOVER_SLOPES_DB_PER_OCT.map((slope) => (
                  <option key={slope} value={slope}>{slope} dB/octave</option>
                ))}
              </select>
            </div>
          </div>

          {!linked && (
            <div>
              <Label className="text-xs text-[#3E4349]">Subwoofer low-pass frequency</Label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <input
                  type="number"
                  min={limits.minHz}
                  max={limits.maxHz}
                  step="1"
                  value={Math.round(subwooferHz)}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) commit({ subwooferFrequencyHz: parsed });
                  }}
                  autoComplete="off"
                  inputMode="numeric"
                  style={inputStyle}
                />
                <span style={{ fontSize: 11, color: "#625143" }}>Hz</span>
              </div>
              <div style={{ fontSize: 11, color: "#625143", marginTop: 4 }}>{rangeLabel}</div>
            </div>
          )}
        </div>
      )}

      {!disabled && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#3E4349" }}>Independent subwoofer frequency</div>
            <div style={{ fontSize: 11, color: "#625143" }}>
              Advanced. Normally the speakers and subwoofers cross over at the same frequency.
            </div>
          </div>
          <Switch
            checked={!linked}
            onCheckedChange={(checked) => commit({ linkFrequencies: !checked })}
          />
        </div>
      )}

      {!disabled && (
        <div style={{ marginTop: 12, borderTop: "1px solid #EFEDE9", paddingTop: 10, fontSize: 11.5, color: "#625143" }}>
          {combinedSystem?.available
            ? `Combined LCR + subwoofer response built: ${combinedSystem.speakerCount} speaker${combinedSystem.speakerCount === 1 ? "" : "s"} with ${combinedSystem.subwooferCount} subwoofer${combinedSystem.subwooferCount === 1 ? "" : "s"}, level-matched at the reference seat (${combinedSystem.levelMatchDb >= 0 ? "+" : ""}${Number(combinedSystem.levelMatchDb).toFixed(1)} dB).`
            : combinedSystem?.reason
              ? `Combined response not available: ${combinedSystem.reason.replace(/[-_]/g, " ")}.`
              : "Calculate Bass Response to build the combined LCR + subwoofer response."}
        </div>
      )}
    </div>
  );
}