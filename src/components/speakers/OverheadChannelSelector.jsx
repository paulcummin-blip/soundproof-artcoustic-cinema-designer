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
            <SelectValue placeholder="Select overhead model..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OFF">OFF — (no overheads active)</SelectItem>
            {overheadModels.map((model) => (
              <SelectItem key={model.key} value={model.key}>
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
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Front Overhead</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Use Global</span>
                    <Switch
                      checked={useFrontGlobal}
                      onCheckedChange={onUseFrontGlobalChange}
                      disabled={rowsDisabled}
                    />
                  </div>
                </div>
                {!useFrontGlobal && (
                  <Select
                    value={frontOverride || globalModel || 'OFF'}
                    onValueChange={onFrontOverrideChange}
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
                )}
                {useFrontGlobal && !isOff && (
                  <div className="text-xs text-gray-500 italic">
                    Using: {overheadModels.find(m => m.key === globalModel)?.label || 'None'}
                  </div>
                )}
              </div>
            )}

            {/* Mid Overhead */}
            {showMid && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Mid Overhead</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Use Global</span>
                    <Switch
                      checked={useMidGlobal}
                      onCheckedChange={onUseMidGlobalChange}
                      disabled={rowsDisabled}
                    />
                  </div>
                </div>
                {!useMidGlobal && (
                  <Select
                    value={midOverride || globalModel || 'OFF'}
                    onValueChange={onMidOverrideChange}
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
                )}
                {useMidGlobal && !isOff && (
                  <div className="text-xs text-gray-500 italic">
                    Using: {overheadModels.find(m => m.key === globalModel)?.label || 'None'}
                  </div>
                )}
              </div>
            )}

            {/* Rear Overhead */}
            {showRear && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Rear Overhead</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Use Global</span>
                    <Switch
                      checked={useRearGlobal}
                      onCheckedChange={onUseRearGlobalChange}
                      disabled={rowsDisabled}
                    />
                  </div>
                </div>
                {!useRearGlobal && (
                  <Select
                    value={rearOverride || globalModel || 'OFF'}
                    onValueChange={onRearOverrideChange}
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
                )}
                {useRearGlobal && !isOff && (
                  <div className="text-xs text-gray-500 italic">
                    Using: {overheadModels.find(m => m.key === globalModel)?.label || 'None'}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}