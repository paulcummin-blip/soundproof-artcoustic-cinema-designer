"use client";

import React from "react";
import { useAppState } from "@/components/AppStateProvider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const SUB_MODELS = ["SUB2-12", "SUB3-12", "SUB4-12"];

/**
 * cfg: { count?: number, items?: Array<{ model: string }> }
 * - Defaults to none selected (count:0)
 * - Max 4 positions
 */
export default function SubwooferSelector({ title, cfg, onChange, disabled = false }) {
  const appState = useAppState();
  const isFront = String(title || "").toLowerCase().includes("front");
  const screenPlaneLocked = appState?.screenPlaneLocked ?? false;
  const safeCount = Math.max(0, Math.min(4, Number(cfg?.count ?? 0)));
  const safeModel = cfg?.model || "SUB2-12";

  const commit = (next) => {
    if (typeof onChange !== "function") return;
    const newCount = Math.max(0, Math.min(4, Number(next?.count ?? safeCount)));
    const existingPositions = Array.isArray(cfg?.positions) ? cfg.positions : [];

    // Build new positions: preserve existing slots, only add/remove as needed
    let newPositions;
    if (newCount <= existingPositions.length) {
      // Shrink: keep first N
      newPositions = existingPositions.slice(0, newCount);
    } else {
      // Grow: keep existing, append defaults for new slots only
      const roomW = cfg?.roomWidthM ?? 4.5;
      const defaults = buildDefaultPositions(newCount, roomW);
      newPositions = [
        ...existingPositions,
        ...defaults.slice(existingPositions.length, newCount),
      ];
    }

    onChange({
      model: next?.model ?? safeModel,
      count: newCount,
      positions: newPositions,
      tuning: Array.isArray(cfg?.tuning) ? cfg.tuning : [],
    });
  };

  // Generate evenly-spaced default positions for N subs across room width
  function buildDefaultPositions(count, roomW) {
    if (count === 0) return [];
    if (count === 1) return [{ x: roomW / 2, y: 0.3 }];
    return Array.from({ length: count }, (_, i) => ({
      x: (roomW / (count + 1)) * (i + 1),
      y: 0.3,
    }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{title}</Label>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Quantity</Label>
          <Select
            value={String(safeCount)}
            disabled={disabled}
            onValueChange={(val) => commit({ count: Number(val) })}
          >
            <SelectTrigger className="h-10 w-[90px] bg-white border-[#DCDBD6] text-2xl font-semibold text-[#213428]">
              <SelectValue className="text-2xl font-semibold" style={{ color: "#213428" }} />
            </SelectTrigger>
            <SelectContent>
              {[0,1,2,3,4].map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">
          {safeCount === 0 ? "Model (disabled — set quantity first)" : "Model"}
        </Label>
        <Select
          value={safeModel}
          disabled={disabled || safeCount === 0}
          onValueChange={(val) => commit({ model: val })}
        >
          <SelectTrigger className="h-10 bg-white border-[#DCDBD6] text-2xl font-semibold text-[#213428]">
            <SelectValue placeholder="Choose model" className="text-2xl font-semibold" style={{ color: "#213428" }} />
          </SelectTrigger>
          <SelectContent>
            {SUB_MODELS.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isFront && (
        <div className="pt-2 border-t border-[#DCDBD6] space-y-1">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium text-[#1B1A1A]">Lock screen position</Label>
              <p className="text-[11px] text-muted-foreground leading-tight">Keeps the screen at its current depth even if subwoofer position changes.</p>
            </div>
            <Switch
              checked={screenPlaneLocked}
              onCheckedChange={(checked) => {
                if (checked) {
                  const live = appState?.screenFrontPlaneM;
                  if (Number.isFinite(live)) {
                    appState.setLockedScreenFrontPlaneM(live);
                  }
                  appState.setScreenPlaneLocked(true);
                } else {
                  appState.setScreenPlaneLocked(false);
                }
              }}
            />
          </div>
          {screenPlaneLocked && Number.isFinite(appState?.lockedScreenFrontPlaneM) && (
            <p className="text-[11px] text-[#213428] font-medium">
              Locked at {(appState.lockedScreenFrontPlaneM * 100).toFixed(1)} cm
            </p>
          )}
        </div>
      )}
    </div>
  );
}