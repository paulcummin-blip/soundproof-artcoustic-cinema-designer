import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';
import optimiseSubwooferLayout from '@/components/room/bass/SubwooferOptimiser';

const placementModeLabels = {
  quarter: '1/4 Points',
  corners: 'Corners',
  midpoint: 'Midpoint',
  sixth: '1/6 – 5/6 Positions',
  asymmetric: 'Asymmetric',
};

function getWallLayoutLabel(wallConfig) {
  if (wallConfig === 'front+rear') return 'Front + Rear';
  if (wallConfig === 'front') return 'Front only';
  if (wallConfig === 'rear') return 'Rear only';
  return '—';
}

function getQuantityLabel(quantity) {
  const total = typeof quantity === 'object' && quantity
    ? (Number(quantity.front) || 0) + (Number(quantity.rear) || 0)
    : (Number(quantity) || 0);

  return `${total} ${total === 1 ? 'sub' : 'subs'}`;
}


function getGrade(seatVariation, nullPenalty) {
  if (seatVariation > 10 || nullPenalty >= 4) {
    return { label: 'Not recommended', className: 'text-red-700' };
  }
  if (seatVariation < 3 && nullPenalty === 0) {
    return { label: 'A+', className: 'text-[#213428]' };
  }
  if (seatVariation < 3) {
    return { label: 'A', className: 'text-green-700' };
  }
  if (seatVariation < 6) {
    return { label: 'B', className: 'text-amber-700' };
  }
  if (seatVariation <= 10) {
    return { label: 'C', className: 'text-orange-700' };
  }
  return { label: 'Not recommended', className: 'text-red-700' };
}

function isSameLayout(result, frontSubsCfg, rearSubsCfg) {
  if (!result) return false;
  const wallConfig = result.wallConfig;
  const placementMode = result.placementMode;
  const quantity = result.quantity;

  if (wallConfig === 'front') {
    return (frontSubsCfg?.placementMode ?? 'default') === placementMode
      && Number(frontSubsCfg?.count ?? 0) === Number(quantity)
      && Number(rearSubsCfg?.count ?? 0) === 0;
  }

  if (wallConfig === 'rear') {
    return (rearSubsCfg?.placementMode ?? 'default') === placementMode
      && Number(rearSubsCfg?.count ?? 0) === Number(quantity)
      && Number(frontSubsCfg?.count ?? 0) === 0;
  }

  if (wallConfig === 'front+rear') {
    return (frontSubsCfg?.placementMode ?? 'default') === placementMode
      && (rearSubsCfg?.placementMode ?? 'default') === placementMode
      && Number(frontSubsCfg?.count ?? 0) === Number(quantity?.front)
      && Number(rearSubsCfg?.count ?? 0) === Number(quantity?.rear);
  }

  return false;
}

function applyRecommendedLayout(result, appState) {
  if (!result || !appState?.setFrontSubsCfg || !appState?.setRearSubsCfg) return;

  if (result.wallConfig === 'front') {
    appState.setFrontSubsCfg((prev) => ({
      ...prev,
      count: Number(result.quantity) || 0,
      placementMode: result.placementMode,
      positions: [],
    }));
    appState.setRearSubsCfg((prev) => ({
      ...prev,
      count: 0,
      positions: [],
    }));
    return;
  }

  if (result.wallConfig === 'rear') {
    appState.setRearSubsCfg((prev) => ({
      ...prev,
      count: Number(result.quantity) || 0,
      placementMode: result.placementMode,
      positions: [],
    }));
    appState.setFrontSubsCfg((prev) => ({
      ...prev,
      count: 0,
      positions: [],
    }));
    return;
  }

  if (result.wallConfig === 'front+rear') {
    appState.setFrontSubsCfg((prev) => ({
      ...prev,
      count: Number(result.quantity?.front) || 0,
      placementMode: result.placementMode,
      positions: [],
    }));
    appState.setRearSubsCfg((prev) => ({
      ...prev,
      count: Number(result.quantity?.rear) || 0,
      placementMode: result.placementMode,
      positions: [],
    }));
  }
}

export default function SubwooferPanel({ appState, disabled, frontSubsCfg, rearSubsCfg, subWarnings }) {
  const roomDimensions = appState?.roomDims;
  const seats = appState?.seatingPositions;

  const recommendationState = useMemo(() => {
    const hasRoom = Number.isFinite(Number(roomDimensions?.widthM ?? roomDimensions?.width))
      && Number.isFinite(Number(roomDimensions?.lengthM ?? roomDimensions?.length));
    const hasSeats = Array.isArray(seats) && seats.length > 0;

    if (!hasRoom || !hasSeats) {
      return {
        status: 'missing',
        message: 'Add room dimensions and seating positions to generate a recommendation.'
      };
    }

    try {
      const primaryResult = optimiseSubwooferLayout({
        roomDimensions,
        seats,
        frontSubsCfg,
        rearSubsCfg
      });

      const rankedResults = Array.isArray(primaryResult?.rankedResults) ? primaryResult.rankedResults : [];
      const currentMatchesAny = rankedResults.some((result) => isSameLayout(result, frontSubsCfg, rearSubsCfg));

      return {
        status: primaryResult?.bestLayout ? 'ready' : 'empty',
        result: primaryResult,
        rankedResults,
        currentMatchesAny,
      };
    } catch (error) {
      console.error('[SubwooferPanel] Recommendation failed', error);
      return {
        status: 'error',
        message: 'Recommendation could not be calculated.'
      };
    }
  }, [roomDimensions, seats, frontSubsCfg, rearSubsCfg]);

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
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
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
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
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

            <div className="mt-4 rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4">
              <h5 className="text-[14px] font-semibold text-[#1B1A1A]">Best Sub Layout Shortcut</h5>
              <p className="text-[11px] text-[#625143] leading-relaxed mt-1 mb-3">
                This shortcut compares common subwoofer locations against the seating layout to find the least destructive modal result. It is a design guide, not the RP22 report.
              </p>

              {recommendationState.status === 'missing' && (
                <p className="text-[12px] text-[#625143] leading-relaxed">
                  {recommendationState.message}
                </p>
              )}

              {recommendationState.status === 'error' && (
                <p className="text-[12px] text-[#625143] leading-relaxed">
                  Recommendation could not be calculated.
                </p>
              )}

              {recommendationState.status === 'empty' && (
                <p className="text-[12px] text-[#625143] leading-relaxed">
                  Recommendation could not be calculated.
                </p>
              )}

              {recommendationState.status === 'ready' && (
                <div className="space-y-3">
                  {(recommendationState.rankedResults || []).map((result, index) => {
                    const seatVariance = Number(result.seatVariance ?? result.seatVariation ?? 0);
                    const nullPenalty = Number(result.nullPenalty ?? 0);
                    const modalRiskLabel =
                      result.nullPenalty >= 2
                        ? 'Avoid'
                        : result.nullPenalty === 1
                        ? 'Uneven'
                        : Number(result.seatVariance ?? 0) < 1.5
                        ? 'Even'
                        : Number(result.seatVariance ?? 0) < 3
                        ? 'Some variation'
                        : 'Uneven';
                    const grade = getGrade(seatVariance, nullPenalty);
                    const isBest = index === 0;
                    const isCurrent = isSameLayout(result, frontSubsCfg, rearSubsCfg);

                    return (
                      <button
                        type="button"
                        key={`${result.wallConfig}-${result.placementMode}-${JSON.stringify(result.quantity)}`}
                        onClick={() => applyRecommendedLayout(result, appState)}
                        className={`w-full rounded-lg px-4 py-3 text-left transition-colors cursor-pointer hover:bg-[#ECE8E0] ${isBest ? 'border-2 border-[#213428] bg-[#F3F1EC]' : 'border border-[#E7E4DF] bg-white'}`}
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-start gap-3">
                            <div className={`text-[24px] leading-none font-semibold ${grade.className}`}>{grade.label}</div>
                            <div className="flex flex-wrap items-center gap-2">
                              {isBest && (
                                <span className="rounded-full bg-[#213428] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-white">
                                  Recommended
                                </span>
                              )}
                              {isCurrent && (
                                <span className="rounded-full border border-[#CFC8BE] bg-[#F7F4F0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#625143]">
                                  Current layout
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.04em] text-[#625143]">Layout</div>
                              <div className="text-[13px] font-medium text-[#1B1A1A] mt-1">{getWallLayoutLabel(result.wallConfig)}</div>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.04em] text-[#625143]">Placement mode</div>
                              <div className="text-[13px] font-medium text-[#1B1A1A] mt-1">{placementModeLabels[result.placementMode] || result.placementMode}</div>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.04em] text-[#625143]">Quantity</div>
                              <div className="text-[13px] font-medium text-[#1B1A1A] mt-1">{getQuantityLabel(result.quantity)}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 pt-1">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.04em] text-[#625143]">Seat variation</div>
                              <div className="text-[12px] text-[#1B1A1A] mt-1">{seatVariance.toFixed(1)} dB</div>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.04em] text-[#625143]">Major nulls</div>
                              <div className="text-[12px] text-[#1B1A1A] mt-1">{nullPenalty}</div>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.04em] text-[#625143]">Modal risk</div>
                              <div className="text-[12px] text-[#1B1A1A] mt-1">{modalRiskLabel}</div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {!recommendationState.currentMatchesAny && (
                    <p className="text-[11px] text-[#625143] leading-relaxed">
                      Current layout is predicted to perform worse than the recommended option.
                    </p>
                  )}

                  <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0] px-3 py-2 text-[11px] text-[#8A7B6A]">
                    Click a layout above to apply it to the room.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </CollapsiblePanel>
  );
}