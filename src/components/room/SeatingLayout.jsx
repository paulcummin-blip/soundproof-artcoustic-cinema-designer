"use client";

import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { RotateCcw, Move } from 'lucide-react';

import { clampViewingOffset } from "@/components/utils/screenMetrics";
import RP22GradingPill from '../ui/RP22GradingPill';
import ViewingAnglePanel from './ViewingAnglePanel';
import ViewingPriorityControl from './ViewingPriorityControl';
import { useAppState } from '@/components/AppStateProvider';
import { cancelMlpGrab } from '@/components/state/mlpGrabStore';
import { normaliseSeatCount, stepSeatCount } from './seatCount';
import SeatPrioritySelector from './SeatPrioritySelector';
import { Switch } from '@/components/ui/switch';
import { resolveSeatPriority } from '@/components/utils/seatPriorityAuthority';

// Single source of truth for target MLP Y computation - now using WIDTH for horizontal FOV
const RAD = Math.PI / 180;

// meters of viewable WIDTH
function getVisibleScreenWidthM(screen) {
  return Number(screen?.visibleWidthInches || 100) * 0.0254;
}

// distance from the SCREEN PLANE needed for a horizontal FOV = targetDeg
function targetDistanceFromPlaneM(visibleWidthM, targetDeg) {
  const half = visibleWidthM / 2;
  return half / Math.tan(targetDeg * RAD / 2);
}

// THIS function is used by ViewingAnglePanel, so it must stay.
// However, the helper functions `rowCentersByNumber`, `anchorYForBasis`, `shiftBlockY`
// which were used for the *old* anchoring logic inside this component, are removed.
function targetMlpY57_5(screen, roomFrontY = 0) {
  const visibleW_m = getVisibleScreenWidthM(screen);
  const targetDist_m = targetDistanceFromPlaneM(visibleW_m, 57.5);
  return roomFrontY + targetDist_m; // THIS is the green dot Y (in meters)
}



// Function to get ear height for each row
const getEarHeightForRow = (rowNumber) => {
  switch (rowNumber) {
    case 1:return 1.2;
    case 2:return 1.5;
    case 3:return 1.8;
    default:return 1.2 + (rowNumber - 1) * 0.3;
  }
};

// Normalise row spacing to a sane, monotonic numeric value in metres.
const normaliseRowSpacing = (raw) => {
  if (raw === '' || raw == null) return '';

  let n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
  if (!Number.isFinite(n)) return '';

  // Clamp between 0.8 m and 4.0 m
  const min = 0.8;
  const max = 4.0;
  n = Math.max(min, Math.min(max, n));

  // Round to cm resolution
  return Number(n.toFixed(2));
};

export default function SeatingLayout({
  seatingPositions = [],
  onGenerateSeating,
  // NEW: per-row seat counts (array). If not provided, we'll fall back to seatsPerRow + seatingRows.
  seatsPerRowByRow,
  onSeatsPerRowByRowChange,
  // Keep old fields for now (fallbacks)
  seatsPerRow = 3,
  onSeatsPerRowChange,
  seatingRows = 1,
  onSeatingRowsChange,
  seatSpacing = 0.8,
  onSeatSpacingChange,
  rowSpacingM = 1.8,
  onRowSpacingChange,
  rowCentersM = [],
  seatingBlockOffset = 0,
  onSeatingBlockOffsetChange,
  mlpBasis = "front",
  onMlpBasisChange,
  onSetSeatingPositions,
  disabled = false,
  screen,
  dimensions,
  showMlpRuler = false,
  onShowMlpRulerChange,
  rowEarHeights = [],
  onRowEarHeightsChange,
  // Link ear & platform heights
  linkEarPlatformHeights = true,
  onLinkEarPlatformHeightsChange,
  // RSP mode
  rspMode = "auto_from_screen",
  onRspModeChange,
  manualRspX_m = null,
  onManualRspX_mChange,
  manualRspY_m = null,
  onManualRspY_mChange,
  // Viewing priority (multi-row viewing intent)
  viewingPriority = "balanced",
  onViewingPriorityChange,
}) {
  // Build rowsArray purely from props (parent is the source of truth)
  const rowsArray = React.useMemo(() => {
    if (Array.isArray(seatsPerRowByRow) && seatsPerRowByRow.length) {
      return seatsPerRowByRow.map((n) =>
      Math.max(1, parseInt(n || 1, 10))
      );
    }

    const rows = Math.max(1, parseInt(seatingRows || 1, 10));
    const seats = Math.max(1, parseInt(seatsPerRow || 1, 10));
    return Array.from({ length: rows }, () => seats);
  }, [seatsPerRowByRow, seatsPerRow, seatingRows]);

  // Use this everywhere instead of seatingRows for how many rows we have
  const rowCount = rowsArray.length;

  const commitSeatCount = useCallback((rowIndex, rawCount) => {
    if (disabled) return;
    const next = [...rowsArray];
    next[rowIndex] = normaliseSeatCount(rawCount);

    onGenerateSeating?.({
      seatsPerRowByRow: next,
      numberOfRows: next.length,
      seatSpacing,
      rowSpacingM,
    });
  }, [disabled, rowsArray, onGenerateSeating, seatSpacing, rowSpacingM]);

  const totalSeats = seatingPositions.length;

  const rspSeat = useMemo(() => seatingPositions.find((s) => s.isPrimary) || seatingPositions[0], [seatingPositions]);

  const seatPriorityCounts = useMemo(() => {
    const list = Array.isArray(seatingPositions) ? seatingPositions : [];
    let primary = 0;
    let secondary = 0;
    for (const s of list) {
      if (resolveSeatPriority(s) === 'secondary') secondary++;
      else primary++;
    }
    return { primary, secondary };
  }, [seatingPositions]);

  // Compute MLP override from RSP seat (fallback: all seats)
  const mlpOverride = useMemo(() => {
    const list = seatingPositions?.filter((s) => s.isPrimary);
    const seats = (list && list.length ? list : seatingPositions) || [];
    if (!seats.length) return null;

    const sum = seats.reduce(
      (a, s) => ({
        x: a.x + (Number(s.x) || 0),
        y: a.y + (Number(s.y) || 0),
        z: a.z + (Number(s.z) || 1.2) // Default ear height to 1.2m
      }),
      { x: 0, y: 0, z: 0 }
    );

    const n = seats.length;
    return { x: sum.x / n, y: sum.y / n, z: sum.z / n };
  }, [seatingPositions]);

  // MLP Reference options based on current row count
  const mlpOptions = useMemo(() => {
    const options = [
    { value: 'front', label: 'Front Row Center' },
    { value: 'back', label: 'Back Row Center' },
    { value: 'all', label: 'All Rows (Average)' }];


    if (rowCount >= 3) {// Changed seatingRows to rowCount
      options.splice(1, 0, { value: 'middle', label: 'Middle Row Center' });
    }

    return options;
  }, [rowCount]); // Changed seatingRows to rowCount

  // Pull live screenFrontPlaneM from AppState so liveViewingOffset measures from screen plane, not wall.
  const { screenFrontPlaneM: appScreenFrontPlaneM } = useAppState() || {};
  const screenFrontPlaneM = Number.isFinite(Number(appScreenFrontPlaneM))
    ? Number(appScreenFrontPlaneM)
    : Number(screen?.floatDepthM ?? 0);

  // Validate current mlpBasis against available options
  // Live viewing offset: derived from current seat positions vs the ideal 57.5° MLP Y.
  // Uses screenFrontPlaneM as roomFrontY so the target distance is measured from the screen face.
  const liveViewingOffset = useMemo(() => {
    if (!mlpOverride || !Number.isFinite(mlpOverride.y) || !screen) return seatingBlockOffset;
    const idealY = targetMlpY57_5(screen, screenFrontPlaneM);
    return Math.round((mlpOverride.y - idealY) * 100) / 100;
  }, [mlpOverride, screen, seatingBlockOffset, screenFrontPlaneM]);

  const validMlpBasis = useMemo(() => {
    const validValues = mlpOptions.map((opt) => opt.value);
    return validValues.includes(mlpBasis) ? mlpBasis : 'front';
  }, [mlpBasis, mlpOptions]);

  // Live row centres from seatingPositions — shared by the Front Row Distance
  // control and the Move seats to RSP button so both use the same authority.
  const liveCenters = useMemo(() => {
    if (Array.isArray(seatingPositions) && seatingPositions.length > 0) {
      const byRow = {};
      for (const seat of seatingPositions) {
        const rn = seat.rowNumber ?? 1;
        if (!byRow[rn]) byRow[rn] = [];
        byRow[rn].push(Number(seat.y) || 0);
      }
      const sorted = Object.keys(byRow).map(Number).sort((a, b) => a - b);
      return sorted.map(rn => {
        const ys = byRow[rn];
        return Math.round((ys.reduce((s, v) => s + v, 0) / ys.length) * 100) / 100;
      });
    }
    return null;
  }, [seatingPositions]);

  // Effective RSP Y — the canonical green-dot Y used by all engine modules.
  // Manual: manualRspY_m. Auto / row-derived: 57.5° target from screen plane.
  const effectiveRspY = useMemo(() => {
    if (rspMode === 'manual_position' && Number.isFinite(manualRspY_m)) {
      return manualRspY_m;
    }
    return targetMlpY57_5(screen, screenFrontPlaneM);
  }, [rspMode, manualRspY_m, screen, screenFrontPlaneM]);

  // Move seats to RSP — single-row only. Moves the complete row longitudinally
  // so the row centre Y aligns with the current canonical green-dot RSP Y.
  // Preserves seat count, spacing, ear height, and lateral positions.
  const handleMoveSeatsToRsp = useCallback(() => {
    if (rowCount !== 1) return;
    const centers = liveCenters ?? [];
    const frontRowY = centers[0];
    if (!Number.isFinite(frontRowY)) return;
    const offset = Number.isFinite(seatingBlockOffset) ? seatingBlockOffset : 0;
    const frontRowYAtZeroOffset = frontRowY - offset;
    const newOffset = effectiveRspY - frontRowYAtZeroOffset;
    onSeatingBlockOffsetChange?.(clampViewingOffset(Math.round(newOffset * 100) / 100));
  }, [rowCount, liveCenters, seatingBlockOffset, effectiveRspY, onSeatingBlockOffsetChange]);

  // Update MLP basis if it becomes invalid
  useEffect(() => {
    if (validMlpBasis !== mlpBasis && onMlpBasisChange) {
      onMlpBasisChange(validMlpBasis);
    }
  }, [validMlpBasis, mlpBasis, onMlpBasisChange]);

  // Enhanced MLP change handler - triggers repositioning via parent
  const handleMlpBasisChange = useCallback((value) => {
    onMlpBasisChange?.(value);
    // Parent RoomDesigner will automatically reposition rows via the rowYPositions memo
  }, [onMlpBasisChange]);

  // Reset Position handler now just triggers parameter update
  const handleResetPosition = useCallback(() => {
    // Triggering a "generation" with current parameters will cause
    // RoomDesigner to recalculate positions from the anchor
    if (onGenerateSeating) {
      onGenerateSeating({
        seatsPerRow,
        numberOfRows: seatingRows,
        seatSpacing,
        rowSpacingM // NEW: Include rowSpacingM in reset
      });
    }
  }, [onGenerateSeating, seatsPerRow, seatingRows, seatSpacing, rowSpacingM]); // NEW: Add rowSpacingM dependency

  // Safe row spacing value for the input
  const safeRowSpacingValue =
  typeof rowSpacingM === 'number' && Number.isFinite(rowSpacingM) ?
  rowSpacingM :
  1.8;

  const groupTitleStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#625143",
    marginBottom: "10px",
  };

  const fieldLabelStyle = "block mb-1.5 text-xs text-[#6B7280]";

  const stepperBtnStyle = {
    border: "1px solid #C1B6AD",
    backgroundColor: "#ffffff",
    color: "#1B1A1A",
  };

  return (
    <div className="space-y-5 seating-layout-sliders" data-rp22="seating">
    <style>{`
      .seating-layout-sliders .slider-track {
        position: relative;
        height: 6px;
        width: 100%;
        flex-grow: 1;
        overflow: hidden;
        border-radius: 9999px;
        background-color: #DCDBD6;
      }
      .seating-layout-sliders .slider-range {
        position: absolute;
        height: 100%;
        background-color: #213428;
      }
      .seating-layout-sliders .slider-thumb {
        display: block;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background-color: #1B1A1A;
        border: 2px solid #FFFFFF;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      .seating-layout-sliders .slider-thumb:focus-visible {
        outline: 2px solid #213428;
        outline-offset: 2px;
      }
    `}</style>

    {/* 1. SEATING SUMMARY */}
    <div>
      <div style={groupTitleStyle}>Seating Summary</div>
      <div className="p-3 border border-[#E5E5E5] rounded-lg bg-[#FAF9F6]">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <div className="text-[#9CA3AF] text-[11px]">Rows</div>
            <div className="text-[#1B1A1A] text-sm font-semibold">{rowCount}</div>
          </div>
          <div>
            <div className="text-[#9CA3AF] text-[11px]">Total Seats</div>
            <div className="text-[#1B1A1A] text-sm font-semibold">{totalSeats}</div>
          </div>
          <div>
            <div className="text-[#9CA3AF] text-[11px]">Primary</div>
            <div className="text-[#1B1A1A] text-sm font-semibold">{seatPriorityCounts.primary}</div>
          </div>
          <div>
            <div className="text-[#9CA3AF] text-[11px]">Secondary</div>
            <div className="text-[#1B1A1A] text-sm font-semibold">{seatPriorityCounts.secondary}</div>
          </div>
          <div>
            <div className="text-[#9CA3AF] text-[11px]">RSP from Screen</div>
            <div className="text-[#1B1A1A] text-sm font-semibold">
              {Number.isFinite(effectiveRspY) && Number.isFinite(screenFrontPlaneM)
                ? `${(effectiveRspY - screenFrontPlaneM).toFixed(2)} m`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-[#9CA3AF] text-[11px]">RSP from Front Wall</div>
            <div className="text-[#1B1A1A] text-sm font-semibold">
              {Number.isFinite(effectiveRspY) ? `${effectiveRspY.toFixed(2)} m` : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* 2. ROWS & PRIORITY */}
    <div>
      <div style={groupTitleStyle}>Rows & Priority</div>
      <div className="space-y-2">
        {rowsArray.map((count, idx) => {
          const currentZ = Number.isFinite(rowEarHeights[idx]) ? rowEarHeights[idx] : getEarHeightForRow(idx + 1);
          const currentPlatformH = (() => {
            const seat = Array.isArray(seatingPositions) ? seatingPositions.find(s => s.rowNumber === idx + 1) : null;
            if (seat && Number.isFinite(seat.platformHeightM)) return seat.platformHeightM;
            if (idx === 0) return 0;
            const ear0 = Number.isFinite(rowEarHeights[0]) ? rowEarHeights[0] : getEarHeightForRow(1);
            return Math.max(0, Math.round((currentZ - ear0) * 100) / 100);
          })();

          return (
            <div key={`row-${idx}`} className="flex flex-wrap items-center gap-3 p-2 rounded-md border border-[#ECEAE4] bg-white">
              <div className="text-sm font-medium" style={{ color: '#3E4349', width: 56 }}>Row {idx + 1}</div>

              {/* Seats stepper */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#625143' }}>Seats</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Remove one seat from row ${idx + 1}`}
                  disabled={disabled || count <= 1}
                  className="h-8 w-8 shrink-0"
                  style={stepperBtnStyle}
                  onClick={() => commitSeatCount(idx, stepSeatCount(count, -1))}>
                  –
                </Button>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label={`Seats in row ${idx + 1}`}
                  value={count}
                  disabled={disabled}
                  className="h-8 w-14 text-center"
                  style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    commitSeatCount(idx, stepSeatCount(count, e.key === 'ArrowUp' ? 1 : -1));
                  }}
                  onChange={(e) => commitSeatCount(idx, e.target.value)} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Add one seat to row ${idx + 1}`}
                  disabled={disabled}
                  className="h-8 w-8 shrink-0"
                  style={stepperBtnStyle}
                  onClick={() => commitSeatCount(idx, stepSeatCount(count, 1))}>
                  +
                </Button>
              </div>

              {/* Ear height */}
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: '#625143' }}>Ear</span>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="3.0"
                  value={currentZ}
                  disabled={disabled}
                  className="h-8 w-16 text-xs text-center"
                  style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}
                  onChange={(e) => {
                    if (disabled) return;
                    const val = parseFloat(e.target.value);
                    if (!Number.isFinite(val) || val <= 0) return;
                    const clamped = Math.max(0.1, Math.min(3.0, Math.round(val * 10) / 10));
                    const next = [...(rowEarHeights.length ? rowEarHeights : Array.from({ length: rowCount }, (_, j) => getEarHeightForRow(j + 1)))];
                    while (next.length < rowCount) next.push(getEarHeightForRow(next.length + 1));
                    next[idx] = clamped;
                    onRowEarHeightsChange?.(next);
                    if (typeof onSetSeatingPositions === 'function' && Array.isArray(seatingPositions)) {
                      let updated = seatingPositions.map(seat =>
                        seat.rowNumber === idx + 1 ? { ...seat, z: clamped } : seat
                      );
                      // Linked: apply same delta to platform height
                      if (linkEarPlatformHeights && idx > 0) {
                        const delta = clamped - currentZ;
                        const newPlatform = Math.max(0, Math.min(2.0, Math.round((currentPlatformH + delta) * 100) / 100));
                        updated = updated.map(seat =>
                          seat.rowNumber === idx + 1 ? { ...seat, platformHeightM: newPlatform } : seat
                        );
                      }
                      onSetSeatingPositions(updated);
                    }
                  }}
                />
                <span className="text-xs" style={{ color: '#625143' }}>m</span>
              </div>

              {/* Platform height — rows > 1 */}
              {idx > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs" style={{ color: '#625143' }}>Platform</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="2.0"
                    value={Number.isFinite(currentPlatformH) ? Number(currentPlatformH.toFixed(2)) : 0}
                    disabled={disabled}
                    className="h-8 w-24 text-xs text-center"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}
                    onChange={(e) => {
                      if (disabled) return;
                      const val = parseFloat(e.target.value);
                      if (!Number.isFinite(val)) return;
                      const clamped = Math.max(0, Math.min(2.0, Math.round(val * 100) / 100));
                      if (typeof onSetSeatingPositions === 'function' && Array.isArray(seatingPositions)) {
                        let updated = seatingPositions.map(seat =>
                          seat.rowNumber === idx + 1 ? { ...seat, platformHeightM: clamped } : seat
                        );
                        // Linked: apply same delta to ear height
                        if (linkEarPlatformHeights) {
                          const delta = clamped - currentPlatformH;
                          const newEar = Math.max(0.1, Math.min(3.0, Math.round((currentZ + delta) * 10) / 10));
                          updated = updated.map(seat =>
                            seat.rowNumber === idx + 1 ? { ...seat, z: newEar } : seat
                          );
                          const next = [...(rowEarHeights.length ? rowEarHeights : Array.from({ length: rowCount }, (_, j) => getEarHeightForRow(j + 1)))];
                          while (next.length < rowCount) next.push(getEarHeightForRow(next.length + 1));
                          next[idx] = newEar;
                          onRowEarHeightsChange?.(next);
                        }
                        onSetSeatingPositions(updated);
                      }
                    }}
                  />
                  <span className="text-xs" style={{ color: '#625143' }}>m</span>
                </div>
              )}

              {/* Remove row */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || rowsArray.length <= 1}
                className="h-8 ml-auto"
                style={{ border: '1px solid #C1B6AD', backgroundColor: '#ffffff', color: '#625143' }}
                onClick={() => {
                  if (disabled || rowsArray.length <= 1) return;
                  const next = rowsArray.filter((_row, i) => i !== idx);
                  const safe = next.length ? next : [rowsArray[0] ?? 3];
                  onGenerateSeating?.({
                    seatsPerRowByRow: safe,
                    numberOfRows: safe.length,
                    seatSpacing,
                    rowSpacingM
                  });
                  const currentHeights = rowEarHeights.length ? [...rowEarHeights] : rowsArray.map((_, j) => getEarHeightForRow(j + 1));
                  const nextHeights = currentHeights.filter((_, j) => j !== idx);
                  onRowEarHeightsChange?.(nextHeights);
                }}>
                Remove
              </Button>
            </div>
          );
        })}

        {/* Add Row */}
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            className="h-8"
            disabled={disabled}
            style={{ border: '1px solid #C1B6AD', backgroundColor: '#ffffff', color: '#213428' }}
            onClick={() => {
              if (disabled) return;
              const last = rowsArray[rowsArray.length - 1] ?? 3;
              const next = [...rowsArray, Math.max(1, Number(last) || 3)];
              onGenerateSeating?.({
                seatsPerRowByRow: next,
                numberOfRows: next.length,
                seatSpacing,
                rowSpacingM
              });
              const currentHeights = rowEarHeights.length ? [...rowEarHeights] : rowsArray.map((_, j) => getEarHeightForRow(j + 1));
              currentHeights.push(getEarHeightForRow(next.length));
              onRowEarHeightsChange?.(currentHeights);
            }}>
            + Add Row
          </Button>
        </div>
      </div>

      {/* Link ear & platform heights toggle */}
      <div className="mt-3 flex items-center justify-between py-2 px-3 rounded-md" style={{ border: '1px solid #ECEAE4', backgroundColor: '#FAF9F6' }}>
        <span className="text-sm font-medium" style={{ color: '#3E4349' }}>Link ear &amp; platform heights</span>
        <Switch
          checked={linkEarPlatformHeights}
          onCheckedChange={(v) => onLinkEarPlatformHeightsChange?.(v)}
          disabled={disabled}
        />
      </div>

      {/* Seat Priority */}
      <div className="mt-3">
        <SeatPrioritySelector
          seatingPositions={seatingPositions}
          onSetSeatingPositions={onSetSeatingPositions}
          disabled={disabled}
        />
      </div>
    </div>

    {/* 3. POSITIONING */}
    <div>
      <div style={groupTitleStyle}>Positioning</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Seat Spacing */}
        <div>
          <Label className={fieldLabelStyle}>Seat Spacing (m)</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              className="h-9 w-9 shrink-0"
              style={stepperBtnStyle}
              onClick={() => {
                if (disabled) return;
                const base = Number.isFinite(seatSpacing) ? seatSpacing : 0.8;
                const next = Math.max(0.5, Math.min(3.0, Math.round((base - 0.1) * 100) / 100));
                onSeatSpacingChange?.(next);
              }}>
              –
            </Button>
            <Input
              type="text"
              inputMode="decimal"
              min="0.5"
              max="3.0"
              step="0.1"
              value={seatSpacing}
              onChange={(e) => {
                if (disabled) return;
                const raw = e.target.value;
                if (raw === '') return;
                const num = Number(raw);
                if (Number.isFinite(num)) {
                  const clamped = Math.max(0.5, Math.min(3.0, Math.round(num * 100) / 100));
                  onSeatSpacingChange?.(clamped);
                }
              }}
              disabled={disabled}
              className="h-9 flex-1 text-center"
              style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              className="h-9 w-9 shrink-0"
              style={stepperBtnStyle}
              onClick={() => {
                if (disabled) return;
                const base = Number.isFinite(seatSpacing) ? seatSpacing : 0.8;
                const next = Math.max(0.5, Math.min(3.0, Math.round((base + 0.1) * 100) / 100));
                onSeatSpacingChange?.(next);
              }}>
              +
            </Button>
          </div>
        </div>

        {/* Row Spacing */}
        <div>
          <Label className={fieldLabelStyle}>Row Spacing (m)</Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (disabled || rowCount <= 1) return;
                const current = Number.isFinite(rowSpacingM) ? Number(rowSpacingM) : 1.8;
                const next = normaliseRowSpacing(String(current - 0.1));
                if (next !== '') onRowSpacingChange?.(next);
              }}
              disabled={disabled || rowCount <= 1}
              className="h-9 w-9 shrink-0"
              style={stepperBtnStyle}>
              –
            </button>
            <Input
              type="text"
              inputMode="decimal"
              value={safeRowSpacingValue}
              onChange={(e) => {
                if (disabled || rowCount <= 1) return;
                const raw = e.target.value;
                if (raw === '') return;
                const normalized = normaliseRowSpacing(raw);
                if (normalized !== '') onRowSpacingChange?.(normalized);
              }}
              onBlur={(e) => {
                if (disabled || rowCount <= 1) return;
                const raw = e.target.value;
                const normalized = normaliseRowSpacing(raw);
                if (normalized !== '') onRowSpacingChange?.(normalized);
              }}
              disabled={disabled || rowCount <= 1}
              className="h-9 flex-1 text-center"
              style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }} />
            <button
              type="button"
              onClick={() => {
                if (disabled || rowCount <= 1) return;
                const current = Number.isFinite(rowSpacingM) ? Number(rowSpacingM) : 1.8;
                const next = normaliseRowSpacing(String(current + 0.1));
                if (next !== '') onRowSpacingChange?.(next);
              }}
              disabled={disabled || rowCount <= 1}
              className="h-9 w-9 shrink-0"
              style={stepperBtnStyle}>
              +
            </button>
          </div>
        </div>

        {/* Front Row Distance from Front Wall — full width */}
        {(() => {
          const centers = liveCenters ?? (Array.isArray(rowCentersM) && rowCentersM.length > 0 ? rowCentersM : null);
          const offset = Number.isFinite(seatingBlockOffset) ? seatingBlockOffset : 0;
          const frontRowY = centers ? centers[0] : null;
          const frontRowYAtZeroOffset = Number.isFinite(frontRowY) ? frontRowY - offset : null;
          const displayValue = Number.isFinite(frontRowY) ? Math.round(frontRowY * 100) / 100 : null;
          const handleChange = (desiredFrontRowY) => {
            if (!Number.isFinite(desiredFrontRowY) || !Number.isFinite(frontRowYAtZeroOffset)) return;
            const newOffset = desiredFrontRowY - frontRowYAtZeroOffset;
            onSeatingBlockOffsetChange?.(clampViewingOffset(Math.round(newOffset * 100) / 100));
          };
          return (
            <div className="sm:col-span-2">
              <Label className={fieldLabelStyle}>Front Row Distance from Front Wall (m)</Label>
              <p className="text-[11px] mb-1.5" style={{ color: '#9CA3AF' }}>
                Sets the distance from the front wall to Row 1. Other rows are derived from row spacing.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={disabled || !Number.isFinite(displayValue)}
                  className="h-9 w-9 shrink-0"
                  style={stepperBtnStyle}
                  onClick={() => {
                    if (disabled || !Number.isFinite(displayValue)) return;
                    handleChange(Math.round((displayValue - 0.1) * 100) / 100);
                  }}>
                  –
                </Button>
                <Input
                  type="text"
                  inputMode="decimal"
                  step="0.1"
                  value={displayValue !== null ? displayValue.toFixed(2) : ''}
                  onChange={(e) => {
                    if (disabled) return;
                    const raw = e.target.value;
                    if (raw === '') return;
                    const num = Number(raw);
                    if (Number.isFinite(num)) handleChange(num);
                  }}
                  disabled={disabled || displayValue === null}
                  className="h-9 flex-1 text-center"
                  style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={disabled || !Number.isFinite(displayValue)}
                  className="h-9 w-9 shrink-0"
                  style={stepperBtnStyle}
                  onClick={() => {
                    if (disabled || !Number.isFinite(displayValue)) return;
                    handleChange(Math.round((displayValue + 0.1) * 100) / 100);
                  }}>
                  +
                </Button>
              </div>
              {centers && centers.length > 0 && (
                <div className="pt-1.5 flex flex-wrap gap-1.5">
                  {centers.slice(0, 4).map((y, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
                      style={{ backgroundColor: '#F8F8F7', border: '1px solid #ECEAE4', color: '#625143' }}>
                      R{i + 1}
                      <span style={{ color: '#1B1A1A', fontWeight: 600 }}>
                        {Number.isFinite(y) ? y.toFixed(2) : '—'} m
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Actions + RSP ruler toggle */}
      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-9"
            style={{ border: '1px solid #C1B6AD', backgroundColor: '#ffffff', color: '#213428', fontWeight: 600, fontSize: 12 }}
            onClick={() => {
              cancelMlpGrab();
              onRspModeChange?.("auto_from_screen");
              onManualRspX_mChange?.(null);
              onManualRspY_mChange?.(null);
            }}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset RSP to 57.5°
          </Button>

          {rowCount === 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-9"
              style={{ border: '1px solid #C1B6AD', backgroundColor: '#ffffff', color: '#213428', fontWeight: 600, fontSize: 12 }}
              onClick={handleMoveSeatsToRsp}>
              <Move className="w-3.5 h-3.5 mr-1" />
              Move seats to RSP
            </Button>
          )}
        </div>

        {/* RSP Position Ruler toggle */}
        <div className="flex items-center justify-between py-2 px-3 rounded-md" style={{ border: '1px solid #ECEAE4', backgroundColor: '#FAF9F6' }}>
          <span className="text-sm font-medium" style={{ color: '#3E4349' }}>RSP Position Ruler</span>
          <Switch
            checked={showMlpRuler}
            onCheckedChange={onShowMlpRulerChange}
            disabled={disabled}
          />
        </div>
      </div>
    </div>

    {/* 4. VIEWING ANGLE ANALYSIS */}
    <div>
      <div style={groupTitleStyle}>Viewing Angle Analysis</div>
      <div className="space-y-3">
        <ViewingPriorityControl
          rowCount={rowCount}
          viewingPriority={viewingPriority}
          onViewingPriorityChange={onViewingPriorityChange}
          disabled={disabled} />
        <ViewingAnglePanel
          screen={screen}
          seatingPositions={seatingPositions}
          viewingDistanceOffsetM={seatingBlockOffset}
          mlpOverride={mlpOverride}
          mlpDotOffsetM={seatingBlockOffset}
          showMlpRuler={showMlpRuler}
          onShowMlpRulerChange={onShowMlpRulerChange}
          viewingPriority={viewingPriority} />
      </div>
    </div>

    </div>
  );

}