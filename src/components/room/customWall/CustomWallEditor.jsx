"use client";

/**
 * CustomWallEditor
 * ----------------
 * Sidebar editor for a selected Custom Wall: length, thickness, angle,
 * endpoint X/Y, restriction toggle, duplicate and delete.
 *
 * Pure presentation + onChange callbacks — no direct appState or entity
 * access. Receives the selected wall and emits updated wall objects via
 * onUpdate(id, patch) and onDelete(id) / onDuplicate(id).
 */

import React from "react";
import { Copy, Trash2, Link2, Link2Off } from "lucide-react";
import { Label } from "@/components/ui/Label";
import StepperInput from "@/components/ui/StepperInput";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  wallLength,
  wallAngleDeg,
  setWallLength,
  setWallAngle,
  setEndpoint,
  translateWall,
  duplicateCustomWall,
} from "@/components/room/customWall/customWallGeometry";

const groupTitleStyle = {
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#625143",
  marginBottom: "10px",
};
const fieldLabelStyle = "block mb-1.5 text-xs text-[#6B7280]";
const helperTextStyle = { fontSize: "10px", color: "#9CA3AF", marginTop: "4px" };

const round2 = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 100) / 100 : 0);

export default function CustomWallEditor({
  wall,
  widthM,
  lengthM,
  onUpdate,
  onDelete,
  onDuplicate,
  onClose,
}) {
  if (!wall) return null;

  const len = wallLength(wall);
  const angle = wallAngleDeg(wall);
  const thickness = Math.max(0.02, Number(wall.thickness_m) || 0.10);

  const update = (patch) => onUpdate?.(wall.id, patch);

  const handleLength = (newLen) => {
    const next = setWallLength(wall, newLen);
    update({ p1: next.p1, p2: next.p2 });
  };
  const handleAngle = (newAngle) => {
    const next = setWallAngle(wall, newAngle);
    update({ p2: next.p2 });
  };
  const handleThickness = (t) => {
    update({ thickness_m: Math.max(0.02, t) });
  };
  const handleEndpoint = (which, field, value) => {
    const current = wall[which] || { x: 0, y: 0 };
    const next = setEndpoint(wall, which, field === 'x' ? value : current.x, field === 'y' ? value : current.y);
    update({ [which]: next[which] });
  };
  const handleRestriction = (on) => {
    update({ restriction: on ? 'on' : 'off' });
  };
  const handleNudge = (dx, dy) => {
    const next = translateWall(wall, dx, dy);
    update({ p1: next.p1, p2: next.p2 });
  };
  const handleDuplicate = () => {
    const copy = duplicateCustomWall(wall);
    onDuplicate?.(wall.id, copy);
  };

  return (
    <div className="rounded-lg border" style={{ borderColor: '#DCDBD6', background: '#FFFFFF', borderLeftWidth: 3, borderLeftColor: '#5B5148' }}>
      <div className="flex justify-between items-center px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium shrink-0" style={{ color: '#5B5148' }}>
            {wall.label || 'Custom Wall'}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleDuplicate}
            className="p-1.5 rounded-md transition-colors hover:bg-[#F3F2EF]"
            style={{ color: '#625143' }}
            aria-label="Duplicate wall"
            title="Duplicate"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete?.(wall.id)}
            className="p-1.5 rounded-md transition-colors hover:bg-[#F3F2EF]"
            style={{ color: '#9CA3AF' }}
            aria-label="Delete wall"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md transition-colors hover:bg-[#F3F2EF]"
              style={{ color: '#9CA3AF' }}
              aria-label="Close editor"
              title="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-1 space-y-3">
        {/* Label */}
        <div>
          <Label className={fieldLabelStyle}>Label</Label>
          <Input
            type="text"
            value={wall.label ?? ''}
            onChange={(e) => update({ label: e.target.value })}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
            placeholder="Custom Wall"
          />
        </div>

        {/* Dimensions */}
        <div style={groupTitleStyle}>Dimensions</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className={fieldLabelStyle}>Length (m)</Label>
            <StepperInput
              value={round2(len)}
              step={0.05}
              min={0.05}
              onChange={handleLength}
            />
          </div>
          <div>
            <Label className={fieldLabelStyle}>Thickness (m)</Label>
            <StepperInput
              value={round2(thickness)}
              step={0.01}
              min={0.02}
              onChange={handleThickness}
            />
          </div>
          <div>
            <Label className={fieldLabelStyle}>Angle (°)</Label>
            <StepperInput
              value={angle}
              step={1}
              min={-180}
              max={180}
              onChange={handleAngle}
            />
          </div>
        </div>

        {/* Endpoint 1 */}
        <div style={groupTitleStyle}>Endpoint A</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className={fieldLabelStyle}>X (m)</Label>
            <StepperInput
              value={round2(wall.p1?.x)}
              step={0.01}
              min={0}
              max={Math.max(0, Number(widthM) || 0)}
              onChange={(v) => handleEndpoint('p1', 'x', v)}
            />
          </div>
          <div>
            <Label className={fieldLabelStyle}>Y (m)</Label>
            <StepperInput
              value={round2(wall.p1?.y)}
              step={0.01}
              min={0}
              max={Math.max(0, Number(lengthM) || 0)}
              onChange={(v) => handleEndpoint('p1', 'y', v)}
            />
          </div>
        </div>

        {/* Endpoint 2 */}
        <div style={groupTitleStyle}>Endpoint B</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className={fieldLabelStyle}>X (m)</Label>
            <StepperInput
              value={round2(wall.p2?.x)}
              step={0.01}
              min={0}
              max={Math.max(0, Number(widthM) || 0)}
              onChange={(v) => handleEndpoint('p2', 'x', v)}
            />
          </div>
          <div>
            <Label className={fieldLabelStyle}>Y (m)</Label>
            <StepperInput
              value={round2(wall.p2?.y)}
              step={0.01}
              min={0}
              max={Math.max(0, Number(lengthM) || 0)}
              onChange={(v) => handleEndpoint('p2', 'y', v)}
            />
          </div>
        </div>

        {/* Nudge */}
        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={() => handleNudge(0, -0.1)} style={nudgeBtn}>↑</button>
          <button type="button" onClick={() => handleNudge(0, 0.1)} style={nudgeBtn}>↓</button>
          <button type="button" onClick={() => handleNudge(-0.1, 0)} style={nudgeBtn}>←</button>
          <button type="button" onClick={() => handleNudge(0.1, 0)} style={nudgeBtn}>→</button>
        </div>

        {/* Restriction toggle */}
        <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid #ECEAE5', paddingTop: 10 }}>
          <div>
            <Label className={fieldLabelStyle} style={{ marginBottom: 2 }}>Placement Restriction</Label>
            <div style={helperTextStyle}>Show orange clash warning for speakers overlapping this wall. Never moves speakers.</div>
          </div>
          <Switch
            checked={wall.restriction === 'on'}
            onCheckedChange={handleRestriction}
          />
        </div>
        {wall.restriction === 'on' && (
          <div style={{ fontSize: 10, color: '#C76A1B', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Link2 size={11} /> Restriction active — visual clash only.
          </div>
        )}
        {wall.restriction !== 'on' && (
          <div style={{ fontSize: 10, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Link2Off size={11} /> Visual only — no clash checking.
          </div>
        )}
      </div>
    </div>
  );
}

const nudgeBtn = {
  border: '1px solid #DCDBD6',
  borderRadius: 6,
  background: '#FFF',
  color: '#625143',
  fontSize: 14,
  padding: '6px 0',
  cursor: 'pointer',
  fontFamily: 'inherit',
};