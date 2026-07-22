import React, { Suspense, useState } from "react";
import { Ruler, Monitor, Users, Speaker, Waves, Box, FileText } from "lucide-react";
import { calculateViewingAngle, assignRP23Level } from "@/components/utils/viewingAngleUtils";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";
import SpeakerPositionsReadout from "@/components/room/SpeakerPositionsReadout";
import RP22CompliancePanel from "@/components/rp22/RP22CompliancePanel";
import OptionsPanel from "@/components/roomdesigner/OptionsPanel";

const RoomDimensions = React.lazy(() =>
  import("@/components/room/RoomDimensions").then((m) => ({ default: m.default ?? m.RoomDimensions }))
);
const ScreenConfiguration = React.lazy(() =>
  import("@/components/room/ScreenConfiguration").then((m) => ({ default: m.default ?? m.ScreenConfiguration }))
);
const SeatingLayout = React.lazy(() =>
  import("@/components/room/SeatingLayout").then((m) => ({ default: m.default ?? m.SeatingLayout }))
);
const SpeakerPlacement = React.lazy(() =>
  import("@/components/room/SpeakerPlacement").then((m) => ({ default: m.default ?? m.SpeakerPlacement }))
);
const RoomElements = React.lazy(() =>
  import("@/components/room/RoomElements").then((m) => ({ default: m.default ?? m.RoomElements }))
);
const BassResponse = React.lazy(() =>
  import("@/components/room/BassResponse").then((m) => ({ default: m.default ?? m.BassResponse }))
);

const P18DebugPanel = React.lazy(() =>
  import("@/components/room/bass/P18DebugPanel").then((m) => ({ default: m.default ?? m.P18DebugPanel }))
);

const VIEW_BUTTONS = [['controls', 'CONTROLS'], ['isometric', 'ISOMETRIC'], ['data', 'DATA']];

function resolveProductLabel(rawModel) {
  if (!rawModel) return '—';
  const raw = String(rawModel);
  const meta = getSpeakerModelMeta(normaliseModelKey(raw)) || getSpeakerModelMeta(raw);
  if (meta?.label) return meta.label;
  // Fallback: strip _s suffix, replace dashes/underscores with spaces, title-case
  return raw.replace(/_s$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function DataSection({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#9B9890', textTransform: 'uppercase', padding: '6px 8px 4px', borderBottom: '1px solid #DCDBD6', marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DataRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', fontSize: 12 }}>
      <span style={{ color: '#625143', flex: '0 0 auto', marginRight: 8 }}>{label}</span>
      <span style={{ color: '#1B1A1A', fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value ?? '—'}</span>
    </div>
  );
}

export default function RoomDesignerControlsPanel({
  appState,
  isFrozen,
  // Room dims
  _roomDims,
  _setRoomDims,
  // Room elements
  roomElements,
  setRoomElementsGuarded,
  // Screen
  stableDimensions,
  _screen,
  setScreenGuarded,
  seatingPositions,
  dolbyPreset,
  // Seating
  handleGenerateSeating,
  _seatsPerRowByRow,
  setSeatsPerRowByRowGuarded,
  seatsPerRow,
  setSeatsPerRowGuarded,
  seatingRows,
  setSeatingRowsGuarded,
  seatSpacing,
  setSeatSpacingGuarded,
  _rowSpacingM,
  setRowSpacingGuarded,
  _seatingBlockOffset,
  setSeatingBlockOffsetGuarded,
  seatingArrangementBasis,
  setSeatingArrangementBasis,
  visualisationRef,
  showMlpRuler,
  setShowMlpRuler,
  // Speakers
  _sevenBedLayoutType,
  setSevenBedLayoutType,
  setDolbyPreset,
  lcrAimMode,
  setLcrAimMode,
  lcrAngleDeg,
  overheadGlobalModelFromState,
  setOverheadGlobalModelFromState,
  overheadFrontOverrideFromState,
  setOverheadFrontOverrideFromState,
  overheadMidOverrideFromState,
  setOverheadMidOverrideFromState,
  overheadRearOverrideFromState,
  setOverheadRearOverrideFromState,
  useFrontGlobalFromState,
  setUseFrontGlobalFromState,
  useMidGlobalFromState,
  setUseMidGlobalFromState,
  useRearGlobalFromState,
  setUseRearGlobalFromState,
  allSeatSplMetrics,
  updateGlobalSplWithProjectSync,
  frontWideZones,
  isNineBedLayout,
  speakerPositionsView,
  setSpeakerPositionsView,
  placedSpeakers,
  _seatingPositions,
  // Bass
  frontSubsCfg,
  setFrontSubsCfg,
  rearSubsCfg,
  setRearSubsCfg,
  subWarnings,
  frontSubsForRendering,
  rearSubsForRendering,
  // Report
  analysisResult,
  freeMoveLcr,
  // Options
  showPrices,
  setShowPrices,
  difficultyMultiplier,
  setDifficultyMultiplier,
  priceData,
  _frontSubsCfg,
  _rearSubsCfg,
  // RSP mode
  rspMode,
  onRspModeChange,
  manualRspY_m,
  onManualRspY_mChange,
}) {
  const [rightPanelView, setRightPanelView] = useState('controls');

  return (
    <aside className="relative z-30" style={{ minWidth: 0, minHeight: 0 }}>
      {/* Right panel view selector bar */}
      <div style={{ display: 'flex', gap: 2, padding: '6px 10px', borderBottom: '1px solid #DCDBD6', background: '#fff' }}>
        {VIEW_BUTTONS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setRightPanelView(key)}
            style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 6, border: rightPanelView === key ? '1px solid #213428' : '1px solid transparent', background: rightPanelView === key ? '#213428' : 'transparent', color: rightPanelView === key ? '#fff' : '#625143', cursor: 'pointer', transition: 'all 0.15s' }}
          >
            {label}
          </button>
        ))}
      </div>

      {rightPanelView === 'isometric' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 196px)', color: '#625143', fontSize: 14, fontWeight: 500 }}>
          Isometric view coming next
        </div>
      )}

      {rightPanelView === 'data' && (
        <div style={{ height: 'calc(100vh - 196px)', overflow: 'auto', padding: '12px 12px 24px' }}>
          <DataSection title="Room">
            <DataRow label="Width" value={stableDimensions?.widthM != null ? `${Number(stableDimensions.widthM).toFixed(2)} m` : '—'} />
            <DataRow label="Length" value={stableDimensions?.lengthM != null ? `${Number(stableDimensions.lengthM).toFixed(2)} m` : '—'} />
            <DataRow label="Height" value={stableDimensions?.heightM != null ? `${Number(stableDimensions.heightM).toFixed(2)} m` : '—'} />
            <DataRow label="Volume" value={
              stableDimensions?.widthM && stableDimensions?.lengthM && stableDimensions?.heightM
                ? `${(stableDimensions.widthM * stableDimensions.lengthM * stableDimensions.heightM).toFixed(1)} m³`
                : '—'
            } />
          </DataSection>

          <DataSection title="Screen">
            <DataRow label="Size" value={_screen?.visibleWidthInches ? `${Number(_screen.visibleWidthInches).toFixed(0)}"` : '—'} />
            <DataRow label="Aspect Ratio" value={_screen?.aspectRatio ?? '—'} />
            <DataRow label="Mount Mode" value={_screen?.mountMode ? (_screen.mountMode === 'baffle' ? 'Baffle Wall' : 'Floating') : '—'} />
            <DataRow label="Height from Floor" value={_screen?.heightFromFloorM != null ? `${Number(_screen.heightFromFloorM).toFixed(2)} m` : '—'} />
            <DataRow label="Screen Plane Depth" value={_screen?.floatDepthM != null ? `${Number(_screen.floatDepthM).toFixed(3)} m` : '—'} />
          </DataSection>

          <DataSection title="Seating">
            <DataRow label="Total Seats" value={Array.isArray(seatingPositions) ? seatingPositions.length : '—'} />
            <DataRow label="Rows" value={seatingRows ?? '—'} />
            <DataRow label="Row Spacing" value={_rowSpacingM != null ? `${Number(_rowSpacingM).toFixed(2)} m` : '—'} />
            <DataRow label="Seat Spacing" value={seatSpacing != null ? `${Number(seatSpacing).toFixed(2)} m` : '—'} />
            <DataRow label="Viewing Offset" value={_seatingBlockOffset != null ? `${Number(_seatingBlockOffset).toFixed(3)} m` : '—'} />
            <DataRow label="Dolby Layout" value={dolbyPreset ?? '—'} />
          </DataSection>

          <DataSection title="Speakers">
            <DataRow label="Speaker Count" value={Array.isArray(placedSpeakers) ? placedSpeakers.length : '—'} />
            <DataRow label="LCR Aim Mode" value={lcrAimMode ? (lcrAimMode === 'angled' ? 'Angled' : 'Flat') : '—'} />
            <DataRow label="LCR Angle" value={lcrAngleDeg != null ? `${Number(lcrAngleDeg).toFixed(1)}°` : '—'} />
            <DataRow label="7.x Bed Layout" value={_sevenBedLayoutType ? (_sevenBedLayoutType === 'wides' ? 'Front Wides' : 'Rear Surrounds') : '—'} />
          </DataSection>

          <DataSection title="Selected Speakers">
            {Array.isArray(placedSpeakers) && placedSpeakers.length > 0 ? placedSpeakers.map((spk, i) => {
              const role = spk?.role ?? spk?.id ?? '—';
              const rawModel = spk?.model ?? spk?.spec?.model ?? null;
              const modelDisplay = rawModel ? resolveProductLabel(rawModel) : null;
              const label = modelDisplay ? `${role} — ${modelDisplay}` : role;
              const x = spk?.x != null ? Number(spk.x).toFixed(2) : null;
              const y = spk?.y != null ? Number(spk.y).toFixed(2) : null;
              const z = spk?.z != null ? Number(spk.z).toFixed(2) : null;
              const pos = (x != null && y != null && z != null) ? `x ${x} · y ${y} · z ${z}` : '—';
              return <DataRow key={i} label={label} value={pos} />;
            }) : <DataRow label="No speakers placed" value="—" />}
          </DataSection>

          <DataSection title="Subwoofers">
            <DataRow label="Front Sub Count" value={Array.isArray(frontSubsForRendering) ? frontSubsForRendering.length : '—'} />
            <DataRow label="Front Sub Model" value={resolveProductLabel(frontSubsCfg?.model)} />
            <DataRow label="Rear Sub Count" value={Array.isArray(rearSubsForRendering) ? rearSubsForRendering.length : '—'} />
            <DataRow label="Rear Sub Model" value={resolveProductLabel(rearSubsCfg?.model)} />
          </DataSection>

          <DataSection title="RP22 Summary">
            {(() => {
              const primary = analysisResult?.gradedParameters?.primary || {};
              // Per-seat data for the synthetic RSP/MLP seat
              const mlpSeat = analysisResult?.perSeatRp22?.['mlp']?.rp22 || {};

              // Helper: resolve value from primary (room-scope) first, then per-seat MLP
              const resolve = (num, seatFallback = false) => {
                const roomP = primary[num];
                // Room-scope params: use primary directly
                if (!seatFallback) {
                  if (!roomP || roomP.status === 'no_data') return null;
                  return roomP;
                }
                // Seat-scope: prefer mlpSeat, fallback to primary
                const seatP = mlpSeat[num];
                if (seatP) return seatP;
                if (roomP && roomP.status !== 'no_data') return roomP;
                return null;
              };

              const fmt = (p, num) => {
                if (!p) return null;
                const level = p.level ?? null;
                // Use formatted string if present
                if (p.formatted && p.formatted !== '—') {
                  return level != null ? `${level} · ${p.formatted}` : p.formatted;
                }
                // Fallback: build from value + unit
                const val = p.value != null ? `${p.value}${p.unit ? ' ' + p.unit : ''}` : null;
                if (level != null) return val ? `${level} · ${val}` : String(level);
                return val;
              };

              const NOT_CALC = 'Not Yet Calculated';

              // Seat-scope parameter numbers
              const SEAT_SCOPE = new Set([1, 4, 5, 6, 9, 10, 16, 17]);

              const params = [
                { num: 1,  label: 'P1 — Min. Distance, Listening Area to Walls' },
                { num: 2,  label: 'P2 — Decoder/Renderer & Speaker Config' },
                { num: 3,  label: 'P3 — Screen Wall Speakers Outside Zones' },
                { num: 4,  label: 'P4 — Max SPL Difference, Screen Speakers' },
                { num: 5,  label: 'P5 — Max Horizontal Angle, Adjacent Surrounds' },
                { num: 6,  label: 'P6 — Max SPL Difference, Surround Speakers' },
                { num: 7,  label: 'P7 — Front Wide Horizontal Deviation' },
                { num: 8,  label: 'P8 — Upfiring/Elevation Speakers Allowed' },
                { num: 9,  label: 'P9 — Max Vertical Angle, Adjacent Upper Speakers' },
                { num: 10, label: 'P10 — Max SPL Difference, Upper Speakers' },
                { num: 11, label: 'P11 — Surround/Wide/Upper Speakers Outside Zones' },
                { num: 12, label: 'P12 — Screen Speakers SPL Capability at RSP' },
                { num: 13, label: 'P13 — Non-Screen Speakers SPL Capability at RSP' },
                { num: 14, label: 'P14 — LFE Total SPL Capability at RSP' },
                { num: 15, label: 'P15 — Background Noise Floor' },
                { num: 16, label: 'P16 — LCR Seat-to-Seat FR Variance (500Hz–16kHz)' },
                { num: 17, label: 'P17 — Surround/Wide/Upper Seat-to-Seat FR Variance' },
                { num: 18, label: 'P18 — In-Room Bass Extension −3 dB Cutoff' },
                { num: 19, label: 'P19 — FR Below Transition Frequency at RSP' },
                { num: 20, label: 'P20 — Seat-to-Seat FR Below Transition Frequency' },
                { num: 21, label: 'P21 — Early Reflections Level (0–15 ms, 1–8 kHz)' },
              ];

              if (!Object.keys(primary).length && !Object.keys(mlpSeat).length) {
                return <DataRow label="Status" value="No analysis data" />;
              }

              return params.map(({ num, label }) => {
                // P2: derive from dolby layout string directly
                if (num === 2) {
                  const layout = dolbyPreset || appState?.dolbyLayout || '';
                  const p2 = primary[2];
                  const level = p2?.level ?? null;
                  const display = layout
                    ? (level != null ? `${level} · ${layout}` : layout)
                    : NOT_CALC;
                  return <DataRow key={num} label={label} value={display} />;
                }
                // P8: upfiring/elevation speakers are never used in this app → always L4
                if (num === 8) {
                  return <DataRow key={num} label={label} value="L4 · No upfiring/elevation speakers" />;
                }
                const isSeatScope = SEAT_SCOPE.has(num);
                const p = resolve(num, isSeatScope);
                const display = fmt(p, num) ?? NOT_CALC;
                return <DataRow key={num} label={label} value={display} />;
              });
            })()}
          </DataSection>

          <DataSection title="RP23 Viewing">
            {(() => {
              // Use same source as ViewingAnglePanel: appState.mlpY_m + appState.screenFrontPlaneM
              const mlpY = appState?.mlpY_m ?? null;
              const screenFrontPlaneM = Number.isFinite(Number(appState?.screenFrontPlaneM))
                ? Number(appState.screenFrontPlaneM)
                : Number(_screen?.floatDepthM ?? 0);

              let hAngle = null;
              let hLevel = null;
              let distM = null;

              if (Number.isFinite(mlpY) && Number.isFinite(screenFrontPlaneM)) {
                const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };
                const tvKey = _screen?.tvPresetKey;
                const tvMm = Number(_screen?.tvWidthMm);
                const visibleWidthInches = (tvKey && TV_KEY_TO_INCHES[tvKey])
                  ? TV_KEY_TO_INCHES[tvKey]
                  : (Number.isFinite(tvMm) && tvMm > 0 ? tvMm / 25.4 : (Number(_screen?.visibleWidthInches) || 100));

                const angle = calculateViewingAngle(
                  { y: mlpY },
                  visibleWidthInches,
                  _screen?.aspectRatio || '16:9',
                  { y: screenFrontPlaneM }
                );

                if (angle != null) {
                  const rp23Level = assignRP23Level(angle);
                  hAngle = `${angle.toFixed(1)}°`;
                  hLevel = rp23Level?.level ?? null;
                  distM = Math.abs(mlpY - screenFrontPlaneM);
                }
              }

              // Fallbacks from analysisResult if live calc unavailable
              if (!hAngle) {
                const rp23 = analysisResult?.perSeatRp23?.['mlp'];
                if (rp23?.formatted && rp23.formatted !== '—') {
                  hAngle = rp23.formatted;
                  hLevel = rp23.level ?? null;
                }
              }
              if (!distM) {
                const d = analysisResult?.roomHudSnapshot?.mlpDistanceM ?? analysisResult?.mlpDistanceM ?? null;
                if (d != null) distM = d;
              }

              return (
                <>
                  <DataRow label="Horizontal Viewing Angle" value={
                    hAngle != null
                      ? (hLevel != null ? `${hLevel} · ${hAngle}` : hAngle)
                      : 'Not Yet Calculated'
                  } />
                  <DataRow label="RP23 H Level" value={hLevel ?? 'Not Yet Calculated'} />
                  <DataRow label="Vertical Viewing Angle" value="Not Available" />
                  <DataRow label="Distance to Screen" value={distM != null ? `${Number(distM).toFixed(2)} m` : '—'} />
                </>
              );
            })()}
          </DataSection>
        </div>
      )}

      <div
        style={{ height: "calc(100vh - 196px)", overflow: "auto", paddingRight: 8, display: rightPanelView === 'controls' ? undefined : 'none' }}
        className="space-y-3">

        <CollapsiblePanel
          title="Room Dimensions"
          icon={<Ruler className="w-5 h-5" />}
          defaultOpen={true}>
          {isFrozen('dimensions') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <RoomDimensions
              width_m={_roomDims?.widthM}
              length_m={_roomDims?.lengthM}
              height_m={_roomDims?.heightM}
              onChange={(partial) => {
                if (!isFrozen('dimensions') && _setRoomDims) {
                  _setRoomDims((prev) => ({ ...prev, ...partial }));
                }
              }}
              disabled={isFrozen('dimensions')}
              speakerPositionsView={speakerPositionsView}
              onSpeakerPositionsViewChange={setSpeakerPositionsView} />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Room Elements"
          icon={<Box className="w-5 h-5" />}
          defaultOpen={false}>
          {isFrozen('elements') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <RoomElements
              elements={roomElements}
              onChange={setRoomElementsGuarded}
              disabled={isFrozen('elements')}
              roomDims={appState?.roomDims}
            />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Screen Size"
          icon={<Monitor className="w-5 h-5" />}
          defaultOpen={false}>
          {isFrozen('screen') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <ScreenConfiguration
              dimensions={stableDimensions}
              screen={_screen}
              onScreenChange={setScreenGuarded}
              seatingPositions={seatingPositions}
              dolbyConfig={dolbyPreset}
              disabled={isFrozen('screen')} />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Seating Layout"
          icon={<Users className="w-5 h-5" />}
          defaultOpen={false}>
          {isFrozen('seating') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <SeatingLayout
              seatingPositions={seatingPositions}
              onGenerateSeating={handleGenerateSeating}
              seatsPerRowByRow={_seatsPerRowByRow}
              onSeatsPerRowByRowChange={setSeatsPerRowByRowGuarded}
              seatsPerRow={seatsPerRow}
              onSeatsPerRowChange={setSeatsPerRowGuarded}
              seatingRows={seatingRows}
              onSeatingRowsChange={setSeatingRowsGuarded}
              seatSpacing={seatSpacing}
              onSeatSpacingChange={setSeatSpacingGuarded}
              rowSpacingM={_rowSpacingM || 1.8}
              rowCentersM={appState?.rowCentersM || []}
              onRowSpacingChange={(val) => {
                const next = Number(val);
                if (!Number.isFinite(next)) return;
                if (typeof setRowSpacingGuarded === 'function') {
                  setRowSpacingGuarded(next);
                }
              }}
              seatingBlockOffset={_seatingBlockOffset}
              onSeatingBlockOffsetChange={setSeatingBlockOffsetGuarded}
              mlpBasis={seatingArrangementBasis}
              onMlpBasisChange={setSeatingArrangementBasis}
              onSetSeatingPositions={appState?.setSeatingPositions}
              disabled={isFrozen('seating')}
              screen={_screen}
              dimensions={stableDimensions}
              shiftSeatsToMaintainAngle={visualisationRef.current?.shiftSeatsToMaintainAngle}
              showMlpRuler={showMlpRuler}
              onShowMlpRulerChange={setShowMlpRuler}
              rowEarHeights={appState?.rowEarHeights || []}
              onRowEarHeightsChange={appState?.setRowEarHeights}
              rspMode={rspMode}
              onRspModeChange={onRspModeChange}
              manualRspY_m={manualRspY_m}
              onManualRspY_mChange={onManualRspY_mChange} />
          </Suspense>
        </CollapsiblePanel>

        <div className="mb-6">
          <CollapsiblePanel
            title="Speakers"
            icon={<Speaker className="w-5 h-5" />}
            defaultOpen={false}>
            {isFrozen('speakers') &&
              <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                This tab is frozen. Unlock to make changes.
              </div>
            }
            <Suspense fallback={<div>Loading...</div>}>
              <SpeakerPlacement
                disabled={isFrozen('speakers')}
                dimensions={stableDimensions}
                sevenBedLayoutType={_sevenBedLayoutType}
                onSevenBedLayoutTypeChange={setSevenBedLayoutType}
                dolbyPreset={dolbyPreset}
                onDolbyPresetChange={setDolbyPreset}
                lcrAimMode={lcrAimMode}
                onChangeLcrAimMode={setLcrAimMode}
                lcrAngleDeg={lcrAngleDeg}
                overheadGlobalModel={overheadGlobalModelFromState}
                setOverheadGlobalModel={setOverheadGlobalModelFromState}
                overheadFrontOverride={overheadFrontOverrideFromState}
                setOverheadFrontOverride={setOverheadFrontOverrideFromState}
                overheadMidOverride={overheadMidOverrideFromState}
                setOverheadMidOverride={setOverheadMidOverrideFromState}
                overheadRearOverride={overheadRearOverrideFromState}
                setOverheadRearOverride={setOverheadRearOverrideFromState}
                useFrontGlobal={useFrontGlobalFromState}
                setUseFrontGlobal={setUseFrontGlobalFromState}
                useMidGlobal={useMidGlobalFromState}
                setUseMidGlobal={setUseMidGlobalFromState}
                useRearGlobal={useRearGlobalFromState}
                setUseRearGlobal={setUseRearGlobalFromState}
                globalSurroundModel={appState?.globalSurroundModel}
                setGlobalSurroundModel={appState?.setGlobalSurroundModel}
                allSeatSplMetrics={allSeatSplMetrics}
                updateGlobalSpl={updateGlobalSplWithProjectSync}
                frontWideOverlay={frontWideZones}
                allowExtraSurrounds={isNineBedLayout}
                extraSurroundCount={isNineBedLayout ? (appState?.extraSurroundCount ?? 0) : 0}
                onExtraSurroundCountChange={isNineBedLayout ? appState?.setExtraSurroundCount : undefined}
                onP12Update={undefined} />
            </Suspense>

            <SpeakerPositionsReadout
              placedSpeakers={placedSpeakers}
              seatingPositions={_seatingPositions}
              roomWidth={stableDimensions.width}
              roomLength={stableDimensions.length}
              screenFrontPlaneM={appState?.screenFrontPlaneM}
              view={speakerPositionsView} />
          </CollapsiblePanel>
        </div>

        <CollapsiblePanel
          title="Bass Simulation"
          icon={<Waves className="w-5 h-5" />}
          defaultOpen={false}
          keepMounted>
          {isFrozen('bass') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <BassResponse
              disabled={isFrozen('bass')}
              frontSubsCfg={frontSubsCfg}
              setFrontSubsCfg={setFrontSubsCfg}
              rearSubsCfg={rearSubsCfg}
              setRearSubsCfg={setRearSubsCfg}
              subWarnings={subWarnings}
              frontSubsLive={frontSubsForRendering}
              rearSubsLive={rearSubsForRendering} />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Compliance Report"
          icon={<FileText className="w-5 h-5" />}
          defaultOpen={false}>
          {isFrozen('report') &&
            <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
              This tab is frozen. Unlock to make changes.
            </div>
          }
          <Suspense fallback={<div>Loading...</div>}>
            <RP22CompliancePanel
              analysisResult={analysisResult}
              screen={_screen}
              seatingPositions={_seatingPositions}
              seatHudSnapshots={
                (appState?.seatSnapshotBySeatId && Object.keys(appState.seatSnapshotBySeatId).length > 0)
                  ? appState.seatSnapshotBySeatId
                  : ((appState?.seatMetricsById && Object.keys(appState.seatMetricsById).length > 0)
                      ? appState.seatMetricsById
                      : {})
              }
              roomHudSnapshot={appState?.roomHudSnapshot || analysisResult?.roomHudSnapshot || null}
              mlpSeatId={"mlp"}
              dolbyLayout={appState?.dolbyLayout}
              frontSubsCount={appState?.frontSubsCfg?.count}
              rearSubsCount={appState?.rearSubsCfg?.count}
              p15ConstructionLevel={appState?.p15ConstructionLevel}
              p21EarlyReflectionPreset={appState?.p21EarlyReflectionPreset}
              freeMoveLcr={freeMoveLcr} />
          </Suspense>
          <Suspense fallback={<div>Loading...</div>}>
            <P18DebugPanel
              p18Debug={analysisResult?.__p18Debug}
              subModel={frontSubsCfg?.model || rearSubsCfg?.model || appState?.subwoofers?.[0]?.modelKey || appState?.subwoofers?.[0]?.model}
            />
          </Suspense>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Options"
          icon={<Box className="w-5 h-5" />}
          defaultOpen={false}>
          <OptionsPanel
            showPrices={showPrices}
            setShowPrices={setShowPrices}
            difficultyMultiplier={difficultyMultiplier}
            setDifficultyMultiplier={setDifficultyMultiplier}
            priceData={priceData}
            placedSpeakers={placedSpeakers}
            frontSubsCfg={_frontSubsCfg}
            rearSubsCfg={_rearSubsCfg}
          />
        </CollapsiblePanel>
      </div>
    </aside>
  );
}