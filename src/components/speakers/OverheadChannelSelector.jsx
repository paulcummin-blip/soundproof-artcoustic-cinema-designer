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

  // When OFF is selected, disable all row controls
  const isOff = !globalModel || globalModel === 'OFF';
  const rowsDisabled = disabled || isOff;

  if (overheadCount === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No overhead channels in current system configuration.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Global model selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Overhead Model (All)</Label>
        <Select
          value={globalModel || 'OFF'}
          onValueChange={(val) => onGlobalModelChange(val === 'OFF' ? null : val)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select overhead model..." className="text-2xl font-semibold" style={{ color: "#213428" }} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OFF" style={{ color: "#213428" }}>OFF — (no overheads active)</SelectItem>
            {overheadModels.map((model) => (
              <SelectItem key={model.key} value={model.key} style={{ color: "#213428" }}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isOff && (
          <p className="text-xs text-gray-500">
            Applies to all overheads unless overridden.
          </p>
        )}
        
        {/* Individual Control toggle button */}
        {!isOff && (
          <button
            type="button"
            onClick={() => setShowIndividualOverheads(v => !v)}
            style={{ 
              marginTop: 8,
              fontSize: 13,
              color: '#625143',
              textDecoration: 'underline',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0
            }}
          >
            {showIndividualOverheads ? 'Hide Individual Control' : 'Individual Control'}
          </button>
        )}
      </div>

      {/* Position-specific overrides - only shown when toggled on */}
      {showIndividualOverheads && !isOff && (
        <>
          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* Position-specific rows */}
          <div className="space-y-3">
            {/* Front Overhead */}
            {showFront && (
              <div className="space-y-2">
                <Label className="text-sm">Front Overhead</Label>
                <Select
                  value={useFrontGlobal ? globalModel : (frontOverride || globalModel || 'OFF')}
                  onValueChange={(val) => {
                    onUseFrontGlobalChange(false);
                    onFrontOverrideChange(val);
                  }}
                  disabled={rowsDisabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {overheadModels.map((model) => (
                      <SelectItem key={model.key} value={model.key}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Mid Overhead */}
            {showMid && (
              <div className="space-y-2">
                <Label className="text-sm">Mid Overhead</Label>
                <Select
                  value={useMidGlobal ? globalModel : (midOverride || globalModel || 'OFF')}
                  onValueChange={(val) => {
                    onUseMidGlobalChange(false);
                    onMidOverrideChange(val);
                  }}
                  disabled={rowsDisabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {overheadModels.map((model) => (
                      <SelectItem key={model.key} value={model.key}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Rear Overhead */}
            {showRear && (
              <div className="space-y-2">
                <Label className="text-sm">Rear Overhead</Label>
                <Select
                  value={useRearGlobal ? globalModel : (rearOverride || globalModel || 'OFF')}
                  onValueChange={(val) => {
                    onUseRearGlobalChange(false);
                    onRearOverrideChange(val);
                  }}
                  disabled={rowsDisabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {overheadModels.map((model) => (
                      <SelectItem key={model.key} value={model.key}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}