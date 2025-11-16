"use client";

import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Users, Award, Eye, Ruler, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { clampViewingOffset } from "@/components/utils/screenMetrics";
import RP22GradingPill from '../ui/RP22GradingPill';
import ViewingAnglePanel from './ViewingAnglePanel';

// Single source of truth for target MLP Y computation - now using WIDTH for horizontal FOV
const RAD = Math.PI / 180;

// meters of viewable WIDTH
function getVisibleScreenWidthM(screen) {
  return (Number(screen?.visibleWidthInches || 100) * 0.0254);
}

// distance from the SCREEN PLANE needed for a horizontal FOV = targetDeg
function targetDistanceFromPlaneM(visibleWidthM, targetDeg) {
  const half = visibleWidthM / 2;
  return half / Math.tan((targetDeg * RAD) / 2);
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

// Helper to find primary seats within a single row
const getRowPrimaries = (rowSeats) => {
  const sorted = [...rowSeats].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  const primaryIdx = new Set();

  if (n <= 2) { // 1 or 2 seats, all are primary
    for (let i = 0; i < n; i++) primaryIdx.add(i);
  } else if (n === 3) { // 3 seats, center is primary
    primaryIdx.add(1);
  } else if (n === 4) { // 4 seats, center 2 are primary
    primaryIdx.add(1);
    primaryIdx.add(2);
  } else { // 5+ seats, center 3 are primary
    const mid = Math.floor(n / 2);
    primaryIdx.add(mid - 1);
    primaryIdx.add(mid);
    primaryIdx.add(mid + 1);
  }

  return sorted.filter((_, i) => primaryIdx.has(i));
};

// Function to get ear height for each row
const getEarHeightForRow = (rowNumber) => {
  switch(rowNumber) {
    case 1: return 1.2;
    case 2: return 1.5;  
    case 3: return 1.8;
    default: return 1.2 + (rowNumber - 1) * 0.3;
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
  seatingBlockOffset = 0,
  onSeatingBlockOffsetChange,
  mlpBasis = "front",
  onMlpBasisChange,
  onSetSeatingPositions,
  disabled = false,
  screen,
  dimensions
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

  // Logic to set primary seats based on MLP basis, now inside SeatingLayout
  useEffect(() => {
    if (!seatingPositions.length || !onSetSeatingPositions) return;

    const seatsByRow = seatingPositions.reduce((acc, seat) => {
      const row = seat.rowNumber || 1;
      if (!acc[row]) acc[row] = [];
      acc[row].push(seat);
      return acc;
    }, {});
    
    const rowNumbers = Object.keys(seatsByRow).map(Number).sort((a, b) => a - b);
    if (!rowNumbers.length) return;

    let targetRowNumbers = [];
    switch (mlpBasis) {
      case 'front':
        targetRowNumbers = [rowNumbers[0]];
        break;
      case 'back':
        targetRowNumbers = [rowNumbers[rowNumbers.length - 1]];
        break;
      case 'middle':
        if (rowCount >= 3) { // Changed seatingRows to rowCount
          if (rowCount % 2 !== 0) { // Odd number of rows
            targetRowNumbers = [rowNumbers[Math.floor(rowCount / 2)]];
          } else { // Even number of rows
            targetRowNumbers = [rowNumbers[rowCount / 2 - 1], rowNumbers[rowCount / 2]];
          }
        } else { // Fallback for 2 rows
             targetRowNumbers = rowNumbers;
        }
        break;
      case 'all':
      default:
        targetRowNumbers = rowNumbers;
        break;
    }

    const primarySeatIds = new Set();
    targetRowNumbers.forEach(rowNum => {
      const rowSeats = seatsByRow[rowNum] || [];
      const primaryInRow = getRowPrimaries(rowSeats);
      primaryInRow.forEach(seat => primarySeatIds.add(seat.id));
    });

    const newSeatsWithFlags = seatingPositions.map(seat => ({
      ...seat,
      isPrimary: primarySeatIds.has(seat.id)
    }));

    // Check for changes to prevent infinite loops
    const flagsChanged = seatingPositions.some((seat, i) => seat.isPrimary !== newSeatsWithFlags[i].isPrimary);

    if (flagsChanged) {
      onSetSeatingPositions(newSeatsWithFlags);
    }
  }, [seatingPositions, mlpBasis, rowCount, onSetSeatingPositions]); // Changed seatingRows to rowCount

  const totalSeats = seatingPositions.length;
  const primarySeats = seatingPositions.filter(s => s.isPrimary).length;
  const secondarySeats = totalSeats - primarySeats;

  const primarySeat = useMemo(() => seatingPositions.find(s => s.isPrimary) || seatingPositions[0], [seatingPositions]);

  // Compute MLP override from primary seats (fallback: all seats)
  const mlpOverride = useMemo(() => {
    const list = seatingPositions?.filter(s => s.isPrimary);
    const seats = (list && list.length ? list : seatingPositions) || [];
    if (!seats.length) return null;

    const sum = seats.reduce(
      (a, s) => ({
        x: a.x + (Number(s.x) || 0),
        y: a.y + (Number(s.y) || 0),
        z: a.z + (Number(s.z) || 1.2), // Default ear height to 1.2m
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
      { value: 'all', label: 'All Rows (Average)' }
    ];
    
    if (rowCount >= 3) { // Changed seatingRows to rowCount
      options.splice(1, 0, { value: 'middle', label: 'Middle Row Center' });
    }
    
    return options;
  }, [rowCount]); // Changed seatingRows to rowCount

  // Validate current mlpBasis against available options
  const validMlpBasis = useMemo(() => {
    const validValues = mlpOptions.map(opt => opt.value);
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
        rowSpacingM, // NEW: Include rowSpacingM in reset
      });
    }
  }, [onGenerateSeating, seatsPerRow, seatingRows, seatSpacing, rowSpacingM]); // NEW: Add rowSpacingM dependency

  // Safe row spacing value for the input
  const safeRowSpacingValue =
    typeof rowSpacingM === 'number' && Number.isFinite(rowSpacingM)
      ? rowSpacingM
      : 1.8;

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
      <h3 className="text-base font-medium flex items-center gap-2" style={{color: '#1B1A1A', fontFamily: 'Futura PT Light, Century Gothic, sans-serif'}}>
        <Eye className="w-5 h-5" style={{color: '#625143'}} />
        Current Layout Analysis
      </h3>

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold" style={{color: '#1B1A1A'}}>{totalSeats}</div>
          <div className="text-xs" style={{color: '#625143'}}>Total Seats</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{color: '#213428'}}>{primarySeats}</div>
          <div className="text-xs" style={{color: '#625143'}}>Primary</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{color: '#625143'}}>{secondarySeats}</div>
          <div className="text-xs" style={{color: '#625143'}}>Secondary</div>
        </div>
      </div>

      {primarySeat && (
        <div className="p-3 rounded-lg" style={{border: '1px solid #C1B6AD', backgroundColor: '#F8F8F7'}}>
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-4 h-4" style={{color: '#213428'}} />
            <span className="text-sm font-medium" style={{color: '#1B1A1A'}}>Main Listening Position (MLP)</span>
          </div>
          <div className="text-xs space-y-1" style={{color: '#625143'}}>
            <p>Position: ({primarySeat.x.toFixed(2)}m, {primarySeat.y.toFixed(2)}m)</p>
            <p>Ear Height: {primarySeat.z.toFixed(2)}m</p>
          </div>
        </div>
      )}

      {rowCount > 1 && ( // Changed seatingRows to rowCount
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-2" style={{color: '#625143'}}>
            <Ruler className="w-4 h-4" />
            Row Heights (Ear Level)
          </Label>
          <div className="grid grid-cols-1 gap-2">
            {Array.from({ length: rowCount }, (_, i) => ( // Changed seatingRows to rowCount
              <div key={i + 1} className="flex items-center justify-between p-2 rounded" style={{backgroundColor: '#F8F8F7', border: '1px solid #C1B6AD'}}>
                <span className="text-xs" style={{color: '#1B1A1A'}}>Row {i + 1}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{color: '#625143'}}>{getEarHeightForRow(i + 1).toFixed(1)}m ear height</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

  {/* Controls */}
  <div className="space-y-4 font-body">
    {/* Reset Position */}
    <Button
      onClick={handleResetPosition}
      disabled={disabled}
      variant="outline"
      size="sm"
      className="w-full"
      style={{ borderColor: '#C1B6AD', color: '#3E4349' }}
    >
      <RotateCcw className="w-4 h-4 mr-2" />
      Reset Position
    </Button>

    {/* All seating parameters */}
    <div className="grid grid-cols-2 gap-4">
      {/* Rows & Seats (per-row editor) */}
      <div className="space-y-2 col-span-2">
        <Label
          className="text-sm font-medium"
          style={{ color: '#3E4349' }}
        >
          Rows & Seats
        </Label>

        <div className="space-y-2">
          {rowsArray.map((count, idx) => (
            <div
              key={`row-${idx}`}
              className="flex items-center gap-3"
            >
              <div
                className="w-24 text-sm"
                style={{ color: '#3E4349' }}
              >
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
                  color: '#1B1A1A',
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
                    rowSpacingM,
                  });
                }}
              />

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
                    rowSpacingM,
                  });
                }}
              >
                Remove
              </Button>
            </div>
          ))}

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
                  Math.max(1, Number(last) || 3),
                ];

                onGenerateSeating?.({
                  seatsPerRowByRow: next,
                  numberOfRows: next.length,
                  seatSpacing,
                  rowSpacingM,
                });
              }}
            >
              Add Row
            </Button>
          </div>
        </div>
      </div>

      {/* Seat Spacing (m) */}
      <div className="space-y-2">
        <Label
          className="text-sm font-medium"
          style={{ color: '#3E4349' }}
        >
          Seat Spacing (m)
        </Label>
        <Input
          type="number"
          min="0.5"
          max="1.2"
          step="0.1"
          value={seatSpacing}
          onChange={(e) =>
            onSeatSpacingChange?.(
              Math.max(
                0.5,
                Math.min(1.2, Number(e.target.value) || 0.8)
              )
            )
          }
          disabled={disabled}
          className="h-10"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #C1B6AD',
            color: '#1B1A1A',
          }}
        />
      </div>

      {/* Row Spacing (m) */}
      <div className="space-y-2">
        <Label
          className="text-sm font-medium"
          style={{ color: '#3E4349' }}
        >
          Row Spacing (m)
        </Label>
        <Input
          type="number"
          inputMode="decimal"
          min="0.8"
          max="4.0"
          step="0.1"
          value={safeRowSpacingValue}
          onChange={(e) => {
            if (disabled || rowCount <= 1) return;

            const raw = e.target.value;

            // Let the browser handle temporary empty / partial states
            if (raw === '') {
              // Don't push anything back to state yet
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

            // On blur, snap back to a clean, clamped value
            if (normalized !== '') {
              onRowSpacingChange?.(normalized);
            }
          }}
          disabled={disabled || rowCount <= 1}
          className="h-10"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #C1B6AD',
            color: '#1B1A1A',
          }}
        />
      </div>

      {/* Viewing Offset (m) */}
      <div className="space-y-2 col-span-2">
        <Label
          className="text-sm font-medium"
          style={{ color: '#3E4349' }}
        >
          Viewing Offset (m)
        </Label>
        <Input
          type="number"
          min="-2.0"
          max="2.0"
          step="0.1"
          value={seatingBlockOffset}
          onChange={(e) =>
            onSeatingBlockOffsetChange?.(
              clampViewingOffset(
                Number(e.target.value) || 0
              )
            )
          }
          disabled={disabled}
          className="h-10"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #C1B6AD',
            color: '#1B1A1A',
          }}
        />
      </div>

      {/* MLP Reference */}
      <div className="space-y-2 col-span-2">
        <Label
          className="text-sm font-medium"
          style={{ color: '#3E4349' }}
        >
          MLP Reference
        </Label>
        <Select
          value={validMlpBasis}
          onValueChange={handleMlpBasisChange}
          disabled={disabled || rowCount <= 1}
          modal={false}
        >
          <SelectTrigger
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #C1B6AD',
              color: '#1B1A1A',
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={6}
            className="z-[70]"
          >
            {mlpOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
  />
</div>
);
}