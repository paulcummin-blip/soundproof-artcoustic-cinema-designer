// CrossoverControls.jsx
// ---------------------------------------------------------------------------
// The compact crossover control, used by every surface that shows it:
//   variant="highpass" -> Speaker High-Pass   (Speakers -> LCR)
//   variant="lowpass"  -> Subwoofer Low-Pass  (Speakers -> Subwoofers)
//   variant="both"     -> both, together      (Bass Response)
//
// Presentation only. The values and the permitted range arrive from the single
// project crossover authority; every change is written straight through, so the
// three surfaces always agree.
// ---------------------------------------------------------------------------

import React from "react";
import { CROSSOVER_SLOPES_DB_PER_OCT } from "@/components/room/bass/crossoverAuthority";

/** Selectable crossover frequencies, before the model's range is applied. */
const FREQUENCY_LADDER = [80, 85, 90, 95, 100, 105, 110, 115, 120, 130, 140, 150, 160, 180, 200];

/**
 * The frequencies the control offers: the ladder inside the permitted range,
 * plus the range's own floor and the current value (so a value set elsewhere is
 * always representable rather than silently snapping).
 */
export function crossoverFrequencyOptions(limits, currentHz) {
  const minHz = Math.round(Number(limits?.minHz) || 80);
  const maxHz = Math.round(Number(limits?.maxHz) || 200);
  const values = new Set([minHz]);
  for (const hz of FREQUENCY_LADDER) {
    if (hz >= minHz && hz <= maxHz) values.add(hz);
  }
  const current = Math.round(Number(currentHz));
  if (Number.isFinite(current) && current >= minHz && current <= maxHz) values.add(current);
  return Array.from(values).sort((a, b) => a - b);
}

const selectStyle = {
  width: 104,
  border: "1px solid #DCDBD6",
  borderRadius: 6,
  background: "#FFFFFF",
  padding: "5px 8px",
  fontSize: 12,
  color: "#1B1A1A",
  fontVariantNumeric: "tabular-nums",
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: "#3E4349",
  marginBottom: 6,
};

export default function CrossoverControls({
  title = null,
  variant = "both",
  crossover,
  limits,
  onChange,
  disabled = false,
  hint = null,
}) {
  if (!crossover || !limits) return null;

  const linked = crossover.linkFrequencies !== false;
  const speakerHz = Math.round(Number(crossover.frequencyHz));
  const subwooferHz = Math.round(
    linked ? Number(crossover.frequencyHz) : Number(crossover.subwooferFrequencyHz),
  );
  const options = crossoverFrequencyOptions(limits, Math.max(speakerHz, subwooferHz));

  const showHighPass = variant !== "lowpass";
  const showLowPass = variant !== "highpass";

  // A linked crossover moves both branches together; an independent subwoofer
  // frequency moves only the subwoofer branch.
  const setSpeakerFrequency = (hz) => onChange?.(
    linked ? { frequencyHz: hz, subwooferFrequencyHz: hz } : { frequencyHz: hz },
  );
  const setSubwooferFrequency = (hz) => onChange?.(
    linked ? { frequencyHz: hz, subwooferFrequencyHz: hz } : { subwooferFrequencyHz: hz },
  );

  const renderBlock = (key, label, frequency, onFrequency, slope, onSlope) => (
    <div key={key}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          value={frequency}
          onChange={(event) => onFrequency(Number(event.target.value))}
          disabled={disabled}
          aria-label={`${label} frequency`}
          style={selectStyle}
        >
          {options.map((hz) => (
            <option key={hz} value={hz}>{hz} Hz</option>
          ))}
        </select>
        <select
          value={slope}
          onChange={(event) => onSlope(Number(event.target.value))}
          disabled={disabled}
          aria-label={`${label} slope`}
          style={selectStyle}
        >
          {CROSSOVER_SLOPES_DB_PER_OCT.map((value) => (
            <option key={value} value={value}>{value} dB/oct</option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div>
      {title && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1B1A1A", marginBottom: 10 }}>
          {title}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        {showHighPass && renderBlock(
          "highpass",
          showLowPass ? "Speaker High-Pass" : null,
          speakerHz,
          setSpeakerFrequency,
          crossover.speakerHpSlopeDbPerOct,
          (slope) => onChange?.({ speakerHpSlopeDbPerOct: slope }),
        )}
        {showLowPass && renderBlock(
          "lowpass",
          showHighPass ? "Subwoofer Low-Pass" : null,
          subwooferHz,
          setSubwooferFrequency,
          crossover.subwooferLpSlopeDbPerOct,
          (slope) => onChange?.({ subwooferLpSlopeDbPerOct: slope }),
        )}
      </div>

      {hint && (
        <div style={{ fontSize: 11, color: "#625143", marginTop: 8 }}>
          {hint}
        </div>
      )}
    </div>
  );
}