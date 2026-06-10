import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

export default function SubTuningControls({ 
  subsCfg, 
  onSettingsChange, 
  groupLabel = "Front",
  subDistances = {},
  autoAlignEnabled = false,
  autoAlignDelays = {}
}) {
  const count = subsCfg?.count || 0;
  const settingsById = subsCfg?.settingsById || {};
  
  if (count === 0) return null;
  
  // Determine sub IDs based on group and count
  const prefix = groupLabel.toLowerCase();
  const subIds = count === 1 ? [`${prefix}-sub-left`] : [`${prefix}-sub-left`, `${prefix}-sub-right`];
  
  const updateSettings = (subId, field, value) => {
    const newSettings = {
      ...settingsById,
      [subId]: {
        gainDb: 0,
        delayMs: 0,
        polarity: 'normal',
        ...settingsById[subId],
        [field]: value
      }
    };
    onSettingsChange(newSettings);
  };
  
  const labels = count === 1 ? ["Single"] : ["Left", "Right"];
  
  return (
    <div className="space-y-4">
      {subIds.map((subId, i) => {
        const settings = settingsById[subId] || { gainDb: 0, delayMs: 0, polarity: 'normal' };
        const distance = subDistances[subId];
        
        return (
          <div key={subId} className="p-3 rounded-lg border border-[#DCDBD6] bg-white space-y-3">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-medium text-[#1B1A1A]">
                {groupLabel} Sub {labels[i]}
              </div>
              {distance && (
                <div className="text-xs text-[#3E4349]">
                  {distance.distanceM.toFixed(2)}m • {distance.timeMs.toFixed(2)}ms
                </div>
              )}
            </div>
            
            {autoAlignEnabled && (
              <div className="text-xs text-[#3E4349] bg-[#F8F8F7] p-1.5 rounded">
                Auto-aligned to MLP
              </div>
            )}
            
            {/* Gain */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-[#3E4349]">Gain</Label>
                <span className="text-xs font-mono text-[#1B1A1A]">
                  {settings.gainDb > 0 ? '+' : ''}{settings.gainDb.toFixed(1)} dB
                </span>
              </div>
              <Slider
                value={[settings.gainDb]}
                onValueChange={([v]) => updateSettings(subId, 'gainDb', v)}
                min={-12}
                max={6}
                step={0.5}
                className="w-full"
              />
            </div>
            
            {/* Delay */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-[#3E4349]">Manual delay</Label>
                <span className="text-xs font-mono text-[#1B1A1A]">
                  {settings.delayMs.toFixed(1)} ms
                </span>
              </div>
              <Slider
                value={[settings.delayMs]}
                onValueChange={([v]) => updateSettings(subId, 'delayMs', v)}
                min={0}
                max={20}
                step={0.1}
                className="w-full"
              />
              {autoAlignEnabled && (
                <div className="mt-2 text-xs text-[#3E4349] space-y-0.5">
                  <div className="flex justify-between">
                    <span>Auto-alignment offset</span>
                    <span className="font-mono text-[#625143]">{(autoAlignDelays[subId] ?? 0).toFixed(2)} ms</span>
                  </div>
                  <div className="flex justify-between font-medium text-[#1B1A1A]">
                    <span>Effective engine delay</span>
                    <span className="font-mono">{(settings.delayMs + (autoAlignDelays[subId] ?? 0)).toFixed(2)} ms</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Polarity */}
            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#3E4349]">Polarity</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#3E4349]">
                  {settings.polarity === 'invert' ? 'Inverted' : 'Normal'}
                </span>
                <Switch
                  checked={settings.polarity === 'invert'}
                  onCheckedChange={(checked) => updateSettings(subId, 'polarity', checked ? 'invert' : 'normal')}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}