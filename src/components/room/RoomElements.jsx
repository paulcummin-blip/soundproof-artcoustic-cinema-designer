"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

export default function RoomElements({ elements = [], onChange, roomDims }) {
  // Create a stable next id that won't collide if you add quickly
  const makeId = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  const addDoor = () => {
    const elementCount = (elements || []).length;
    const newElement = {
      id: makeId(),
      type: 'door',

      // Placement
      wall: 'rear', // Front / Rear / Left / Right (screen is on Front)
      length_m: 0.9, // along the wall
      thickness_m: 0.05, // 5cm

      // Position along the wall:
      // - If Front/Rear: use x_m (0..room width)
      // - If Left/Right: use y_m (0..room length)
      x_m: 1.0,
      y_m: 1.0,

      // Vertical placement (kept for later – you already had z_position)
      z_m: 0,

      // UI
      label: `Element ${elementCount + 1}`,
    };

    onChange([...(elements || []), newElement]);
  };

  const addProjector = () => {
    const elementCount = (elements || []).length;

    // Try to centre on the rear wall, with 0.10m buffer from the wall (rear wall),
    // and store a ceiling mount height with 0.05m buffer from ceiling.
    // If room dims aren't available here, fall back safely.
    const roomL = Number(roomDims?.lengthM ?? roomDims?.length ?? 0) || 0;
    const roomH = Number(roomDims?.heightM ?? roomDims?.height ?? 2.4) || 2.4;

    const projD = 0.517; // depth into room (m)
    const projH = 0.210; // height (m)

    // Centre the projector block on the room width
    const roomW = Number(roomDims?.widthM ?? roomDims?.width ?? 0) || 0;
    const projW = 0.46; // 460mm

    // Ensure centre of block sits on room centreline
    const centredX = roomW > 0
      ? (roomW / 2) - (projW / 2)
      : 0;

    const newElement = {
      id: makeId(),
      type: 'projector',

      // Placement (start on rear wall)
      wall: 'rear',

      // Plan footprint (top-down rectangle)
      length_m: projW,
      thickness_m: projD,

      // Position along the wall
      x_m: centredX,
      y_m: roomL > 0 ? Math.max(0, roomL - 0.10) : 0,

      // Vertical placement (store bottom height from floor)
      // Ceiling buffer 0.05m: bottom = ceiling - buffer - projector height
      z_m: Math.max(0, roomH - 0.05 - projH),

      // Keep the physical height stored for later sightline work
      height_m: projH,

      // UI
      label: 'Projector',
    };

    onChange([...(elements || []), newElement]);
  };

  const updateElement = (id, field, value) => {
    const numberFields = new Set(['length_m', 'x_m', 'y_m', 'z_m']);
    const parsed = numberFields.has(field) ? parseFloat(value) : value;

    const next = (elements || []).map(el => {
      if (el.id !== id) return el;
      return { ...el, [field]: Number.isFinite(parsed) ? parsed : parsed };
    });

    onChange(next);
  };

  const removeElement = (id) => {
    onChange((elements || []).filter(el => el.id !== id));
  };

  const wallLabel = (w) => {
    const v = String(w || '').toLowerCase();
    if (v === 'front') return 'Front';
    if (v === 'rear') return 'Rear';
    if (v === 'left') return 'Left';
    if (v === 'right') return 'Right';
    // back-compat with your older saved data that used "back"
    if (v === 'back') return 'Rear';
    return 'Rear';
  };

  const normaliseWallValue = (w) => {
    const v = String(w || '').toLowerCase();
    if (v === 'back') return 'rear';
    if (v === 'front' || v === 'rear' || v === 'left' || v === 'right') return v;
    return 'rear';
  };

  return (
    <div className="space-y-4 font-body">
      {/* CREATE ROOM ELEMENT */}
      <div
        className="rounded-lg border p-3"
        style={{
          borderColor: '#DCDBD6',
          background: 'rgba(27, 26, 26, 0.04)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold" style={{ color: '#1B1A1A', letterSpacing: 0.3 }}>
            CREATE ROOM ELEMENT
          </div>

          <button
            type="button"
            onClick={addDoor}
            className="inline-flex items-center justify-center rounded-md"
            style={{
              width: 34,
              height: 34,
              border: '1px solid #DCDBD6',
              background: '#FFFFFF',
              color: '#213428',
            }}
            aria-label="Add Element"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* CREATE PROJECTOR */}
      <div
        className="rounded-lg border p-3 mt-3"
        style={{
          borderColor: '#DCDBD6',
          background: 'rgba(27, 26, 26, 0.04)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold" style={{ color: '#1B1A1A', letterSpacing: 0.3 }}>
            CREATE PROJECTOR
          </div>

          <button
            type="button"
            onClick={addProjector}
            className="inline-flex items-center justify-center rounded-md"
            style={{
              width: 34,
              height: 34,
              border: '1px solid #DCDBD6',
              background: '#FFFFFF',
              color: '#213428',
            }}
            aria-label="Add Projector"
            title="Add Projector"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* EMPTY STATE */}
      {(elements || []).length === 0 ? (
        <p className="text-[#3E4349] text-center py-8">
          No room elements added. Use "Add Door" above to create one.
        </p>
      ) : (
        (elements || []).map((element) => {
          const wall = normaliseWallValue(element?.wall);
          const isFrontOrRear = wall === 'front' || wall === 'rear';

          return (
            <div
              key={element.id}
              className="rounded-lg border p-4"
              style={{
                borderColor: '#DCDBD6',
                background: 'rgba(27, 26, 26, 0.04)',
              }}
            >
              <div className="flex justify-between items-center mb-3">
                <div>
                  <div className="text-sm font-medium" style={{ color: '#1B1A1A' }}>
                    {element?.label || 'Element'}
                  </div>
                  <div className="text-xs" style={{ color: '#625143' }}>
                    {wallLabel(wall)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeElement(element.id)}
                  className="px-2 py-1 rounded-md"
                  style={{
                    border: '1px solid #DCDBD6',
                    background: '#FFFFFF',
                    color: '#1B1A1A',
                  }}
                  aria-label="Remove element"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* WALL */}
                <div>
                  <Label className="text-[#3E4349]">Wall</Label>
                  <Select
                    value={wall}
                    onValueChange={(value) => updateElement(element.id, 'wall', value)}
                    modal={false}
                  >
                    <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={6} className="z-[70]">
                      <SelectItem value="front">Front</SelectItem>
                      <SelectItem value="rear">Rear</SelectItem>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-[10px] mt-1" style={{ color: '#625143' }}>
                    Screen is always on the Front wall.
                  </div>
                </div>

                {/* LENGTH */}
                <div>
                  <Label className="text-[#3E4349]">Length (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={Number.isFinite(element?.length_m) ? element.length_m : 0.9}
                    onChange={(e) => updateElement(element.id, 'length_m', e.target.value)}
                    className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                  />
                </div>

                {/* LABEL */}
                <div>
                  <Label className="text-[#3E4349]">Label</Label>
                  <Input
                    type="text"
                    value={element?.label ?? ''}
                    onChange={(e) => updateElement(element.id, 'label', e.target.value)}
                    className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                    placeholder="e.g. Entrance door"
                  />
                </div>

                {/* POSITION */}
                <div>
                  <Label className="text-[#3E4349]">
                    {isFrontOrRear ? 'X Position (m)' : 'Y Position (m)'}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={
                      Number.isFinite(element?.pos_m) ? element.pos_m : 0
                    }
                    onChange={(e) =>
                      updateElement(
                        element.id,
                        'pos_m',
                        e.target.value
                      )
                    }
                    className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                  />
                  <div className="text-[10px] mt-1" style={{ color: '#625143' }}>
                    Origin is top-left (0,0). Position is measured from the Left wall (for X) or Front wall (for Y).
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}