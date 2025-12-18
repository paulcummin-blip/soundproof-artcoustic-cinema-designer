import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

export default function SubTuningControls({ 
  subsCfg, 
  onTuningChange, 
  groupLabel = "Front" 
}) {
  const count = subsCfg?.count || 0;
  const tuning = subsCfg?.tuning || [];
  
  if (count === 0) return null;
  
  const updateTuning = (index, field, value) => {
    const newTuning = [...tuning];
    while (newTuning.length <= index) {
      newTuning.push({ gainDb: 0, delayMs: 0, polarity: 0 });
    }
    newTuning[index] = { ...newTuning[index], [field]: value };
    onTuningChange(newTuning);
  };
  
  const labels = count === 1 ? ["Single"] : ["Left", "Right"];
  
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => {
        const t = tuning[i] || { gainDb: 0, delayMs: 0, polarity: 0 };
        
        return (
          <div key={i} className="p-3 rounded-lg border border-[#DCDBD6] bg-white space-y-3">
            <div className="text-sm font-medium text-[#1B1A1A]">
              {groupLabel} Sub {labels[i]}
            </div>
            
            {/* Gain */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-[#3E4349]">Gain</Label>
                <span className="text-xs font-mono text-[#1B1A1A]">
                  {t.gainDb > 0 ? '+' : ''}{t.gainDb.toFixed(1)} dB
                </span>
              </div>
              <Slider
                value={[t.gainDb]}
                onValueChange={([v]) => updateTuning(i, 'gainDb', v)}
                min={-12}
                max={6}
                step={0.5}
                className="w-full"
              />
            </div>
            
            {/* Delay */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-[#3E4349]">Delay</Label>
                <span className="text-xs font-mono text-[#1B1A1A]">
                  {t.delayMs.toFixed(1)} ms
                </span>
              </div>
              <Slider
                value={[t.delayMs]}
                onValueChange={([v]) => updateTuning(i, 'delayMs', v)}
                min={0}
                max={20}
                step={0.1}
                className="w-full"
              />
            </div>
            
            {/* Polarity */}
            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#3E4349]">Polarity</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#3E4349]">
                  {t.polarity === 180 ? 'Inverted' : 'Normal'}
                </span>
                <Switch
                  checked={t.polarity === 180}
                  onCheckedChange={(checked) => updateTuning(i, 'polarity', checked ? 180 : 0)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}