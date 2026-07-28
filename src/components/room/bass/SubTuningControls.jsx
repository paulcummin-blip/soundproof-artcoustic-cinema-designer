import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

/**
 * SubTuningControls — Stage 2 canonical calibration controls.
 *
 * Renders the enabled canonical instances for a group with their exact stable
 * ids and canonical gainDb/delayMs/polarity. Each user change patches only that
 * instance by exact id through onCalibrationChange (which routes to
 * setInstanceCalibration/commitInstances). No CFG settingsById writes, no
 * generated left/right IDs.
 *
 * UI polarity mapping: 'normal' = canonical 1, 'invert' = canonical -1.
 */
export default function SubTuningControls({ instances, onCalibrationChange, groupLabel = "Front", showManualDelay = false }) {
  const enabledInstances = (Array.isArray(instances) ? instances : []).filter((i) => i?.enabled !== false);
  if (enabledInstances.length === 0) return null;

  const labels = enabledInstances.length === 1 ? ["Single"] : ["Left", "Right"];

  return (
    <div className="space-y-4">
      {enabledInstances.map((inst, i) => {
        const subId = inst.id;
        const gainDb = Number.isFinite(inst.gainDb) ? inst.gainDb : 0;
        const delayMs = Number.isFinite(inst.delayMs) ? inst.delayMs : 0;
        const polarity = inst.polarity === -1 ? "invert" : "normal";
        const enginePolarity = polarity === "invert" ? 180 : 0;
        const autoDelayMs = Number.isFinite(inst.autoDelayMs) ? inst.autoDelayMs : 0;

        return (
          <div key={subId} className="p-3 rounded-lg border border-[#DCDBD6] bg-white space-y-3">
            <div className="text-sm font-medium text-[#1B1A1A]">
              {groupLabel} Sub {labels[i] ?? i + 1}
            </div>

            {/* Gain */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-[#3E4349]">Gain</Label>
                <span className="text-xs font-mono text-[#1B1A1A]">
                  {gainDb > 0 ? "+" : ""}{gainDb.toFixed(1)} dB
                </span>
              </div>
              <Slider
                value={[gainDb]}
                onValueChange={([v]) => onCalibrationChange(subId, { gainDb: v })}
                min={-12}
                max={6}
                step={0.5}
                className="w-full"
              />
            </div>

            {/* Manual Delay — development mode only */}
            {showManualDelay && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-[#3E4349]">Manual Delay</Label>
                  <span className="text-xs font-mono text-[#1B1A1A]">{delayMs.toFixed(1)} ms</span>
                </div>
                <Slider
                  value={[delayMs]}
                  onValueChange={([v]) => onCalibrationChange(subId, { delayMs: v })}
                  min={0}
                  max={20}
                  step={0.1}
                  className="w-full"
                />
              </div>
            )}

            {/* Polarity */}
            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#3E4349]">Polarity</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#3E4349]">
                  {polarity === "invert" ? "Inverted" : "Normal"}
                </span>
                <Switch
                  checked={polarity === "invert"}
                  onCheckedChange={(checked) =>
                    onCalibrationChange(subId, { polarity: checked ? -1 : 1 })
                  }
                />
              </div>
            </div>

            {/* Auto-align delay readout — read-only */}
            <div className="text-[11px] text-[#3E4349] bg-[#F8F8F7] rounded px-2 py-1">
              Auto delay applied: {autoDelayMs.toFixed(2)} ms
            </div>

            {/* Engine tuning readout */}
            <div className="text-[10px] font-mono text-[#625143] bg-[#F8F8F7] rounded px-2 py-1">
              Engine tuning key: {subId} | gain: {gainDb > 0 ? "+" : ""}{gainDb.toFixed(1)} dB | polarity: {enginePolarity}°
            </div>
          </div>
        );
      })}
    </div>
  );
}