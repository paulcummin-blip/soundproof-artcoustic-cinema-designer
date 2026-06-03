"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { sanitizeProjectorElement } from '@/components/utils/projectorSanitise';
import { fmtM } from '@/components/utils/formatMetres';

export default function RoomElements({ elements = [], onChange, roomDims }) {
  const [drafts, setDrafts] = React.useState({});  // eslint-disable-line

  // Returns the current draft string if one exists, otherwise the value rounded to 2dp (cm resolution)
  const getDraftValue = (element, field, fallback) => {
    const key = `${element.id}:${field}`;
    if (Object.prototype.hasOwnProperty.call(drafts, key)) return drafts[key];
    const val = element[field];
    return fmtM(val, fallback !== undefined ? String(fallback) : '');
  };

  // Only allow valid partial decimal inputs — does not call updateElement
  const handleDraftChange = (elementId, field, raw) => {
    if (!/^-?\d*\.?\d*$/.test(raw) && raw !== '') return;
    setDrafts(prev => ({ ...prev, [`${elementId}:${field}`]: raw }));
  };

  // Parse draft and commit to app state, then clear the draft
  const commitDraftValue = (elementId, field, fallback) => {
    const key = `${elementId}:${field}`;
    const draft = drafts[key];
    if (draft !== undefined) {
      const parsed = parseFloat(draft);
      const committed = Number.isFinite(parsed) ? parsed : (fallback !== undefined ? fallback : 0);
      updateElement(elementId, field, committed);
      setDrafts(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

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

    const roomW = Number(roomDims?.widthM ?? roomDims?.width ?? 0) || 0;
    const roomL = Number(roomDims?.lengthM ?? roomDims?.length ?? 0) || 0;
    const roomH = Number(roomDims?.heightM ?? roomDims?.height ?? 2.4) || 2.4;

    // Sensible defaults for a ceiling-mounted projector
    const bodyW = 0.46;   // body width (m)
    const bodyH = 0.21;   // body height (m)
    const bodyD = 0.517;  // body depth front-to-back (m)

    // Lens centre: horizontally centred, near rear of room, close to ceiling
    const lensX = roomW > 0 ? roomW / 2 : 0;
    const lensY = roomL > 0 ? Math.max(0, roomL - 0.15) : 0; // 150mm from rear wall
    const lensZ = Math.max(0, roomH - 0.10 - bodyH / 2);     // near ceiling, 0.10 m clearance (matches updateElement clamp)

    const newElement = {
      id: makeId(),
      type: 'projector',
      wall: 'rear',
      label: 'Projector',

      // Formal projector fields
      x_lens_m: lensX,
      y_lens_m: lensY,
      z_lens_m: lensZ,
      body_width_m: bodyW,
      body_height_m: bodyH,
      body_depth_m: bodyD,

      // Legacy plan-view fields kept for RV rendering compatibility
      length_m: bodyW,
      thickness_m: bodyD,
      pos_m: roomW > 0 ? (roomW / 2) - (bodyW / 2) : 0,
      wall_offset_m: 0.10,
      height_m: bodyH,
    };

    onChange([...(elements || []), sanitizeProjectorElement(newElement, roomDims)]);
  };

  const updateElement = (id, field, value) => {
    const numberFields = new Set(['length_m', 'thickness_m', 'height_m', 'wall_offset_m', 'x_m', 'y_m', 'z_m', 'pos_m', 'x_lens_m', 'y_lens_m', 'z_lens_m', 'body_width_m', 'body_height_m', 'body_depth_m']);
    let parsed = numberFields.has(field) ? parseFloat(value) : value;

    const next = (elements || []).map(el => {
      if (el.id !== id) return el;
      let finalValue = Number.isFinite(parsed) ? parsed : parsed;
      if (field === 'z_lens_m' && Number.isFinite(parsed)) {
        const roomH = Number(roomDims?.heightM ?? roomDims?.height ?? 2.4) || 2.4;
        const bodyH = Number(el?.body_height_m ?? 0.21) || 0.21;
        const maxLensZ = Math.max(0, roomH - 0.10 - bodyH / 2);
        finalValue = Math.min(Math.max(0, parsed), maxLensZ);
      }
      return sanitizeProjectorElement({ ...el, [field]: finalValue }, roomDims);
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

      {(elements || []).map((element) => {
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

              {/* PROJECTOR LAYOUT */}
              {element?.type === 'projector' ? (
                <>
                  {/* Row 1: Label */}
                  <div className="mb-3">
                    <Label className="text-[#3E4349]">Label</Label>
                    <Input
                      type="text"
                      value={element?.label ?? ''}
                      onChange={(e) => updateElement(element.id, 'label', e.target.value)}
                      className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                      placeholder="Projector"
                    />
                  </div>

                  {/* Row 2: Lens position */}
                  <div className="text-[10px] font-semibold mb-1" style={{ color: '#625143', letterSpacing: 0.3 }}>LENS CENTRE (m)</div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <Label className="text-[#3E4349]">Lens X (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fmtM(element?.x_lens_m, '')}
                        onChange={(e) => updateElement(element.id, 'x_lens_m', e.target.value)}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                        placeholder="—"
                      />
                      <div className="flex items-center justify-between text-[10px] mt-1" style={{ color: '#625143' }}>
                        <span>From left wall</span>
                        <button
                          type="button"
                          className="text-[10px] underline hover:opacity-80"
                          onClick={() => {
                            const roomW = Number(roomDims?.widthM ?? roomDims?.width ?? 0) || 0;
                            const bodyW = Number(element?.body_width_m ?? 0) || 0;

                            if (!roomW) return;

                            const centeredX = (roomW / 2);
                            updateElement(element.id, 'x_lens_m', centeredX);
                          }}
                        >
                          Centre
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[#3E4349]">Lens Y (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fmtM(element?.y_lens_m, '')}
                        onChange={(e) => updateElement(element.id, 'y_lens_m', e.target.value)}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                        placeholder="—"
                      />
                      <div className="text-[10px] mt-1" style={{ color: '#625143' }}>From front wall</div>
                    </div>
                    <div>
                      <Label className="text-[#3E4349]">Lens Z (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fmtM(element?.z_lens_m, '')}
                        onChange={(e) => updateElement(element.id, 'z_lens_m', e.target.value)}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                        placeholder="—"
                      />
                      <div className="text-[10px] mt-1" style={{ color: '#625143' }}>Height from floor</div>
                    </div>
                  </div>

                  {/* Row 3: Body dimensions */}
                  <div className="text-[10px] font-semibold mb-1" style={{ color: '#625143', letterSpacing: 0.3 }}>BODY DIMENSIONS (m)</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[#3E4349]">Body Width (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fmtM(element?.body_width_m, '')}
                        onChange={(e) => updateElement(element.id, 'body_width_m', e.target.value)}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                        placeholder="—"
                      />
                    </div>
                    <div>
                      <Label className="text-[#3E4349]">Body Height (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fmtM(element?.body_height_m, '')}
                        onChange={(e) => updateElement(element.id, 'body_height_m', e.target.value)}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                        placeholder="—"
                      />
                    </div>
                    <div>
                      <Label className="text-[#3E4349]">Body Depth (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fmtM(element?.body_depth_m, '')}
                        onChange={(e) => updateElement(element.id, 'body_depth_m', e.target.value)}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                        placeholder="—"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* NON-PROJECTOR layout stays as before (including Wall selector etc.) */
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
                       type="text"
                       inputMode="decimal"
                       value={getDraftValue(element, 'length_m', 0.9)}
                       onChange={(e) => handleDraftChange(element.id, 'length_m', e.target.value)}
                       onBlur={() => commitDraftValue(element.id, 'length_m', 0.9)}
                       onKeyDown={(e) => { if (e.key === 'Enter') commitDraftValue(element.id, 'length_m', 0.9); }}
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
                       type="text"
                       inputMode="decimal"
                       value={getDraftValue(element, 'pos_m', '')}
                       onChange={(e) => handleDraftChange(element.id, 'pos_m', e.target.value)}
                       onBlur={() => commitDraftValue(element.id, 'pos_m', 0)}
                       onKeyDown={(e) => { if (e.key === 'Enter') commitDraftValue(element.id, 'pos_m', 0); }}
                       className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                     />
                    <div className="text-[10px] mt-1" style={{ color: '#625143' }}>
                      Origin is top-left (0,0). Position is measured from the Left wall (for X) or Front wall (for Y).
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}