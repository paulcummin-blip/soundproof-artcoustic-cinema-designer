import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';

const placementOptions = [
  {
    mode: 'quarter',
    title: '1/4 Points',
    description: 'At the 1/4 points along the wall (X dimension).',
    diagram: (
      <div className="relative h-8 w-12 rounded border border-[#CFC8BE] bg-white">
        <div className="absolute top-1/2 left-3 h-2 w-2 -translate-y-1/2 rounded-full bg-[#213428]" />
        <div className="absolute top-1/2 right-3 h-2 w-2 -translate-y-1/2 rounded-full bg-[#213428]" />
      </div>
    )
  },
  {
    mode: 'corners',
    title: 'Corners',
    description: 'At the room corners with 1cm buffer.',
    diagram: (
      <div className="relative h-8 w-12 rounded border border-[#CFC8BE] bg-white">
        <div className="absolute left-[2px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#213428]" />
        <div className="absolute right-[2px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#213428]" />
      </div>
    )
  },
  {
    mode: 'midpoint',
    title: 'Mid-Point (Centre)',
    description: 'Centred on the wall.',
    diagram: (
      <div className="relative h-8 w-12 rounded border border-[#CFC8BE] bg-white">
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#213428]" />
      </div>
    )
  },
  {
    mode: 'sixth',
    title: '1/6 – 5/6 Positions',
    description: 'At the 1/6 and 5/6 points.',
    diagram: (
      <div className="relative h-8 w-12 rounded border border-[#CFC8BE] bg-white">
        <div className="absolute top-1/2 left-[16.666%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#213428]" />
        <div className="absolute top-1/2 left-[83.333%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#213428]" />
      </div>
    )
  },
  {
    mode: 'asymmetric',
    title: 'Asymmetric (Offset Pair)',
    description: 'Asymmetric placement to reduce axial mode build-up.',
    diagram: (
      <div className="relative h-8 w-12 rounded border border-[#CFC8BE] bg-white">
        <div className="absolute top-1/2 left-[32%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#213428]" />
        <div className="absolute top-1/2 left-[78%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#213428]" />
      </div>
    )
  },
];

export default function SubwooferPanel({ appState, disabled, frontSubsCfg, rearSubsCfg, subWarnings }) {
  return (
    <CollapsiblePanel title="Subwoofers" defaultOpen={false}>
      <div className="rounded-none border border-[#E7E4DF] bg-[#F7F4F0]/40 px-4 py-4">
        <div className="grid grid-cols-12 gap-x-4 gap-y-3">
          <div className="col-span-12 md:col-span-6">
            <h4 className="text-[15px] font-semibold text-[#1B1A1A] mb-2">Front Subwoofers</h4>
            <div className="grid grid-cols-12 items-end gap-x-3 gap-y-2">
              <label className="col-span-7 text-[12px] text-[#625143]">Model</label>
              <label className="col-span-5 text-[12px] text-[#625143]">Quantity</label>

              <div className="col-span-7">
                <Select
                  value={frontSubsCfg?.model ?? "SUB2-12"}
                  disabled={disabled || (frontSubsCfg?.count ?? 0) === 0}
                  onValueChange={(model) => {
                    if (appState?.setFrontSubsCfg) {
                      appState.setFrontSubsCfg(prev => ({ ...prev, model }));
                    }
                  }}
                >
                  <SelectTrigger className="h-10 w-full px-3 justify-between bg-white border-[#DCDBD6]">
                    <SelectValue placeholder="Select model" className="text-2xl font-semibold" style={{ color: "#213428" }} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUB2-12">SUB2-12</SelectItem>
                    <SelectItem value="SUB3-12">SUB3-12</SelectItem>
                    <SelectItem value="SUB4-12">SUB4-12</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-5">
                <Select
                  value={String(frontSubsCfg?.count ?? 0)}
                  onValueChange={(v) => {
                    if (appState?.setFrontSubsCfg) {
                      appState.setFrontSubsCfg(prev => ({ ...prev, count: Number(v) }));
                    }
                  }}
                  disabled={!frontSubsCfg?.model}
                >
                  <SelectTrigger className="h-10 w-[90px] px-3 justify-between bg-white border-[#DCDBD6]">
                    <SelectValue placeholder="0" className="text-2xl font-semibold" style={{ color: "#213428" }} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-12 mt-2">
                <label className="block text-[12px] text-[#625143] mb-1">Mount height</label>
                <Select
                  value={frontSubsCfg?.mountMode ?? "floor"}
                  onValueChange={(mountMode) => {
                    if (appState?.setFrontSubsCfg) {
                      appState.setFrontSubsCfg(prev => ({ ...prev, mountMode }));
                    }
                  }}
                >
                  <SelectTrigger className="h-10 w-full bg-white border-[#DCDBD6]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="floor">Floor mount — bottom 10 cm</SelectItem>
                    <SelectItem value="wall">Wall mount — bottom 80 cm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              </div>

              {frontSubsCfg?.model === "SUB4-12" && (
              <div className="col-span-12 mt-3 flex items-center gap-3">
                <label className="shrink-0 text-[12px] text-[#625143]">Orientation</label>
                <div className="relative z-10 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (appState?.setFrontSubsCfg) {
                        appState.setFrontSubsCfg(prev => ({ ...prev, orientation: "vertical" }));
                      }
                    }}
                    className={`cursor-pointer pointer-events-auto relative z-10 shrink-0 px-3 py-1 text-[12px] rounded border ${
                      (frontSubsCfg?.orientation ?? "vertical") === "vertical"
                        ? "bg-[#213428] text-white border-[#213428]"
                        : "bg-white text-[#213428] border-[#DCDBD6]"
                    }`}
                    >
                     Vertical
                    </button>
                    <button
                     type="button"
                    onClick={() => {
                      if (appState?.setFrontSubsCfg) {
                        appState.setFrontSubsCfg(prev => ({ ...prev, orientation: "horizontal" }));
                      }
                    }}
                    className={`cursor-pointer pointer-events-auto relative z-10 shrink-0 px-3 py-1 text-[12px] rounded border ${
                      (frontSubsCfg?.orientation ?? "vertical") === "horizontal"
                        ? "bg-[#213428] text-white border-[#213428]"
                        : "bg-white text-[#213428] border-[#DCDBD6]"
                    }`}
                  >
                    Horizontal
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 mt-1 border-t border-[#DCDBD6] space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-medium text-[#1B1A1A]">Lock screen position</p>
                  <p className="text-[11px] text-[#625143] leading-tight">Keeps the screen at its current depth even if subwoofer position changes.</p>
                </div>
                <Switch
                  checked={!!appState?.screenPlaneLocked}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const live = appState?.screenFrontPlaneM;
                      if (Number.isFinite(live)) appState.setLockedScreenFrontPlaneM(live);
                      appState.setScreenPlaneLocked(true);
                    } else {
                      appState.setScreenPlaneLocked(false);
                    }
                  }}
                />
              </div>
              {appState?.screenPlaneLocked && Number.isFinite(appState?.lockedScreenFrontPlaneM) && (
                <p className="text-[11px] text-[#213428] font-medium">
                  Locked at {(appState.lockedScreenFrontPlaneM * 100).toFixed(1)} cm
                </p>
              )}
            </div>

            {subWarnings?.front?.length > 0 && (
              <div className="mt-2 text-xs px-2 py-1 rounded bg-orange-50 text-orange-700 border border-orange-200">
              {subWarnings.front[0]}
              </div>
            )}
          </div>

          <div className="col-span-12 md:col-span-6">
            <h4 className="text-[15px] font-semibold text-[#1B1A1A] mb-2">Rear Subwoofers</h4>
            <div className="grid grid-cols-12 items-end gap-x-3 gap-y-2">
              <label className="col-span-7 text-[12px] text-[#625143]">Model</label>
              <label className="col-span-5 text-[12px] text-[#625143]">Quantity</label>

              <div className="col-span-7">
                <Select
                  value={rearSubsCfg?.model ?? "SUB2-12"}
                  disabled={disabled || (rearSubsCfg?.count ?? 0) === 0}
                  onValueChange={(model) => {
                    if (appState?.setRearSubsCfg) {
                      appState.setRearSubsCfg(prev => ({ ...prev, model }));
                    }
                  }}
                >
                  <SelectTrigger className="h-10 w-full px-3 justify-between bg-white border-[#DCDBD6]">
                    <SelectValue placeholder="Select model" className="text-2xl font-semibold" style={{ color: "#213428" }} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUB2-12">SUB2-12</SelectItem>
                    <SelectItem value="SUB3-12">SUB3-12</SelectItem>
                    <SelectItem value="SUB4-12">SUB4-12</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-5">
                <Select
                  value={String(rearSubsCfg?.count ?? 0)}
                  onValueChange={(v) => {
                    if (appState?.setRearSubsCfg) {
                      appState.setRearSubsCfg(prev => ({ ...prev, count: Number(v) }));
                    }
                  }}
                  disabled={!rearSubsCfg?.model}
                >
                  <SelectTrigger className="h-10 w-[90px] px-3 justify-between bg-white border-[#DCDBD6]">
                    <SelectValue placeholder="0" className="text-2xl font-semibold" style={{ color: "#213428" }} />
                  </SelectTrigger>
                  <SelectContent align="end" className="w-[64px]">
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-12 mt-2">
                <label className="block text-[12px] text-[#625143] mb-1">Mount height</label>
                <Select
                  value={rearSubsCfg?.mountMode ?? "floor"}
                  onValueChange={(mountMode) => {
                    if (appState?.setRearSubsCfg) {
                      appState.setRearSubsCfg(prev => ({ ...prev, mountMode }));
                    }
                  }}
                >
                  <SelectTrigger className="h-10 w-full bg-white border-[#DCDBD6]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="floor">Floor mount — bottom 10 cm</SelectItem>
                    <SelectItem value="wall">Wall mount — bottom 80 cm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              </div>

              {rearSubsCfg?.model === "SUB4-12" && (
              <div className="col-span-12 mt-3 flex items-center gap-3">
                <label className="shrink-0 text-[12px] text-[#625143]">Orientation</label>
                <div className="relative z-10 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (appState?.setRearSubsCfg) {
                        appState.setRearSubsCfg(prev => ({ ...prev, orientation: "vertical" }));
                      }
                    }}
                    className={`cursor-pointer pointer-events-auto relative z-10 shrink-0 px-3 py-1 text-[12px] rounded border ${
                      (rearSubsCfg?.orientation ?? "vertical") === "vertical"
                        ? "bg-[#213428] text-white border-[#213428]"
                        : "bg-white text-[#213428] border-[#DCDBD6]"
                    }`}
                    >
                     Vertical
                    </button>
                    <button
                     type="button"
                     onClick={() => {
                       if (appState?.setRearSubsCfg) {
                         appState.setRearSubsCfg(prev => ({ ...prev, orientation: "horizontal" }));
                       }
                     }}
                     className={`cursor-pointer pointer-events-auto relative z-10 shrink-0 px-3 py-1 text-[12px] rounded border ${
                       (rearSubsCfg?.orientation ?? "vertical") === "horizontal"
                         ? "bg-[#213428] text-white border-[#213428]"
                         : "bg-white text-[#213428] border-[#DCDBD6]"
                     }`}
                    >
                     Horizontal
                    </button>
                </div>
              </div>
            )}

            {subWarnings?.rear?.length > 0 && (
              <div className="mt-2 text-xs px-2 py-1 rounded bg-orange-50 text-orange-700 border border-orange-200">
                {subWarnings.rear[0]}
              </div>
            )}
          </div>

          <div className="col-span-12 mt-4 border-t border-[#DCDBD6] pt-4">
            <h4 className="text-[15px] font-semibold text-[#1B1A1A] mb-3">Subwoofer Placement</h4>
            <div className="rounded-lg border border-[#E7E4DF] bg-white/70 overflow-hidden">
              <div className="grid grid-cols-12 gap-0 border-b border-[#E7E4DF] bg-[#F7F4F0] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#625143]">
                <div className="col-span-7">Placement Preset</div>
                <div className="col-span-5 grid grid-cols-2 gap-4 text-center">
                  <div>Front Wall</div>
                  <div>Rear Wall</div>
                </div>
              </div>

              {placementOptions.map((option, index) => (
                <div
                  key={option.mode}
                  className={`grid grid-cols-12 items-center gap-4 px-4 py-3 ${index !== placementOptions.length - 1 ? 'border-b border-[#E7E4DF]' : ''}`}
                >
                  <div className="col-span-12 md:col-span-7 flex items-center gap-3">
                    <div className="shrink-0">{option.diagram}</div>
                    <div>
                      <div className="text-[13px] font-medium text-[#1B1A1A]">{option.title}</div>
                      <div className="text-[11px] text-[#625143] leading-snug">{option.description}</div>
                    </div>
                  </div>

                  <div className="col-span-12 md:col-span-5 grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-center">
                      <Switch
                        checked={(frontSubsCfg?.placementMode ?? 'default') === option.mode}
                        onCheckedChange={(checked) => {
                          if (appState?.setFrontSubsCfg) {
                            appState.setFrontSubsCfg(prev => ({
                              ...prev,
                              placementMode: checked ? option.mode : 'default'
                            }));
                          }
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <Switch
                        checked={(rearSubsCfg?.placementMode ?? 'default') === option.mode}
                        onCheckedChange={(checked) => {
                          if (appState?.setRearSubsCfg) {
                            appState.setRearSubsCfg(prev => ({
                              ...prev,
                              placementMode: checked ? option.mode : 'default'
                            }));
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </CollapsiblePanel>
  );
}