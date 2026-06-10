import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

export default function SubTuningControls({ subsCfg, onSettingsChange, groupLabel = "Front" }) {
  const count = subsCfg?.count || 0;
  const settingsById = subsCfg?.settingsById || {};

  if (count === 0) return null;

  const prefix = groupLabel.toLowerCase();
  const subIds = count === 1 ? [`${prefix}-sub-left`] : [`${prefix}-sub-left`, `${prefix}-sub-right`];
  const labels = count === 1 ? ["Single"] : ["Left", "Right"];

  const updateSettings = (subId, field, value) => {
    const newSettings = {
      ...settingsById,
      [subId]: {
        gainDb: 0,
        delayMs: settingsById[subId]?.delayMs ?? 0,
        polarity: 'normal',
        ...settingsById[subId],
        [field]: value,
      },
    };
    onSettingsChange(newSettings);
  };

  return (
    <div className="space-y-4">
      {subIds.map((subId, i) => {
        const settings = settingsById[subId] || { gainDb: 0, delayMs: 0, polarity: 'normal' };
        const gainDb = Number.isFinite(settings.gainDb) ? settings.gainDb : 0;
        const polarity = settings.polarity === 'invert' ? 'invert' : 'normal';
        const enginePolarity = polarity === 'invert' ? 180 : 0;

        return (
          <div key={subId} className="p-3 rounded-lg border border-[#DCDBD6] bg-white space-y-3">
            <div className="text-sm font-medium text-[#1B1A1A]">
              {groupLabel} Sub {labels[i]}
            </div>

            {/* Gain */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-[#3E4349]">Gain</Label>
                <span className="text-xs font-mono text-[#1B1A1A]">
                  {gainDb > 0 ? '+' : ''}{gainDb.toFixed(1)} dB
                </span>
              </div>
              <Slider
                value={[gainDb]}
                onValueChange={([v]) => updateSettings(subId, 'gainDb', v)}
                min={-12}
                max={6}
                step={0.5}
                className="w-full"
              />
            </div>

            {/* Polarity */}
            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#3E4349]">Polarity</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#3E4349]">
                  {polarity === 'invert' ? 'Inverted' : 'Normal'}
                </span>
                <Switch
                  checked={polarity === 'invert'}
                  onCheckedChange={(checked) =>
                    updateSettings(subId, 'polarity', checked ? 'invert' : 'normal')
                  }
                />
              </div>
            </div>

            {/* __TEMP_DIAGNOSTIC__ engine tuning readout — remove after gain/polarity test */}
            <div className="text-[10px] font-mono text-[#625143] bg-[#F8F8F7] rounded px-2 py-1">
              Engine tuning key: {subId} | gain: {gainDb > 0 ? '+' : ''}{gainDb.toFixed(1)} dB | polarity: {enginePolarity}°
            </div>
          </div>
        );
      })}
    </div>
  );
}