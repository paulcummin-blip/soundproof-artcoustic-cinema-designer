import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CROSSOVER_SLOPES_DB_PER_OCT, normaliseCrossoverConfig } from "@/components/room/bass/crossoverAuthority";

/**
 * Crossover & Integration.
 *
 * The committed settings are shown in one line. Edits are held as a local draft
 * and only reach the design when Apply is pressed, so the combined response is
 * rebuilt once per decision rather than on every keystroke. Revert restores the
 * committed settings.
 */
export default function CrossoverIntegrationPanel({
  crossover,
  limits,
  onApply,
  disabled = false,
}) {
  const [draft, setDraft] = useState(() => normaliseCrossoverConfig(crossover, limits));

  // Follow the committed settings whenever the design itself moves (project
  // load, speaker change, or a limit that has tightened).
  useEffect(() => {
    setDraft(normaliseCrossoverConfig(crossover, limits));
  }, [crossover, limits]);

  if (!crossover || !limits) return null;

  const linked = draft.linkFrequencies !== false;
  const subwooferHz = linked ? draft.frequencyHz : draft.subwooferFrequencyHz;
  const dirty = linked !== (crossover.linkFrequencies !== false)
    || Math.round(draft.frequencyHz) !== Math.round(crossover.frequencyHz)
    || draft.speakerHpSlopeDbPerOct !== crossover.speakerHpSlopeDbPerOct
    || draft.subwooferLpSlopeDbPerOct !== crossover.subwooferLpSlopeDbPerOct
    || Math.round(subwooferHz) !== Math.round(
      crossover.linkFrequencies === false ? crossover.subwooferFrequencyHz : crossover.frequencyHz,
    );

  const patch = (changes) => setDraft((previous) => normaliseCrossoverConfig({ ...previous, ...changes }, limits));
  const rangeLabel = `Permitted ${Math.round(limits.minHz)}–${Math.round(limits.maxHz)} Hz`;

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
  const selectStyle = { ...inputStyle, width: 104, textAlign: "left" };

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
          {Math.round(crossover.linkFrequencies === false ? crossover.subwooferFrequencyHz : crossover.frequencyHz)} Hz · {crossover.subwooferLpSlopeDbPerOct} dB/oct
        </div>
      </div>

      {disabled ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#625143" }}>
          Select the front left, centre and right speakers to set the crossover.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
            <div>
              <Label className="text-xs text-[#3E4349]">{linked ? "Crossover frequency" : "Speaker high-pass frequency"}</Label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <input
                  type="number"
                  min={limits.minHz}
                  max={limits.maxHz}
                  step="1"
                  value={Math.round(draft.frequencyHz)}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) patch({ frequencyHz: parsed });
                  }}
                  autoComplete="off"
                  inputMode="numeric"
                  style={inputStyle}
                />
                <span style={{ fontSize: 11, color: "#625143" }}>Hz</span>
              </div>
              <div style={{ fontSize: 11, color: "#625143", marginTop: 4 }}>{rangeLabel}</div>
            </div>

            <div>
              <Label className="text-xs text-[#3E4349]">Speaker high-pass slope</Label>
              <div style={{ marginTop: 6 }}>
                <select
                  value={draft.speakerHpSlopeDbPerOct}
                  onChange={(event) => patch({ speakerHpSlopeDbPerOct: Number(event.target.value) })}
                  style={selectStyle}
                >
                  {CROSSOVER_SLOPES_DB_PER_OCT.map((slope) => (
                    <option key={slope} value={slope}>{slope} dB/octave</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-[#3E4349]">Subwoofer low-pass slope</Label>
              <div style={{ marginTop: 6 }}>
                <select
                  value={draft.subwooferLpSlopeDbPerOct}
                  onChange={(event) => patch({ subwooferLpSlopeDbPerOct: Number(event.target.value) })}
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
                    value={Math.round(draft.subwooferFrequencyHz)}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (Number.isFinite(parsed)) patch({ subwooferFrequencyHz: parsed });
                    }}
                    autoComplete="off"
                    inputMode="numeric"
                    style={inputStyle}
                  />
                  <span style={{ fontSize: 11, color: "#625143" }}>Hz</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#3E4349", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!linked}
                onChange={(event) => patch({ linkFrequencies: !event.target.checked })}
              />
              Independent subwoofer frequency
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setDraft(normaliseCrossoverConfig(crossover, limits))}>
                Revert
              </Button>
              <Button size="sm" disabled={!dirty} onClick={() => onApply?.(normaliseCrossoverConfig(draft, limits))}>
                Apply
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}