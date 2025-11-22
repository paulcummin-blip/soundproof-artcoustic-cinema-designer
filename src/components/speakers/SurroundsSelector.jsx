import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function SurroundsSelector({
  layout,
  choices,
  value,
  override,
  onChange,
  activeRoles,
  disabled
}) {
  const [showSurroundOverrides, setShowSurroundOverrides] = React.useState(false);

  // Guard: don't render until roles/options are ready (prevents early seeding)
  if (!Array.isArray(activeRoles) || activeRoles.length === 0 || !Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const showSides = activeRoles.includes('SL');
  const showRears = activeRoles.includes('SBL');
  const showWides = activeRoles.includes('LW');

  // Default to true Off unless the stored value is a real model
  const isReal = (m) => !!m && m !== '(none)' && m !== 'off' && m !== 'none';
  const masterModel = isReal(value?.master) ? value.master : 'off';
  const sideModel   = isReal(value?.side)   ? value.side   : masterModel;
  const rearModel   = isReal(value?.rear)   ? value.rear   : masterModel;
  const wideModel   = isReal(value?.wide)   ? value.wide   : masterModel;

  const sideOverride = !!override?.side;
  const rearOverride = !!override?.rear;
  const wideOverride = !!override?.wide;

  const getModelLabel = (modelKey) => {
    const choice = choices.find(c => c.value === modelKey);
    return choice?.label || 'Off';
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
          disabled={disabled}
        >
          <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
            <SelectValue placeholder="Select surround model..." className="text-2xl font-semibold" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#DCDBD6]">
            {choices.map((choice) => (
              <SelectItem
                key={choice.value}
                value={choice.value}
                className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]"
              >
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-[#625143]">Applies to all surrounds unless overridden.</p>

        {/* Individual Control toggle */}
        <button
          type="button"
          onClick={() => setShowSurroundOverrides(v => !v)}
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
                      disabled={disabled}
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
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {choices.map((choice) => (
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
                      disabled={disabled}
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
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {choices.map((choice) => (
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
                      disabled={disabled}
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
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {choices.map((choice) => (
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