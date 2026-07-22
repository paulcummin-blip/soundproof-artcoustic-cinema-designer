import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';
import HeightInput from '@/components/ui/HeightInput';
import BassResultsSummary from '@/components/room/bass/BassResultsSummary';
import P14TargetBasisControl from '@/components/room/bass/P14TargetBasisControl';
import BestSubLayoutGuide from '@/components/room/bass/best-layout/BestSubLayoutGuide';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { useActiveProjectId } from '@/components/state/project-session';
import { resolveBestSubLayoutContextId } from '@/components/room/bass/best-layout/bestSubLayoutContext';

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}

function hasFrontLcrSubClash({ speakers, frontSubs, frontSubsCfg }) {
  const lcrRoles = new Set(['FL', 'FC', 'FR', 'FCL', 'FCR']);
  const lcrRects = (Array.isArray(speakers) ? speakers : [])
    .filter((speaker) => lcrRoles.has(getCanonicalRole(speaker?.role)))
    .map((speaker) => {
      const x = Number(speaker?.position?.x);
      const z = Number(speaker?.position?.z);
      const meta = getSpeakerModelMeta(speaker?.model);
      const width = Number(meta?.widthM);
      const height = Number(meta?.heightM);
      if (![x, z, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
      return { left: x - width / 2, right: x + width / 2, bottom: z - height / 2, top: z + height / 2 };
    })
    .filter(Boolean);

  const frontSubRects = (Array.isArray(frontSubs) ? frontSubs : [])
    .filter((sub) => sub?.group === 'front' || String(sub?.role || '').toUpperCase().startsWith('SUBF'))
    .map((sub) => {
      const x = Number.isFinite(Number(sub?.position?.x)) ? Number(sub.position.x) : Number(sub?.x);
      const bottom = Number.isFinite(Number(sub?.bottomHeightM))
        ? Number(sub.bottomHeightM)
        : Number.isFinite(Number(frontSubsCfg?.bottomHeightM))
          ? Number(frontSubsCfg.bottomHeightM)
          : 0.05;
      const model = sub?.model || frontSubsCfg?.model;
      const orientation = sub?.orientation || frontSubsCfg?.orientation;
      const meta = getSpeakerModelMeta(model, orientation);
      const width = Number(meta?.widthM);
      const height = Number(meta?.heightM);
      if (![x, bottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
      return { left: x - width / 2, right: x + width / 2, bottom, top: bottom + height };
    })
    .filter(Boolean);

  if (lcrRects.length === 0 || frontSubRects.length === 0) return false;
  return lcrRects.some((lcrRect) => frontSubRects.some((subRect) => rectsOverlap(lcrRect, subRect)));
}

export default function SubwooferPanel({ appState, disabled, frontSubsCfg, rearSubsCfg, subWarnings }) {
  const roomDimensions = appState?.roomDims;
  const seats = appState?.seatingPositions;
  const activeProjectId = useActiveProjectId();
  const layoutContextId = resolveBestSubLayoutContextId({ projectId: activeProjectId, roomDims: roomDimensions });
  const hasLcrSubClash = useMemo(() => hasFrontLcrSubClash({
    speakers: appState?.speakerSystem?.placedSpeakers,
    frontSubs: appState?.subwoofers,
    frontSubsCfg,
  }), [appState?.speakerSystem?.placedSpeakers, appState?.subwoofers, frontSubsCfg]);

  const rspPosition = useMemo(() => {
    const appRsp = appState?.mlp;
    if (Number.isFinite(appRsp?.x) && Number.isFinite(appRsp?.y)) return appRsp;
    const widthM = Number(roomDimensions?.widthM ?? roomDimensions?.width);
    const y = Number(appState?.mlpY_m);
    return Number.isFinite(widthM) && Number.isFinite(y) ? { x: widthM / 2, y, z: 1.2 } : null;
  }, [appState?.mlp, appState?.mlpY_m, roomDimensions]);

  return (
    <CollapsiblePanel title="Subwoofers" defaultOpen={false}>
      <div className="rounded-none border border-[#E7E4DF] bg-[#F7F4F0]/40 px-4 py-4">
        <div className="mb-3">
          <BassResultsSummary />
        </div>
        <div className="mb-4 rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4">
          <P14TargetBasisControl disabled={disabled} />
        </div>
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
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-12 mt-2">
                <label className="block text-[12px] text-[#625143] mb-1">Sub bottom height (m)</label>
                <HeightInput
                  value={frontSubsCfg?.bottomHeightM ?? (frontSubsCfg?.mountMode === "wall" ? 0.80 : 0.05)}
                  onChange={(raw) => {
                    if (appState?.setFrontSubsCfg) {
                      appState.setFrontSubsCfg(prev => ({
                        ...prev,
                        bottomHeightM: Math.max(0, Math.min(2.5, raw))
                      }));
                    }
                  }}
                  className="h-10 w-full bg-white border-[#DCDBD6]"
                />
                {hasLcrSubClash && (
                  <p className="mt-1 text-xs font-medium text-red-600">⚠ Speaker and subwoofer clashing</p>
                )}
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
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-12 mt-2">
                <label className="block text-[12px] text-[#625143] mb-1">Sub bottom height (m)</label>
                <HeightInput
                  value={rearSubsCfg?.bottomHeightM ?? (rearSubsCfg?.mountMode === "wall" ? 0.80 : 0.05)}
                  onChange={(raw) => {
                    if (appState?.setRearSubsCfg) {
                      appState.setRearSubsCfg(prev => ({
                        ...prev,
                        bottomHeightM: Math.max(0, Math.min(2.5, raw))
                      }));
                    }
                  }}
                  className="h-10 w-full bg-white border-[#DCDBD6]"
                />
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
            <div className="rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h5 className="text-[14px] font-semibold text-[#1B1A1A]">Show Room Modes</h5>
                  <p className="text-[11px] text-[#625143] leading-relaxed mt-1">
                    Shows predicted low-frequency cancellation zones on the room plan.
                  </p>
                </div>
                <Switch
                  checked={!!appState?.showRoomModesOverlay}
                  onCheckedChange={(checked) => appState?.setShowRoomModesOverlay?.(checked)}
                />
              </div>
            </div>

            <BestSubLayoutGuide
              roomDims={roomDimensions}
              seatingPositions={seats}
              rspPosition={rspPosition}
              sourceHeights={{ front: frontSubsCfg?.bottomHeightM, rear: rearSubsCfg?.bottomHeightM }}
              contextId={layoutContextId}
            />
          </div>
        </div>
      </div>
    </CollapsiblePanel>
  );
}