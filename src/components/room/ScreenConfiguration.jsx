"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Info, Eye, Monitor, AlertCircle } from "lucide-react"; // Import AlertCircle
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normaliseScreenConfig } from "@/components/models/screen/normalise";
import { WIDTH_PRESETS } from "@/components/data/screenSizes"; // Keep this import, even if not directly used in the final select list
import { useAppState } from "@/components/AppStateProvider";
import RoomVisualisation from "./RoomVisualisation";
import { rp23DisplayAngleDeg, rp23LevelForAngleDeg } from "@/components/utils/viewingAngleUtils";

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

export default function ScreenConfiguration(props) {
  const {
    screen,
    onScreenChange,
    subsBehindScreen = false,
    dimensions,
    seatingPositions = [],
    dolbyConfig = "5.1",
    disabled
  } = props;

  // Read live screen front plane from context
  const appState = useAppState();
  const screenFrontPlaneM = Number(appState?.screenFrontPlaneM ?? 0);
  // Also extracting placedSpeakers and subwoofers as they are used by RoomVisualisation
  const { placedSpeakers, subwoofers } = appState || {};

  // Debounced input handling
  const [inputBuffer, setInputBuffer] = React.useState({});
  const [debounceTimeout, setDebounceTimeout] = React.useState(null);

  const screenData = useMemo(() => screen || {}, [screen]);

  // Memoize manual size to prevent dependency changes on every render
  const manualSize = useMemo(() => {
    return screenData.manualSize || {
      enabled: false,
      mode: "diagonal",
      diagonalInches: 100,
      aspect: "16:9",
      customAspectW: 16,
      customAspectH: 9,
      widthM: 0,
      heightM: 0
    };
  }, [screenData.manualSize]);

  const borderThicknessM = Number(screenData.borderThicknessM) || 0.08;

  // Compute per-row live metrics source data
  const seatingRowsLive = useMemo(() => {
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return [];

    const rowsMap = new Map();

    seatingPositions.forEach((seat) => {
      const rowNumber = Number(seat?.rowNumber);
      const x = Number(seat?.x);
      const y = Number(seat?.y);
      const z = Number.isFinite(Number(seat?.z)) ? Number(seat?.z) : 1.2;

      if (!Number.isFinite(rowNumber) || !Number.isFinite(y)) return;

      if (!rowsMap.has(rowNumber)) {
        rowsMap.set(rowNumber, { rowNumber, seats: [] });
      }

      rowsMap.get(rowNumber).seats.push({
        ...seat,
        x: Number.isFinite(x) ? x : null,
        y,
        z,
      });
    });

    return Array.from(rowsMap.values())
      .map((row) => {
        const sortedSeats = [...row.seats].sort((a, b) => {
          const ax = Number.isFinite(a.x) ? a.x : Number.POSITIVE_INFINITY;
          const bx = Number.isFinite(b.x) ? b.x : Number.POSITIVE_INFINITY;
          return ax - bx;
        });
        const centreSeat = sortedSeats[Math.floor(sortedSeats.length / 2)] || null;
        const rowCentreY = sortedSeats.reduce((sum, seat) => sum + seat.y, 0) / sortedSeats.length;
        const rowEarHeight = sortedSeats.reduce((sum, seat) => sum + seat.z, 0) / sortedSeats.length;

        return {
          rowNumber: row.rowNumber,
          centreSeat,
          rowCentreY,
          rowEarHeight,
        };
      })
      .sort((a, b) => a.rowNumber - b.rowNumber);
  }, [seatingPositions]);

  // Compute viewable dimensions
  const viewableDimensions = useMemo(() => {
    if (manualSize.enabled) {
      if (manualSize.mode === "diagonal") {
        const diagonal = Number(manualSize.diagonalInches) || 100;
        let aspectW, aspectH;
        
        if (manualSize.aspect === "Custom") {
          aspectW = Number(manualSize.customAspectW) || 16;
          aspectH = Number(manualSize.customAspectH) || 9;
        } else {
          const parts = manualSize.aspect.split(':');
          aspectW = Number(parts[0]) || 16;
          aspectH = Number(parts[1]) || 9;
        }
        
        const aspectRatio = aspectW / aspectH;
        const widthInches = diagonal * (aspectW / Math.sqrt(aspectW ** 2 + aspectH ** 2));
        const heightInches = widthInches / aspectRatio;
        
        return {
          widthM: widthInches * 0.0254,
          heightM: heightInches * 0.0254
        };
      } else {
        return {
          widthM: Number(manualSize.widthM) || 2.54,
          heightM: Number(manualSize.heightM) || 1.43
        };
      }
    } else {
      const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };
      const widthInches = (screenData.tvPresetKey && TV_KEY_TO_INCHES[screenData.tvPresetKey])
        ? TV_KEY_TO_INCHES[screenData.tvPresetKey]
        : (Number(screenData.visibleWidthInches) || 100);
      const aspectRatio = screenData.aspectRatio || "16:9";
      const [arW, arH] = aspectRatio.split(':').map(Number);
      const ratio = (arW && arH) ? arW / arH : 16 / 9;
      
      const widthM = widthInches * 0.0254;
      const heightM = widthM / ratio;
      
      return { widthM, heightM };
    }
  }, [manualSize, screenData.visibleWidthInches, screenData.aspectRatio, screenData.tvPresetKey]);

  // Compute required front wall to screen distance based on actual speaker depths
  const requiredFrontWallToScreenM = useMemo(() => {
    const gapWallToSpeakerM = 0.01;
    const gapSpeakerToScreenM = 0.01;
    
    // Get LCR speakers (behind screen)
    const lcrRoles = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
    const lcrSpeakers = (placedSpeakers || []).filter(s => {
      const role = String(s.role || '').toUpperCase();
      return lcrRoles.has(role) && s.model;
    });
    
    // Get max depth from LCR speakers
    let maxDepthM = 0;
    for (const spk of lcrSpeakers) {
      const meta = getSpeakerModelMeta(spk.model);
      const depthM = Number(meta?.depthM) || 0.082;
      if (depthM > maxDepthM) {
        maxDepthM = depthM;
      }
    }
    
    return gapWallToSpeakerM + maxDepthM + gapSpeakerToScreenM;
  }, [placedSpeakers]);

  // Live metrics computation - per row, uses VIEWABLE width only
  const liveMetrics = useMemo(() => {
    const rows = seatingRowsLive.map((row) => {
      const sourceSeatY = Number(row.centreSeat?.y);
      const sourceSeatZ = Number.isFinite(Number(row.centreSeat?.z)) ? Number(row.centreSeat.z) : 1.2;
      const viewingDistance = Math.max(0, sourceSeatY - screenFrontPlaneM);

      if (!Number.isFinite(sourceSeatY) || viewingDistance <= 0.10) {
        return {
          ...row,
          sourceSeatY,
          sourceSeatZ,
          viewingDistance,
          rawHorizontalAngle: 0,
          rawVerticalAngle: 0,
          displayHorizontal: null,
          displayVertical: null,
          level: null,
          valid: false,
        };
      }

      const rawHorizontalAngle = 2 * Math.atan((viewableDimensions.widthM / 2) / viewingDistance) * (180 / Math.PI);
      const rawVerticalAngle = 2 * Math.atan((viewableDimensions.heightM / 2) / viewingDistance) * (180 / Math.PI);

      return {
        ...row,
        sourceSeatY,
        sourceSeatZ,
        viewingDistance,
        rawHorizontalAngle,
        rawVerticalAngle,
        displayHorizontal: rp23DisplayAngleDeg(rawHorizontalAngle),
        displayVertical: Math.round(rawVerticalAngle),
        level: rp23LevelForAngleDeg(rawHorizontalAngle),
        valid: true,
      };
    });

    return {
      rows,
      valid: rows.some((row) => row.valid),
    };
  }, [seatingRowsLive, screenFrontPlaneM, viewableDimensions]);

  // Overall dimensions including border
  const overallDimensions = useMemo(() => {
    return {
      widthM: viewableDimensions.widthM + 2 * borderThicknessM,
      heightM: viewableDimensions.heightM + 2 * borderThicknessM
    };
  }, [viewableDimensions, borderThicknessM]);

  // Fire custom event when metrics change
  useEffect(() => {
    if (typeof window !== 'undefined' && liveMetrics.valid) {
      const firstValidRow = liveMetrics.rows.find((row) => row.valid) || null;
      const event = new CustomEvent('b44:screen:metrics', {
        detail: {
          hdeg: firstValidRow?.displayHorizontal ?? 0,
          vdeg: firstValidRow?.displayVertical ?? 0,
          viewableW_m: viewableDimensions.widthM,
          viewableH_m: viewableDimensions.heightM,
          overallW_m: overallDimensions.widthM,
          overallH_m: overallDimensions.heightM,
          distanceToMLP_m: firstValidRow?.viewingDistance ?? 0
        }
      });
      window.dispatchEvent(event);
    }
  }, [liveMetrics, viewableDimensions, overallDimensions]);

  const handleUpdate = useCallback((updates) => {
    if (onScreenChange && typeof onScreenChange === 'function') {
      onScreenChange({ ...screenData, ...updates });
    }
  }, [onScreenChange, screenData]);

  // Debounced input handler
  const handleDebouncedInput = useCallback((field, value) => {
    setInputBuffer(prev => ({ ...prev, [field]: value }));
    
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    
    const timeout = setTimeout(() => {
      // When debounce fires, update the actual state and clear the buffer for this field
      setInputBuffer(prev => {
        const { [field]: _, ...rest } = prev;
        return rest;
      });
      
      if (field.startsWith('manual.')) {
        const subField = field.replace('manual.', '');
        handleUpdate({
          manualSize: { ...manualSize, [subField]: value }
        });
      } else {
        handleUpdate({ [field]: value });
      }
    }, 150);
    
    setDebounceTimeout(timeout);
  }, [debounceTimeout, manualSize, handleUpdate]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [debounceTimeout]);

  const heightFromFloorM = Number.isFinite(screenData.heightFromFloorM)
    ? Number(screenData.heightFromFloorM)
    : 0.50;

  const normalised = useMemo(() => {
    return normaliseScreenConfig(screenData);
  }, [screenData]);

  // Convert meters to cm and inches
  const toCm = (m) => Math.round(m * 100);
  const toInches = (m) => Math.round(m * 39.3701 * 10) / 10;

  return (
    <>
      <div className="space-y-4 font-sans" style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[#3E4349] font-medium text-sm">Viewing Width (inches)</Label>
              <Select
                value={(() => {
                  const TV_KEY_TO_VAL = { tv65: "55.55", tv77: "67.36", tv83: "72.52", tv100: "87.80" };
                  if (screenData.tvPresetKey && TV_KEY_TO_VAL[screenData.tvPresetKey]) return TV_KEY_TO_VAL[screenData.tvPresetKey];
                  return Number.isInteger(Number(screenData.visibleWidthInches ?? 100)) ? String(Number(screenData.visibleWidthInches ?? 100)) : Number(screenData.visibleWidthInches ?? 100).toFixed(2);
                })()}
                onValueChange={(val) => {
                  const TV_PRESET_MAP = {
                    "tv65":  { label: 'TV 65"',  widthMm: 1411 },
                    "tv77":  { label: 'TV 77"',  widthMm: 1711 },
                    "tv83":  { label: 'TV 83"',  widthMm: 1872 },
                    "tv100": { label: 'TV 100"', widthMm: 2230 },
                  };
                  const VAL_TO_KEY = {
                    "55.55": "tv65",
                    "67.36": "tv77",
                    "72.52": "tv83",
                    "87.80": "tv100",
                  };
                  const presetKey = VAL_TO_KEY[val];
                  if (presetKey && TV_PRESET_MAP[presetKey]) {
                    handleUpdate({
                      visibleWidthInches: Number(val),
                      aspectRatio: "16:9",
                      borderThicknessM: 0.005,
                      tvPresetKey: presetKey,
                      tvWidthMm: TV_PRESET_MAP[presetKey].widthMm,
                    });
                    return;
                  }
                  handleUpdate({
                    visibleWidthInches: Number(val),
                    borderThicknessM: 0.08,
                    tvPresetKey: null,
                    tvWidthMm: null,
                  });
                }}
                disabled={disabled || manualSize.enabled}
                modal={false}
              >
                <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-10 hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                  <SelectValue>
                    {(() => {
                      const TV_KEY_TO_LABEL = { tv65: 'TV 65"', tv77: 'TV 77"', tv83: 'TV 83"', tv100: 'TV 100"' };
                      if (screenData.tvPresetKey && TV_KEY_TO_LABEL[screenData.tvPresetKey]) return TV_KEY_TO_LABEL[screenData.tvPresetKey];
                      const valStr = Number(screenData.visibleWidthInches ?? 100).toFixed(2);
                      return { "55.55": 'TV 65"', "67.36": 'TV 77"', "72.52": 'TV 83"', "87.80": 'TV 100"' }[valStr] ?? `${String(screenData.visibleWidthInches ?? 100)}"`;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent 
                  position="popper" 
                  sideOffset={6}
                  className="z-[70] bg-white border-[#DCDBD6]"
                >
                  <SelectItem value="55.55" className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                    TV 65"
                  </SelectItem>
                  <SelectItem value="67.36" className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                    TV 77"
                  </SelectItem>
                  <SelectItem value="72.52" className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                    TV 83"
                  </SelectItem>
                  <SelectItem value="87.80" className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
                    TV 100"
                  </SelectItem>
                  {[80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250].map((width) => (
                    <SelectItem 
                      key={width} 
                      value={String(width)} 
                      className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]"
                    >
                      {width}"
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[#3E4349] font-medium text-sm">Aspect Ratio</Label>
              <Select
                value={screenData.aspectRatio || "16:9"}
                onValueChange={(val) => handleUpdate({ aspectRatio: val })}
                disabled={disabled || manualSize.enabled}
                modal={false}
              >
                <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-10 hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent 
                  position="popper" 
                  sideOffset={6}
                  className="z-[70] bg-white border-[#DCDBD6]"
                >
                  <SelectItem value="16:9" className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">16:9 (1.78)</SelectItem>
                  <SelectItem value="2.35:1" className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">2.35:1 (Scope)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#3E4349] font-medium text-sm">Screen Height from Floor (cm)</Label>
            <Input
              type="number"
              step="1"
              min="0"
              max="300"
              value={inputBuffer['heightFromFloorM'] !== undefined 
                ? Math.round(inputBuffer['heightFromFloorM'] * 100)
                : Math.round(heightFromFloorM * 100)}
              onChange={(e) => {
                const cm = Number(e.target.value);
                handleDebouncedInput('heightFromFloorM', cm / 100);
              }}
              onBlur={() => {
                if (debounceTimeout) {
                  clearTimeout(debounceTimeout);
                  setDebounceTimeout(null);
                }
                const buffered = inputBuffer['heightFromFloorM'];
                if (buffered !== undefined) {
                  handleUpdate({ heightFromFloorM: buffered });
                  setInputBuffer(prev => {
                    const { heightFromFloorM: _, ...rest } = prev;
                    return rest;
                  });
                }
              }}
              disabled={disabled}
              className="w-full p-2 bg-white border border-[#DCDBD6] rounded-md focus:border-[#213428] focus:ring-1 focus:ring-[#213428]"
            />
          </div>
        </div>

        {/* Manual Screen Size Override */}
        <div className="space-y-4 p-4 border border-[#DCDBD6] rounded-lg bg-[#F8F8F7]">
          <div className="flex items-center justify-between">
            <Label className="text-[#3E4349] font-medium text-sm">Manual Screen Size Override</Label>
            <Switch
              checked={manualSize.enabled}
              onCheckedChange={(enabled) => handleUpdate({ 
                manualSize: { ...manualSize, enabled }
              })}
              disabled={disabled}
            />
          </div>

          {manualSize.enabled && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[#3E4349] font-medium text-sm">Mode</Label>
                <Select
                  value={manualSize.mode}
                  onValueChange={(mode) => handleUpdate({ 
                    manualSize: { ...manualSize, mode }
                  })}
                  disabled={disabled}
                  modal={false}
                >
                  <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={6} className="z-[70] bg-white border-[#DCDBD6]">
                    <SelectItem value="diagonal">Diagonal + Aspect</SelectItem>
                    <SelectItem value="wh">Width × Height</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {manualSize.mode === "diagonal" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#3E4349] font-medium text-sm">Diagonal (inches)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="20"
                      max="500"
                      value={inputBuffer['manual.diagonalInches'] ?? manualSize.diagonalInches}
                      onChange={(e) => handleDebouncedInput('manual.diagonalInches', Number(e.target.value))}
                      disabled={disabled}
                      className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#3E4349] font-medium text-sm">Aspect Ratio</Label>
                    <Select
                      value={manualSize.aspect}
                      onValueChange={(aspect) => handleUpdate({ 
                        manualSize: { ...manualSize, aspect }
                      })}
                      disabled={disabled}
                      modal={false}
                    >
                      <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={6} className="z-[70] bg-white border-[#DCDBD6]">
                        <SelectItem value="16:9">16:9</SelectItem>
                        <SelectItem value="17:9">17:9</SelectItem>
                        <SelectItem value="2.35:1">2.35:1</SelectItem>
                        <SelectItem value="2.40:1">2.40:1</SelectItem>
                        <SelectItem value="Custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {manualSize.aspect === "Custom" && (
                    <div className="col-span-2 grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min="1"
                        step="0.1"
                        placeholder="W"
                        value={inputBuffer['manual.customAspectW'] ?? manualSize.customAspectW}
                        onChange={(e) => handleDebouncedInput('manual.customAspectW', Number(e.target.value))}
                        disabled={disabled}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-10"
                      />
                      <Input
                        type="number"
                        min="1"
                        step="0.1"
                        placeholder="H"
                        value={inputBuffer['manual.customAspectH'] ?? manualSize.customAspectH}
                        onChange={(e) => handleDebouncedInput('manual.customAspectH', Number(e.target.value))}
                        disabled={disabled}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-10"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#3E4349] font-medium text-sm">Width (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.5"
                      max="20"
                      value={inputBuffer['manual.widthM'] ?? manualSize.widthM}
                      onChange={(e) => handleDebouncedInput('manual.widthM', Number(e.target.value))}
                      disabled={disabled}
                      className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#3E4349] font-medium text-sm">Height (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.3"
                      max="15"
                      value={inputBuffer['manual.heightM'] ?? manualSize.heightM}
                      onChange={(e) => handleDebouncedInput('manual.heightM', Number(e.target.value))}
                      disabled={disabled}
                      className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-10"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Border Thickness */}
        <div className="space-y-2">
          <Label className="text-[#3E4349] font-medium text-sm">Border Thickness (cm)</Label>
          <Input
            type="number"
            step="0.5"
            min="0"
            max="50"
            value={inputBuffer['borderThicknessM'] !== undefined 
  ? Number((inputBuffer['borderThicknessM'] * 100).toFixed(1))
  : Number((borderThicknessM * 100).toFixed(1))}
            onChange={(e) => {
              const cm = parseFloat(e.target.value || '0');
              handleDebouncedInput('borderThicknessM', cm / 100);
            }}
            onBlur={() => {
              if (debounceTimeout) {
                clearTimeout(debounceTimeout);
                setDebounceTimeout(null);
              }
              const buffered = inputBuffer['borderThicknessM'];
              if (buffered !== undefined) {
                handleUpdate({ borderThicknessM: buffered });
                setInputBuffer(prev => {
                  const { borderThicknessM: _, ...rest } = prev;
                  return rest;
                });
              }
            }}
            disabled={disabled}
            className="w-32 bg-white border-[#DCDBD6] text-[#1B1A1A] h-10 focus:border-[#213428] focus:ring-1 focus:ring-[#213428]"
          />
        </div>

        {/* Live Metrics Block */}
        <div className="space-y-3 p-4 border border-[#213428] rounded-lg bg-white">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#213428]" />
            <Label className="text-[#213428] font-medium text-sm">Live Metrics</Label>
          </div>
          
          {!liveMetrics.valid ? (
            <div className="flex items-center gap-2 text-amber-600 text-xs">
              <Info className="w-4 h-4" />
              Move seating away from screen to compute angles
            </div>
          ) : (
            <>
              <div className="space-y-3 text-sm">
                {liveMetrics.rows.map((row) => (
                  <div key={row.rowNumber} className="rounded-md border border-[#E5E5E5] p-3">
                    <div className="text-[#1B1A1A] font-medium">Row {row.rowNumber}</div>
                    {row.valid ? (
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[#625143] text-xs">Horizontal</Label>
                          <div className="text-[#1B1A1A] font-medium">{row.displayHorizontal}°</div>
                        </div>
                        <div>
                          <Label className="text-[#625143] text-xs">Vertical</Label>
                          <div className="text-[#1B1A1A] font-medium">{row.displayVertical}°</div>
                        </div>
                        <div>
                          <Label className="text-[#625143] text-xs">Distance</Label>
                          <div className="text-[#1B1A1A] font-medium">{row.viewingDistance.toFixed(2)}m</div>
                        </div>
                        <div>
                          <Label className="text-[#625143] text-xs">RP23</Label>
                          <div className="text-[#1B1A1A] font-medium">{row.level ? `Level ${row.level.replace('L', '')}` : '—'}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-amber-600 text-xs">Move this row away from screen to compute angles</div>
                    )}
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-[#625143] text-xs">Viewable area</Label>
                    <div className="text-[#1B1A1A] font-medium">
                      {toCm(viewableDimensions.widthM)} × {toCm(viewableDimensions.heightM)} cm
                      <span className="text-[#625143] ml-1">
                        ({toInches(viewableDimensions.widthM)}" × {toInches(viewableDimensions.heightM)}")
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[#625143] text-xs">Overall with border</Label>
                    <div className="text-[#1B1A1A] font-medium">
                      {toCm(overallDimensions.widthM)} × {toCm(overallDimensions.heightM)} cm
                      <span className="text-[#625143] ml-1">
                        ({toInches(overallDimensions.widthM)}" × {toInches(overallDimensions.heightM)}")
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[#625143] text-xs">Distance from Front Wall to Screen</Label>
                    <div className="text-[#1B1A1A] font-medium">
                      {Math.round((screen?.screenPlaneY_m ?? 0) * 100)} cm
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const roomWidth = dimensions?.width_m || dimensions?.width || 0;
                const roomHeight = dimensions?.height_m || dimensions?.height || 0;
                
                const screenWidth = overallDimensions.widthM;
                const screenHeight = overallDimensions.heightM;
                const totalHeight = screenHeight + heightFromFloorM;
                
                const widthClearance = roomWidth - screenWidth;
                const heightClearance = roomHeight - totalHeight;
                
                const widthWarning = widthClearance < 0;
                const widthCaution = !widthWarning && widthClearance < 0.40;
                
                const heightWarning = heightClearance < 0;
                const heightCaution = !heightWarning && heightClearance < 0.20;
                
                const hasAnyAlert = widthWarning || widthCaution || heightWarning || heightCaution;
                
                if (!hasAnyAlert) return null;
                
                return (
                  <div className="space-y-2 mt-3 pt-3 border-t border-[#E5E5E5]">
                    {widthWarning && (
                      <div className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200">
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-red-800">
                          <strong>Warning:</strong> Screen width ({toCm(screenWidth)}cm) exceeds room width ({toCm(roomWidth)}cm)
                        </div>
                      </div>
                    )}
                    {widthCaution && (
                      <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200">
                        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800">
                          <strong>Caution:</strong> Screen width is within {toCm(widthClearance)}cm of room width. Consider 40cm+ clearance.
                        </div>
                      </div>
                    )}
                    
                    {heightWarning && (
                      <div className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200">
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-red-800">
                          <strong>Warning:</strong> Screen height + floor height ({toCm(totalHeight)}cm) exceeds room height ({toCm(roomHeight)}cm)
                        </div>
                      </div>
                    )}
                    {heightCaution && (
                      <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200">
                        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800">
                          <strong>Caution:</strong> Screen top is within {toCm(heightClearance)}cm of ceiling. Consider 20cm+ clearance.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Mount the plan, wiring the callback - Hidden but active for calculations */}
      <div style={{ display: 'none' }}>
        <RoomVisualisation
          placedSpeakers={placedSpeakers}
          subwoofers={subwoofers}
          screen={screen}
          dimensions={dimensions}
          seatingPositions={seatingPositions}
          aimAtMLP={true}
        />
      </div>
    </>
  );
}