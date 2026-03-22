import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

export default function SurroundsSelector({
  layout,
  choices,
  overrideChoices,
  value,
  override,
  onChange,
  activeRoles,
  disabled,
  extraSurroundCount,
  onExtraSurroundCountChange,
  allowExtraSurrounds
}) {
  // Fall back to full choices if overrideChoices not provided
  const filteredOverrideChoices = overrideChoices || choices;
  const [showSurroundOverrides, setShowSurroundOverrides] = React.useState(false);

  const rolesReady = Array.isArray(activeRoles) && activeRoles.length > 0;
  const choicesReady = Array.isArray(choices) && choices.length > 0;
  const ready = rolesReady && choicesReady;

  // If not ready, render UI but disable model selectors.
  // Extra Surrounds must still show (stable control).
  const uiDisabled = disabled || !ready;

  const showSides = (activeRoles || []).includes('SL');
  const showRears = (activeRoles || []).includes('SBL');
  const showWides = (activeRoles || []).includes('LW');

  // Default to true Off unless the stored value is a real model
  const isReal = (m) => !!m && m !== '(none)' && m !== 'off' && m !== 'none';
  const masterModel = isReal(value?.master) ? value.master : 'off';
  const sideModel   = isReal(value?.side)   ? value.side   : masterModel;
  const rearModel   = isReal(value?.rear)   ? value.rear   : masterModel;
  const wideModel   = isReal(value?.wide)   ? value.wide   : masterModel;

  const sideOverride = !!override?.side;
  const rearOverride = !!override?.rear;
  const wideOverride = !!override?.wide;

  // Safe value for Extra Surrounds (always defined)
  const safeExtraCount = Number.isFinite(extraSurroundCount) ? extraSurroundCount : 0;

  // Look up display label from registry (canonical source)
  const getModelLabel = (modelKey) => {
    if (!modelKey || modelKey === 'off' || modelKey === 'OFF') return 'Off';
    
    // Use speaker registry as source of truth for labels
    const meta = getSpeakerModelMeta(modelKey);
    if (meta && meta.label && !meta.notFound) return meta.label;
    
    // Fallback to choices if registry lookup fails
    const choice = choices.find(c => c.value === modelKey);
    return choice?.label || modelKey;
  };

  return (
    <div className="space-y-4">
      {/* Global/Master selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-[#3E4349]">Surround Model (All)</Label>
        <Select
          value={masterModel}
          onValueChange={(newMaster) => {
            // Guard: explicitly store "off" or a concrete model; never implicit truthy
            const next = (!newMaster || newMaster === 'off') ? 'off' : newMaster;
            onChange({
              value: { ...value, master: next },
              override
            });
          }}
          disabled={uiDisabled}
        >
          <SelectTrigger className="w-full bg-white border-[#DCDBD6] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
            <span className="text-2xl font-semibold" style={{ color: "#213428" }}>
              {getModelLabel(masterModel)}
            </span>
          </SelectTrigger>
          <SelectContent className="bg-white border-[#DCDBD6]">
            {(choices || []).map((choice) => (
              <SelectItem
                key={choice.value}
                value={choice.value}
                className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]"
                style={{ color: "#213428" }}
              >
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-[#625143]">Applies to all surrounds unless overridden.</p>

        {/* Extra Surrounds - ONLY SHOW for 9.x.x layouts */}
        {allowExtraSurrounds && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, marginBottom: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Extra Surrounds</div>
              
              <div style={{ width: 150 }}>
                <Select
                  value={String(safeExtraCount)}
                  onValueChange={(v) => {
                    const n = parseInt(v, 10);
                    if (typeof onExtraSurroundCountChange === 'function') {
                      onExtraSurroundCountChange(Number.isFinite(n) ? n : 0);
                    }
                  }}
                  disabled={uiDisabled}
                >
                  <SelectTrigger className="w-full bg-white border-[#DCDBD6] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent className="bg-white border-[#DCDBD6]">
                    <SelectItem value="0" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">Off</SelectItem>
                    <SelectItem value="2" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">2</SelectItem>
                    <SelectItem value="4" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">4</SelectItem>
                    <SelectItem value="6" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">6</SelectItem>
                    <SelectItem value="8" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">8</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {/* Individual Control toggle */}
        <button
          type="button"
          onClick={() => setShowSurroundOverrides(v => !v)}
          style={{
            marginTop: 16,
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
          {showSurroundOverrides ? "Hide individual control" : "Individual Control"}
        </button>
      </div>

      {showSurroundOverrides && (
        <>
          <div className="border-t border-[#E5E5E5]" />

          <div className="space-y-3">
            {/* Side Surrounds */}
            {showSides && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-[#3E4349]">Side Surrounds</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#625143]">Use Global</span>
                    <Switch
                      checked={!sideOverride}
                      onCheckedChange={(checked) => {
                        onChange({
                          value,
                          override: { ...override, side: !checked }
                        });
                      }}
                      disabled={uiDisabled}
                    />
                  </div>
                </div>
                {sideOverride ? (
                  <Select
                    value={sideModel}
                    onValueChange={(newSide) => {
                       onChange({
                          value: { ...value, side: (!newSide || newSide === 'off') ? 'off' : newSide },
                          override
                        });
                      }}
                      disabled={uiDisabled}
                    >
                      <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                        <span>{getModelLabel(sideModel)}</span>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                     {(filteredOverrideChoices || []).map((choice) => (
                       <SelectItem key={choice.value} value={choice.value} className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                         {choice.label}
                       </SelectItem>
                     ))}
                    </SelectContent>
                    </Select>
                    ) : (
                    <div className="text-xs text-[#625143] italic">Using: {getModelLabel(masterModel)}</div>
                    )}
                    </div>
                    )}

                    {/* Rear Surrounds */}
            {showRears && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-[#3E4349]">Rear Surrounds</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#625143]">Use Global</span>
                    <Switch
                      checked={!rearOverride}
                      onCheckedChange={(checked) => {
                        onChange({
                          value,
                          override: { ...override, rear: !checked }
                        });
                      }}
                      disabled={uiDisabled}
                    />
                  </div>
                </div>
                {rearOverride ? (
                  <Select
                    value={rearModel}
                    onValueChange={(newRear) => {
                       onChange({
                          value: { ...value, rear: (!newRear || newRear === 'off') ? 'off' : newRear },
                          override
                        });
                      }}
                      disabled={uiDisabled}
                    >
                      <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                        <span>{getModelLabel(rearModel)}</span>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                     {(filteredOverrideChoices || []).map((choice) => (
                       <SelectItem key={choice.value} value={choice.value} className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                         {choice.label}
                       </SelectItem>
                     ))}
                    </SelectContent>
                    </Select>
                    ) : (
                    <div className="text-xs text-[#625143] italic">Using: {getModelLabel(masterModel)}</div>
                    )}
                    </div>
                    )}

                    {/* Front Wides */}
            {showWides && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-[#3E4349]">Front Wides</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#625143]">Use Global</span>
                    <Switch
                      checked={!wideOverride}
                      onCheckedChange={(checked) => {
                        onChange({
                          value,
                          override: { ...override, wide: !checked }
                        });
                      }}
                      disabled={uiDisabled}
                    />
                  </div>
                </div>
                {wideOverride ? (
                  <Select
                    value={wideModel}
                    onValueChange={(newWide) => {
                       onChange({
                          value: { ...value, wide: (!newWide || newWide === 'off') ? 'off' : newWide },
                          override
                        });
                      }}
                      disabled={uiDisabled}
                    >
                      <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                        <span>{getModelLabel(wideModel)}</span>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                     {(filteredOverrideChoices || []).map((choice) => (
                       <SelectItem key={choice.value} value={choice.value} className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                         {choice.label}
                       </SelectItem>
                     ))}
                    </SelectContent>
                    </Select>
                    ) : (
                    <div className="text-xs text-[#625143] italic">Using: {getModelLabel(masterModel)}</div>
                    )}
                    </div>
                    )}
                    </div>
                    </>
                    )}
    </div>
  );
}