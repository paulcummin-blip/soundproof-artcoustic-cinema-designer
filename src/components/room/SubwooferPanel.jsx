import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';
import HeightInput from '@/components/ui/HeightInput';
import BassResultBlock from '@/components/room/bass/BassResultBlock';
import BassTerminalStatus from '@/components/room/bass/BassTerminalStatus';
import BassPostCalculationActions from '@/components/room/bass/BassPostCalculationActions';
import BassPermanentPills from '@/components/room/bass/BassPermanentPills';
import BassPermanentSeatResults from '@/components/room/bass/BassPermanentSeatResults';
import CalculateAllTargetResults from '@/components/room/bass/CalculateAllTargetResults';
import { useSharedBassResults } from '@/components/room/bass/bassResultsStore';
import BassTargetLevelControl from '@/components/room/bass/BassTargetLevelControl';
import BestSubLayoutGuide from '@/components/room/bass/best-layout/BestSubLayoutGuide';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { subwooferModelKey, subwooferDisplayLabel } from '@/components/utils/subwooferDisplayLabel';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { useActiveProjectId } from '@/components/state/project-session';
import { resolveBestSubLayoutContextId } from '@/components/room/bass/best-layout/bestSubLayoutContext';
import { useSubwooferCompatibilityActions } from '@/components/hooks/useSubwooferCompatibilityActions';

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
  const compat = useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg);
  const sharedBassResults = useSharedBassResults();
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

  // No hidden fallback model: bass results only render once a subwoofer model
  // is genuinely selected and enabled. Until then show a quiet waiting state
  // instead of premature P14/P18/P19/P20 pills.
  const hasActiveSubModel = useMemo(() => {
    const instances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
    return instances.some((i) => i?.enabled !== false && i?.model);
  }, [appState?.subwooferInstances]);
  const bassAuthorityStatus = sharedBassResults?.completedBassAuthority?.authorityStatus || 'UNCALCULATED';
  const hasPreviousBassResult = !!sharedBassResults?.completedBassAuthority?.staleContract;
  const bassCalculationInProgress = sharedBassResults?.calculationInProgress === true;
  const bassCalculationPhaseLabel = sharedBassResults?.calculationPhaseLabel || null;
  const bassActionLabel = sharedBassResults?.hasCurrentResult || hasPreviousBassResult || bassAuthorityStatus === 'STALE'
    ? 'Recalculate Parameter Results'
    : 'Calculate Parameter Results';
  const bassActionDisabled = disabled
    || !hasActiveSubModel
    || sharedBassResults?.canCalculate !== true
    || bassCalculationInProgress;

  return (
    <CollapsiblePanel title="Subwoofers" defaultOpen={false}>
      <div className="rounded-none border border-[#E7E4DF] bg-[#F7F4F0]/40 px-4 py-4">
        <BestSubLayoutGuide
          roomDims={roomDimensions}
          seatingPositions={seats}
          rspPosition={rspPosition}
          sourceHeights={{ front: frontSubsCfg?.bottomHeightM, rear: rearSubsCfg?.bottomHeightM }}
          contextId={layoutContextId}
          roomElements={appState?.roomElements}
          currentSubs={appState?.subwoofers}
          frontSubsCfg={frontSubsCfg}
          rearSubsCfg={rearSubsCfg}
          subwooferInstances={appState?.subwooferInstances}
          commitInstances={compat.commitInstances}
          hasCanonicalInstances={compat.hasCanonicalInstances}
        />
        <div className="grid grid-cols-12 gap-x-4 gap-y-3">
          <div className="col-span-12 md:col-span-6">
            <h4 className="text-[15px] font-semibold text-[#1B1A1A] mb-2">Front Subwoofers</h4>
            <div className="grid grid-cols-12 items-end gap-x-3 gap-y-2">
              <label className="col-span-7 text-[12px] text-[#625143]">Model</label>
              <label className="col-span-5 text-[12px] text-[#625143]">Quantity</label>

              <div className="col-span-7">
                <Select
                  value={compat.frontModelDisplay ?? undefined}
                  disabled={disabled || !compat.hasCanonicalInstances}
                  onValueChange={(model) => {
                    if (model === "__mixed__") return;
                    compat.setFrontSubModel(model);
                  }}
                >
                  <SelectTrigger className="h-10 w-full px-3 justify-between bg-white border-[#DCDBD6]">
                    <SelectValue placeholder="Select subwoofer model" className="text-2xl font-semibold" style={{ color: "#213428" }}>
                      {compat.frontModelDisplay ? (compat.frontModelDisplay === "__mixed__" ? "Mixed" : subwooferDisplayLabel(compat.frontModelDisplay)) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__mixed__" disabled>Mixed</SelectItem>
                    <SelectItem value="sub2-12">{subwooferDisplayLabel("sub2-12")}</SelectItem>
                    <SelectItem value="sub3-12">{subwooferDisplayLabel("sub3-12")}</SelectItem>
                    <SelectItem value="sub4-12">{subwooferDisplayLabel("sub4-12")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-5">
                <Select
                  value={String(compat.frontCount ?? 0)}
                  disabled={disabled || !compat.hasCanonicalInstances}
                  onValueChange={(v) => {
                    compat.setFrontSubCount(Number(v));
                  }}
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
                  disabled={disabled || !compat.hasCanonicalInstances}
                  onChange={(raw) => {
                    const clamped = Math.max(0, Math.min(2.5, raw));
                    compat.setFrontBottomHeight(clamped);
                  }}
                  className="h-10 w-full bg-white border-[#DCDBD6]"
                />
                {hasLcrSubClash && (
                  <p className="mt-1 text-xs font-medium text-red-600">⚠ Speaker and subwoofer clashing</p>
                )}
              </div>
              </div>

              {subwooferModelKey(frontSubsCfg?.model) === "sub4-12" && (
              <div className="col-span-12 mt-3 flex items-center gap-3">
                <label className="shrink-0 text-[12px] text-[#625143]">Orientation</label>
                <div className="relative z-10 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!compat.hasCanonicalInstances}
                    onClick={() => compat.setFrontOrientation("vertical")}
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
                    disabled={!compat.hasCanonicalInstances}
                    onClick={() => compat.setFrontOrientation("horizontal")}
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
                  value={compat.rearModelDisplay ?? undefined}
                  disabled={disabled || !compat.hasCanonicalInstances}
                  onValueChange={(model) => {
                    if (model === "__mixed__") return;
                    compat.setRearSubModel(model);
                  }}
                >
                  <SelectTrigger className="h-10 w-full px-3 justify-between bg-white border-[#DCDBD6]">
                    <SelectValue placeholder="Select subwoofer model" className="text-2xl font-semibold" style={{ color: "#213428" }}>
                      {compat.rearModelDisplay ? (compat.rearModelDisplay === "__mixed__" ? "Mixed" : subwooferDisplayLabel(compat.rearModelDisplay)) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__mixed__" disabled>Mixed</SelectItem>
                    <SelectItem value="sub2-12">{subwooferDisplayLabel("sub2-12")}</SelectItem>
                    <SelectItem value="sub3-12">{subwooferDisplayLabel("sub3-12")}</SelectItem>
                    <SelectItem value="sub4-12">{subwooferDisplayLabel("sub4-12")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-5">
                <Select
                  value={String(compat.rearCount ?? 0)}
                  disabled={disabled || !compat.hasCanonicalInstances}
                  onValueChange={(v) => {
                    compat.setRearSubCount(Number(v));
                  }}
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
                  disabled={disabled || !compat.hasCanonicalInstances}
                  onChange={(raw) => {
                    const clamped = Math.max(0, Math.min(2.5, raw));
                    compat.setRearBottomHeight(clamped);
                  }}
                  className="h-10 w-full bg-white border-[#DCDBD6]"
                />
              </div>
              </div>

              {subwooferModelKey(rearSubsCfg?.model) === "sub4-12" && (
              <div className="col-span-12 mt-3 flex items-center gap-3">
                <label className="shrink-0 text-[12px] text-[#625143]">Orientation</label>
                <div className="relative z-10 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!compat.hasCanonicalInstances}
                    onClick={() => compat.setRearOrientation("vertical")}
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
                    disabled={!compat.hasCanonicalInstances}
                    onClick={() => compat.setRearOrientation("horizontal")}
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
            {/* P14/P18 target controls — kept visually with the parameter pills */}
            <div className="mb-4 rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4">
              <BassTargetLevelControl disabled={disabled} />
            </div>

            {/* Permanent P14/P18/P19/P20 parameter pills */}
            <BassPermanentPills />

            {/* Permanent P19/P20 per-seat results — always visible beneath the pills */}
            <BassPermanentSeatResults />

            {/* Calculate Parameter Results — calculates only the currently selected target */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => sharedBassResults?.onCalculate?.()}
                disabled={bassActionDisabled}
                className="w-full rounded-lg bg-[#213428] px-4 py-3 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              >
                {bassCalculationInProgress ? (bassCalculationPhaseLabel || 'Calculating target results…') : bassActionLabel}
                </button>
              {!hasActiveSubModel && (
                <p className="mt-2 text-[11px] text-[#625143]">Select a subwoofer model and quantity before calculating.</p>
              )}
              {bassAuthorityStatus === 'STALE' && (
                <p className="mt-2 text-[11px] font-medium text-amber-700">Previous result needs recalculation — press Calculate to update.</p>
              )}
            </div>

            {/* Calculate All P18 Results — explicit heavy processing of all 8 P14 targets */}
            <div className="mt-2">
              <CalculateAllTargetResults disabled={disabled || !hasActiveSubModel} />
            </div>

            {/* Terminal status + detailed result block (shown when a verified result exists) */}
            <BassTerminalStatus />
            {sharedBassResults?.hasCurrentResult && !sharedBassResults?.calculationInProgress && (
              <BassResultBlock />
            )}

            {/* Improve Bass Response — placement and quantity optimisation */}
            <BassPostCalculationActions
              roomDims={roomDimensions}
              seatingPositions={seats}
              currentSubs={appState?.subwoofers}
              sourceHeightM={frontSubsCfg?.bottomHeightM ?? rearSubsCfg?.bottomHeightM}
              frontSubsCfg={frontSubsCfg}
              rearSubsCfg={rearSubsCfg}
              subwooferInstances={appState?.subwooferInstances}
              commitInstances={compat.commitInstances}
              hasCanonicalInstances={compat.hasCanonicalInstances}
            />
          </div>

          <div className="col-span-12 mt-4 border-t border-[#DCDBD6] pt-4">
            <div className="rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h5 className="text-[14px] font-semibold text-[#1B1A1A]">Show Room Mode Guide</h5>
                  <p className="text-[11px] text-[#625143] leading-relaxed mt-1">
                    Shows the approximate node positions of the first axial room modes. These are design guides, not predicted bass nulls.
                  </p>
                </div>
                <Switch
                  checked={!!appState?.showRoomModesOverlay}
                  onCheckedChange={(checked) => appState?.setShowRoomModesOverlay?.(checked)}
                />
              </div>

              {appState?.showRoomModesOverlay && (
                <div className="mt-3 rounded-lg border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3">
                  <h6 className="text-[12px] font-semibold text-[#1B1A1A] mb-1.5">Understanding Room Modes</h6>
                  <p className="text-[11px] text-[#625143] leading-relaxed mb-2">
                    Room modes are natural low-frequency pressure patterns created by the room dimensions. The shaded guides show positions that may be more sensitive to individual axial modes. They do not mean that every seat within these areas will experience a bass null.
                  </p>
                  <p className="text-[11px] text-[#625143] leading-relaxed mb-2">
                    The final bass response is determined by the combination of all active subwoofers, their positions, the seating positions and the interaction of multiple room modes. Use this guide alongside the predicted bass response when comparing layouts.
                  </p>
                  <p className="text-[11px] font-medium text-[#1B1A1A] leading-relaxed mb-0.5">Design principle:</p>
                  <p className="text-[11px] text-[#625143] leading-relaxed">
                    Multiple subwoofers in complementary locations can significantly improve bass consistency across the seating area. Deep cancellations are normally addressed through subwoofer or seating placement rather than large EQ boosts.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </CollapsiblePanel>
  );
}