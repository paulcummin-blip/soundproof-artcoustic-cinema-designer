import React, { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getModelsByCategoryOrdered } from '@/components/models/speakers/registry';

export default function OverheadChannelSelector({
  overheadCount,
  globalModel,
  onGlobalModelChange,
  frontOverride,
  midOverride,
  rearOverride,
  onFrontOverrideChange,
  onMidOverrideChange,
  onRearOverrideChange,
  useFrontGlobal,
  useMidGlobal,
  useRearGlobal,
  onUseFrontGlobalChange,
  onUseMidGlobalChange,
  onUseRearGlobalChange,
  disabled
}) {
  const [showIndividualOverheads, setShowIndividualOverheads] = useState(false);
  
  const overheadModels = useMemo(() => {
    const byCategory = getModelsByCategoryOrdered();
    return byCategory.ARCHITECT || [];
  }, []);

  const showFront = overheadCount === 4 || overheadCount === 6;
  const showMid = overheadCount === 2 || overheadCount === 6;
  const showRear = overheadCount === 4 || overheadCount === 6;

  const isOff = !globalModel || globalModel === 'OFF';
  const rowsDisabled = disabled || isOff;

  const frontHasOverride = !useFrontGlobal && frontOverride;
  const midHasOverride = !useMidGlobal && midOverride;
  const rearHasOverride = !useRearGlobal && rearOverride;

  // Look up display label from overhead models registry
  const getModelLabel = (modelKey) => {
    // Try exact match first
    let model = overheadModels.find(m => m.key === modelKey);
    
    // If not found and key ends with _s, try without suffix
    if (!model && modelKey && String(modelKey).endsWith('_s')) {
      const keyWithoutS = String(modelKey).slice(0, -2);
      model = overheadModels.find(m => m.key === keyWithoutS);
    }
    
    return model?.label || 'Off';
  };

  if (overheadCount === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No overhead channels in current system configuration.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-[#3E4349]">Overhead Model (All)</Label>
        <Select
          value={globalModel || 'OFF'}
          onValueChange={(val) => onGlobalModelChange(val === 'OFF' ? null : val)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full bg-white border-[#DCDBD6] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
            <SelectValue placeholder="Select overhead model..." className="text-2xl font-semibold" style={{ color: "#213428" }} />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#DCDBD6]">
            <SelectItem value="OFF" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: "#213428" }}>
              OFF — (no overheads active)
            </SelectItem>
            {overheadModels.map((model) => (
              <SelectItem key={model.key} value={model.key} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: "#213428" }}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-[#625143]">Applies to all overheads unless overridden.</p>
        
        {!isOff && (
          <button
            type="button"
            onClick={() => setShowIndividualOverheads(v => !v)}
            style={{
              marginTop: 4,
              marginBottom: 8,
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: 13,
              fontStyle: "italic",
              textDecoration: "underline",
              color: "#625143",
            }}
          >
            {showIndividualOverheads ? "Hide individual control" : "Individual Control"}
          </button>
        )}
      </div>

      {showIndividualOverheads && !isOff && (
        <>
          <div className="border-t border-[#E5E5E5]" />

          <div className="space-y-3">
            {showFront && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-[#3E4349]">Front Overhead</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#625143]">Use Global</span>
                    <Switch
                      checked={!frontHasOverride}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onUseFrontGlobalChange(true);
                          onFrontOverrideChange(null);
                        } else {
                          onUseFrontGlobalChange(false);
                        }
                      }}
                      disabled={rowsDisabled}
                    />
                  </div>
                </div>
                {frontHasOverride ? (
                  <Select
                    value={frontOverride}
                    onValueChange={(val) => {
                      onFrontOverrideChange(val);
                      onUseFrontGlobalChange(false);
                    }}
                    disabled={rowsDisabled}
                  >
                    <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {overheadModels.map((model) => (
                        <SelectItem key={model.key} value={model.key} className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-xs text-[#625143] italic">Using: {getModelLabel(globalModel)}</div>
                )}
              </div>
            )}

            {showMid && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-[#3E4349]">Mid Overhead</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#625143]">Use Global</span>
                    <Switch
                      checked={!midHasOverride}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onUseMidGlobalChange(true);
                          onMidOverrideChange(null);
                        } else {
                          onUseMidGlobalChange(false);
                        }
                      }}
                      disabled={rowsDisabled}
                    />
                  </div>
                </div>
                {midHasOverride ? (
                  <Select
                    value={midOverride}
                    onValueChange={(val) => {
                      onMidOverrideChange(val);
                      onUseMidGlobalChange(false);
                    }}
                    disabled={rowsDisabled}
                  >
                    <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {overheadModels.map((model) => (
                        <SelectItem key={model.key} value={model.key} className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-xs text-[#625143] italic">Using: {getModelLabel(globalModel)}</div>
                )}
              </div>
            )}

            {showRear && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-[#3E4349]">Rear Overhead</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#625143]">Use Global</span>
                    <Switch
                      checked={!rearHasOverride}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onUseRearGlobalChange(true);
                          onRearOverrideChange(null);
                        } else {
                          onUseRearGlobalChange(false);
                        }
                      }}
                      disabled={rowsDisabled}
                    />
                  </div>
                </div>
                {rearHasOverride ? (
                  <Select
                    value={rearOverride}
                    onValueChange={(val) => {
                      onRearOverrideChange(val);
                      onUseRearGlobalChange(false);
                    }}
                    disabled={rowsDisabled}
                  >
                    <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {overheadModels.map((model) => (
                        <SelectItem key={model.key} value={model.key} className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-xs text-[#625143] italic">Using: {getModelLabel(globalModel)}</div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}