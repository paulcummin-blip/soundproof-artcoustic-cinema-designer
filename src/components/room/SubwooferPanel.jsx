import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';

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
            </div>

            {frontSubsCfg?.model === "SUB4-12" && (
              <div className="col-span-12 mt-3 flex items-center gap-3">
                <label className="text-[12px] text-[#625143]">Orientation</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (appState?.setFrontSubsCfg) {
                        appState.setFrontSubsCfg(prev => ({ ...prev, orientation: "vertical" }));
                      }
                    }}
                    className={`px-3 py-1 text-[12px] rounded border ${
                      (frontSubsCfg?.orientation ?? "vertical") === "vertical"
                        ? "bg-[#213428] text-white border-[#213428]"
                        : "bg-white text-[#213428] border-[#DCDBD6]"
                    }`}
                  >
                    Vertical
                  </button>
                  <button
                    onClick={() => {
                      if (appState?.setFrontSubsCfg) {
                        appState.setFrontSubsCfg(prev => ({ ...prev, orientation: "horizontal" }));
                      }
                    }}
                    className={`px-3 py-1 text-[12px] rounded border ${
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
            </div>

            {rearSubsCfg?.model === "SUB4-12" && (
              <div className="col-span-12 mt-3 flex items-center gap-3">
                <label className="text-[12px] text-[#625143]">Orientation</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (appState?.setRearSubsCfg) {
                        appState.setRearSubsCfg(prev => ({ ...prev, orientation: "vertical" }));
                      }
                    }}
                    className={`px-3 py-1 text-[12px] rounded border ${
                      (rearSubsCfg?.orientation ?? "vertical") === "vertical"
                        ? "bg-[#213428] text-white border-[#213428]"
                        : "bg-white text-[#213428] border-[#DCDBD6]"
                    }`}
                  >
                    Vertical
                  </button>
                  <button
                    onClick={() => {
                      if (appState?.setRearSubsCfg) {
                        appState.setRearSubsCfg(prev => ({ ...prev, orientation: "horizontal" }));
                      }
                    }}
                    className={`px-3 py-1 text-[12px] rounded border ${
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
        </div>
      </div>
    </CollapsiblePanel>
  );
}