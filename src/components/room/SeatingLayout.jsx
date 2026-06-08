"use client";

import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Users, Eye, Ruler, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { clampViewingOffset } from "@/components/utils/screenMetrics";
import RP22GradingPill from '../ui/RP22GradingPill';
import ViewingAnglePanel from './ViewingAnglePanel';
import { useAppState } from '@/components/AppStateProvider';

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
  const planeDepth_m = Math.max(0, Number(screen?.floatDepthM) || 0.20);
  const screenPlaneY = roomFrontY + planeDepth_m;
  const targetDist_m = targetDistanceFromPlaneM(visibleW_m, 57.5);
  return screenPlaneY + targetDist_m; // THIS is the green dot Y (in meters)
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
  // RSP mode
  rspMode = "auto_from_screen",
  onRspModeChange,
  manualRspY_m = null,
  onManualRspY_mChange,
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



  const totalSeats = seatingPositions.length;

  const rspSeat = useMemo(() => seatingPositions.find((s) => s.isPrimary) || seatingPositions[0], [seatingPositions]);

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

  return (
    <div className="space-y-6 seating-layout-sliders" data-rp22="seating">
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

    {/* Current Layout Analysis */}
    <div className="space-y-4 font-body">
      <h3 className="text-base font-medium flex items-center gap-2" style={{ color: '#1B1A1A', fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
        <Eye className="w-5 h-5" style={{ color: '#625143' }} />
        Current Layout Analysis
      </h3>

      <div className="grid grid-cols-1 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: '#1B1A1A' }}>{totalSeats}</div>
          <div className="text-xs" style={{ color: '#625143' }}>Total Seats</div>
        </div>
      </div>

      {rspSeat &&
        <div className="p-3 rounded-lg" style={{ border: '1px solid #C1B6AD', backgroundColor: '#F8F8F7' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium" style={{ color: '#1B1A1A' }}>Reference Seating Position (RSP)</span>
          </div>
          <div className="text-xs space-y-1" style={{ color: '#625143' }}>
            <p>Position: ({rspSeat.x.toFixed(2)}m, {rspSeat.y.toFixed(2)}m)</p>
            <p>Ear Height: {rspSeat.z.toFixed(2)}m</p>
          </div>
        </div>
        }

      {rowCount >= 1 &&
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-2" style={{ color: '#625143' }}>
            <Ruler className="w-4 h-4" />
            Row Heights (Ear Level)
          </Label>
          <div className="grid grid-cols-1 gap-2">
            {Array.from({ length: rowCount }, (_, i) => {
              const currentZ = Number.isFinite(rowEarHeights[i]) ? rowEarHeights[i] : getEarHeightForRow(i + 1);
              // Platform height: read from seat objects if available, otherwise derive from ear height difference
              const currentPlatformH = (() => {
                const seat = Array.isArray(seatingPositions) ? seatingPositions.find(s => s.rowNumber === i + 1) : null;
                if (seat && Number.isFinite(seat.platformHeightM)) return seat.platformHeightM;
                if (i === 0) return 0;
                const ear0 = Number.isFinite(rowEarHeights[0]) ? rowEarHeights[0] : getEarHeightForRow(1);
                return Math.max(0, Math.round((currentZ - ear0) * 100) / 100);
              })();
              return (
                <div key={i + 1} className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: '#F8F8F7', border: '1px solid #C1B6AD' }}>
                  <span className="text-xs" style={{ color: '#1B1A1A' }}>Row {i + 1}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-xs" style={{ color: '#625143' }}>Ear</span>
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="3.0"
                        value={currentZ}
                        disabled={disabled}
                        className="h-7 w-16 text-xs text-center"
                        style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}
                        onChange={(e) => {
                          if (disabled) return;
                          const val = parseFloat(e.target.value);
                          if (!Number.isFinite(val) || val <= 0) return;
                          const clamped = Math.max(0.1, Math.min(3.0, Math.round(val * 10) / 10));
                          const next = [...(rowEarHeights.length ? rowEarHeights : Array.from({ length: rowCount }, (_, j) => getEarHeightForRow(j + 1)))];
                          while (next.length < rowCount) next.push(getEarHeightForRow(next.length + 1));
                          next[i] = clamped;
                          onRowEarHeightsChange?.(next);
                          if (typeof onSetSeatingPositions === 'function' && Array.isArray(seatingPositions)) {
                            const updated = seatingPositions.map(seat =>
                              seat.rowNumber === i + 1 ? { ...seat, z: clamped } : seat
                            );
                            onSetSeatingPositions(updated);
                          }
                        }}
                      />
                      <span className="text-xs" style={{ color: '#625143' }}>m</span>
                    </div>
                    {i > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: '#625143' }}>Platform</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="2.0"
                          value={currentPlatformH}
                          disabled={disabled}
                          className="h-7 w-20 text-xs text-center"
                          style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}
                          onChange={(e) => {
                            if (disabled) return;
                            const val = parseFloat(e.target.value);
                            if (!Number.isFinite(val)) return;
                            const clamped = Math.max(0, Math.min(2.0, Math.round(val * 100) / 100));
                            if (typeof onSetSeatingPositions === 'function' && Array.isArray(seatingPositions)) {
                              const updated = seatingPositions.map(seat =>
                                seat.rowNumber === i + 1 ? { ...seat, platformHeightM: clamped } : seat
                              );
                              onSetSeatingPositions(updated);
                            }
                          }}
                        />
                        <span className="text-xs" style={{ color: '#625143' }}>m</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        }
    </div>

  {/* Controls */}
  <div className="space-y-4 font-body">
    {/* Reset Position */}
    











    {/* All seating parameters */}
    <div className="grid grid-cols-2 gap-4">
      {/* Rows & Seats (per-row editor) */}
      <div className="space-y-2 col-span-2">
        <Label
              className="text-sm font-medium"
              style={{ color: '#3E4349' }}>

          Rows &amp; Seats
        </Label>

        <div className="space-y-2">
          {rowsArray.map((count, idx) =>
              <div
                key={`row-${idx}`}
                className="flex items-center gap-3">

              <div
                  className="w-24 text-sm"
                  style={{ color: '#3E4349' }}>

                Row {idx + 1}
              </div>

              {/* Seats in this row */}
              <Input
                  type="number"
                  min="1"
                  step="1"
                  value={count}
                  disabled={disabled}
                  className="h-10 w-28"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #C1B6AD',
                    color: '#1B1A1A'
                  }}
                  onChange={(e) => {
                    if (disabled) return;

                    const n = Math.max(1, parseInt(e.target.value || '1', 10));
                    const next = [...rowsArray];
                    next[idx] = n;

                    onGenerateSeating?.({
                      seatsPerRowByRow: next,
                      numberOfRows: next.length,
                      seatSpacing,
                      rowSpacingM
                    });
                  }} />


              {/* Remove this row */}
              <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || rowsArray.length <= 1}
                  onClick={() => {
                    if (disabled || rowsArray.length <= 1) return;

                    const next = rowsArray.filter(
                      (_row, i) => i !== idx
                    );

                    const safe = next.length ? next : [rowsArray[0] ?? 3];

                    onGenerateSeating?.({
                      seatsPerRowByRow: safe,
                      numberOfRows: safe.length,
                      seatSpacing,
                      rowSpacingM
                    });

                    // Trim rowEarHeights to match
                    const currentHeights = rowEarHeights.length ? [...rowEarHeights] : rowsArray.map((_, j) => getEarHeightForRow(j + 1));
                    const nextHeights = currentHeights.filter((_, j) => j !== idx);
                    onRowEarHeightsChange?.(nextHeights);
                  }}>

                Remove
              </Button>
            </div>
              )}

          {/* Add Row */}
          <div className="pt-1">
            <Button
                  type="button"
                  variant="outline"
                  className="w-28"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;

                    const last = rowsArray[rowsArray.length - 1] ?? 3;
                    const next = [
                    ...rowsArray,
                    Math.max(1, Number(last) || 3)];


                    onGenerateSeating?.({
                      seatsPerRowByRow: next,
                      numberOfRows: next.length,
                      seatSpacing,
                      rowSpacingM
                    });

                    // Append default height for the new row
                    const currentHeights = rowEarHeights.length ? [...rowEarHeights] : rowsArray.map((_, j) => getEarHeightForRow(j + 1));
                    currentHeights.push(getEarHeightForRow(next.length));
                    onRowEarHeightsChange?.(currentHeights);
                  }}>

              Add Row
            </Button>
          </div>
        </div>
      </div>

      {/* Seat Spacing (m) */}
      <div className="space-y-2">
        <Label
              className="text-sm font-medium"
              style={{ color: '#3E4349' }}>

          Seat Spacing (m)
        </Label>
        <div className="flex items-center gap-2">
          <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  const base = Number.isFinite(seatSpacing) ? seatSpacing : 0.8;
                  const next = Math.max(0.5, Math.min(3.0, Math.round((base - 0.1) * 100) / 100));
                  onSeatSpacingChange?.(next);
                }}
                style={{
                  minWidth: 32,
                  padding: 0,
                  border: '1px solid #C1B6AD',
                  backgroundColor: '#ffffff',
                  color: '#1B1A1A'
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
                className="h-10 flex-1 text-center"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #C1B6AD',
                  color: '#1B1A1A'
                }} />


          <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  const base = Number.isFinite(seatSpacing) ? seatSpacing : 0.8;
                  const next = Math.max(0.5, Math.min(3.0, Math.round((base + 0.1) * 100) / 100));
                  onSeatSpacingChange?.(next);
                }}
                style={{
                  minWidth: 32,
                  padding: 0,
                  border: '1px solid #C1B6AD',
                  backgroundColor: '#ffffff',
                  color: '#1B1A1A'
                }}>

            +
          </Button>
        </div>
      </div>

      {/* Row Spacing (m) */}
      <div className="space-y-2">
        <Label
              className="text-sm font-medium"
              style={{ color: '#3E4349' }}>

          Row Spacing (m)
        </Label>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* – button */}
          <button
                type="button"
                onClick={() => {
                  if (disabled || rowCount <= 1) return;

                  const current = Number.isFinite(rowSpacingM) ?
                  Number(rowSpacingM) :
                  1.8;

                  const next = normaliseRowSpacing(String(current - 0.1));
                  if (next !== '') {
                    onRowSpacingChange?.(next);
                  }
                }}
                disabled={disabled || rowCount <= 1}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  border: '1px solid #C1B6AD',
                  backgroundColor: '#ffffff',
                  fontSize: 18,
                  cursor: disabled || rowCount <= 1 ? 'not-allowed' : 'pointer',
                  opacity: disabled || rowCount <= 1 ? 0.5 : 1
                }}>

            –
          </button>

          {/* central value input – no spinner arrows */}
          <Input
                type="text"
                inputMode="decimal"
                value={safeRowSpacingValue}
                onChange={(e) => {
                  if (disabled || rowCount <= 1) return;

                  const raw = e.target.value;
                  if (raw === '') {
                    return;
                  }

                  const normalized = normaliseRowSpacing(raw);
                  if (normalized !== '') {
                    onRowSpacingChange?.(normalized);
                  }
                }}
                onBlur={(e) => {
                  if (disabled || rowCount <= 1) return;

                  const raw = e.target.value;
                  const normalized = normaliseRowSpacing(raw);
                  if (normalized !== '') {
                    onRowSpacingChange?.(normalized);
                  }
                }}
                disabled={disabled || rowCount <= 1}
                className="h-10"
                style={{
                  flex: 1,
                  backgroundColor: '#ffffff',
                  border: '1px solid #C1B6AD',
                  color: '#1B1A1A',
                  textAlign: 'center'
                }} />


          {/* + button */}
          <button
                type="button"
                onClick={() => {
                  if (disabled || rowCount <= 1) return;

                  const current = Number.isFinite(rowSpacingM) ?
                  Number(rowSpacingM) :
                  1.8;

                  const next = normaliseRowSpacing(String(current + 0.1));
                  if (next !== '') {
                    onRowSpacingChange?.(next);
                  }
                }}
                disabled={disabled || rowCount <= 1}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  border: '1px solid #C1B6AD',
                  backgroundColor: '#ffffff',
                  fontSize: 18,
                  cursor: disabled || rowCount <= 1 ? 'not-allowed' : 'pointer',
                  opacity: disabled || rowCount <= 1 ? 0.5 : 1
                }}>

            +
          </button>
        </div>
      </div>

      {/* Front Row Distance from Front Wall (m) — always anchored to Row 1 */}
      {(() => {
        // Derive row centres from seatingPositions (same logic as ViewingAnglePanel).
        // Falls back to rowCentersM only when seatingPositions is empty.
        const liveCenters = (() => {
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
        })();
        const centers = liveCenters ?? (Array.isArray(rowCentersM) && rowCentersM.length > 0 ? rowCentersM : null);
        const offset = Number.isFinite(seatingBlockOffset) ? seatingBlockOffset : 0;

        // Always use Row 1 (index 0) as the editable anchor
        const frontRowY = centers ? centers[0] : null;
        const frontRowYAtZeroOffset = Number.isFinite(frontRowY) ? frontRowY - offset : null;
        const displayValue = Number.isFinite(frontRowY) ? Math.round(frontRowY * 100) / 100 : null;

        const handleChange = (desiredFrontRowY) => {
          if (!Number.isFinite(desiredFrontRowY) || !Number.isFinite(frontRowYAtZeroOffset)) return;
          const newOffset = desiredFrontRowY - frontRowYAtZeroOffset;
          onSeatingBlockOffsetChange?.(clampViewingOffset(Math.round(newOffset * 100) / 100));
        };

        return (
          <div className="space-y-2 col-span-2">
            <Label className="text-sm font-medium" style={{ color: '#3E4349' }}>
              Front Row Distance from Front Wall (m)
            </Label>
            <p className="text-xs" style={{ color: '#625143' }}>
              Sets the distance from the front wall to Row 1. Other rows are derived from row spacing.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled || !Number.isFinite(displayValue)}
                onClick={() => {
                  if (disabled || !Number.isFinite(displayValue)) return;
                  handleChange(Math.round((displayValue - 0.1) * 100) / 100);
                }}
                style={{ minWidth: 32, padding: 0, border: '1px solid #C1B6AD', backgroundColor: '#ffffff', color: '#1B1A1A' }}>
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
                className="h-10 flex-1 text-center"
                style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled || !Number.isFinite(displayValue)}
                onClick={() => {
                  if (disabled || !Number.isFinite(displayValue)) return;
                  handleChange(Math.round((displayValue + 0.1) * 100) / 100);
                }}
                style={{ minWidth: 32, padding: 0, border: '1px solid #C1B6AD', backgroundColor: '#ffffff', color: '#1B1A1A' }}>
                +
              </Button>
            </div>

            {/* Read-only row distance readouts */}
            {centers && centers.length > 0 && (
              <div className="pt-1 space-y-1">
                {centers.slice(0, 4).map((y, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-1 rounded"
                    style={{ backgroundColor: '#F8F8F7', border: '1px solid #C1B6AD' }}
                  >
                    <span className="text-xs" style={{ color: '#625143' }}>Row {i + 1}</span>
                    <span className="text-xs font-medium" style={{ color: '#1B1A1A' }}>
                      {Number.isFinite(y) ? y.toFixed(2) : '—'} m
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}



      {/* RSP Mode */}
      <div className="space-y-2 col-span-2">
        <Label className="text-sm font-medium" style={{ color: '#3E4349' }}>
          RSP Mode
        </Label>
        {/* Normalise legacy row-derived values to auto_from_screen for display */}
        {(() => {
          const ROW_DERIVED = ['front_row_center', 'middle_row_center', 'back_row_center', 'all_rows_average'];
          const displayMode = ROW_DERIVED.includes(rspMode) ? 'auto_from_screen' : (rspMode || 'auto_from_screen');
          return (
            <Select
              value={displayMode}
              onValueChange={(val) => onRspModeChange?.(val)}
              disabled={disabled}
              modal={false}>
              <SelectTrigger style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}>
                <span>
                  {{ auto_from_screen: 'Auto from Screen Size', manual_position: 'Manual Position' }[displayMode] ?? 'Auto from Screen Size'}
                </span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className="z-[70]">
                <SelectItem value="auto_from_screen">Auto from Screen Size</SelectItem>
                <SelectItem value="manual_position">Manual Position</SelectItem>
              </SelectContent>
            </Select>
          );
        })()}

        {rspMode === "manual_position" && (
          <div className="space-y-1 pt-1">
            <Label className="text-xs" style={{ color: '#625143' }}>RSP Position (m)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled}
                onClick={() => {
                  const base = Number.isFinite(manualRspY_m) ? manualRspY_m : 2.0;
                  onManualRspY_mChange?.(Math.round((base - 0.01) * 1000) / 1000);
                }}
                style={{ minWidth: 32, padding: 0, border: '1px solid #C1B6AD', backgroundColor: '#ffffff', color: '#1B1A1A' }}>
                –
              </Button>
              <Input
                type="number"
                step="0.01"
                min="0.1"
                max="20"
                value={Number.isFinite(manualRspY_m) ? (Math.round(manualRspY_m * 100) / 100).toFixed(2) : ''}
                disabled={disabled}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val) && val > 0) {
                    onManualRspY_mChange?.(Math.round(val * 1000) / 1000);
                  }
                }}
                className="h-10 flex-1 text-center"
                style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled}
                onClick={() => {
                  const base = Number.isFinite(manualRspY_m) ? manualRspY_m : 2.0;
                  onManualRspY_mChange?.(Math.round((base + 0.01) * 1000) / 1000);
                }}
                style={{ minWidth: 32, padding: 0, border: '1px solid #C1B6AD', backgroundColor: '#ffffff', color: '#1B1A1A' }}>
                +
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>

  {/* Viewing Angle Panel */}
  <ViewingAnglePanel
        screen={screen}
        seatingPositions={seatingPositions}
        viewingDistanceOffsetM={seatingBlockOffset}
        mlpOverride={mlpOverride}
        mlpDotOffsetM={seatingBlockOffset}
        showMlpRuler={showMlpRuler}
        onShowMlpRulerChange={onShowMlpRulerChange} />

    </div>);

}