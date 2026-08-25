"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { sanitizeProjectorElement } from '@/components/utils/projectorSanitise';
import { fmtM } from '@/components/utils/formatMetres';
import StepperInput from '@/components/ui/StepperInput';

export default function RoomElements({ elements = [], onChange, roomDims }) {
  const [drafts, setDrafts] = React.useState({});  // eslint-disable-line

  // Per-element collapsed/expanded state. Existing (saved) elements default to
  // collapsed when the panel opens; newly created elements default to expanded.
  // Not persisted to the project — UI-state only.
  const [collapsedOverride, setCollapsedOverride] = React.useState({});
  const newlyCreatedIdsRef = React.useRef(new Set());

  const isCollapsed = (id) => {
    if (Object.prototype.hasOwnProperty.call(collapsedOverride, id)) return collapsedOverride[id];
    return !newlyCreatedIdsRef.current.has(id);
  };

  const toggleCollapsed = (id) => {
    setCollapsedOverride(prev => ({ ...prev, [id]: !isCollapsed(id) }));
  };

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
    const newId = makeId();
    newlyCreatedIdsRef.current.add(newId);
    const newElement = {
      id: newId,
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

      // Vertical placement
      z_m: 0,
      z_position: 0,
      height: 2.1,

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

    const newId = makeId();
    newlyCreatedIdsRef.current.add(newId);
    const newElement = {
      id: newId,
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
    const numberFields = new Set(['length_m', 'thickness_m', 'height_m', 'height', 'z_position', 'wall_offset_m', 'x_m', 'y_m', 'z_m', 'pos_m', 'x_lens_m', 'y_lens_m', 'z_lens_m', 'body_width_m', 'body_height_m', 'body_depth_m']);
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

  const typeLabel = (type) => {
    const t = String(type || '').toLowerCase();
    if (t === 'projector') return 'Projector';
    if (t === 'door') return 'Door';
    if (t === 'window') return 'Window';
    if (t === 'column') return 'Column';
    if (t === 'opening') return 'Opening';
    return 'Element';
  };

  const buildSummary = (element) => {
    if (element?.type === 'projector') {
      return `X ${fmtM(element?.x_lens_m, '—')} · Y ${fmtM(element?.y_lens_m, '—')} · Z ${fmtM(element?.z_lens_m, '—')} m`;
    }
    return `${wallLabel(element?.wall)} wall · ${fmtM(element?.length_m, '—')} m`;
  };

  // Shared report-style typography (matches Room Dimensions section)
  const groupTitleStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#625143",
    marginBottom: "10px",
  };
  const fieldLabelClassName = "block mb-1.5 text-xs text-[#6B7280]";
  const helperTextStyle = {
    fontSize: "10px",
    color: "#9CA3AF",
    marginTop: "4px",
  };

  return (
    <div className="space-y-4 font-body">
      {/* CREATE CONTROLS — light neutral, consistent height */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 mb-4">
        <button
          type="button"
          onClick={addDoor}
          className="group flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all duration-150 border-[#DCDBD6] bg-white hover:bg-[#F9F8F6] hover:border-[#C4B5A8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#625143] focus-visible:ring-offset-1 active:translate-y-[1px]"
          aria-label="Create Room Element"
        >
          <span className="text-xs font-semibold" style={{ color: '#625143', letterSpacing: 0.3 }}>
            CREATE ROOM ELEMENT
          </span>
          <Plus className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" style={{ color: '#625143' }} />
        </button>

        <button
          type="button"
          onClick={addProjector}
          className="group flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all duration-150 border-[#DCDBD6] bg-white hover:bg-[#F9F8F6] hover:border-[#7A9B8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213428] focus-visible:ring-offset-1 active:translate-y-[1px]"
          aria-label="Create Projector"
          title="Add Projector"
        >
          <span className="text-xs font-semibold" style={{ color: '#213428', letterSpacing: 0.3 }}>
            CREATE PROJECTOR
          </span>
          <Plus className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" style={{ color: '#213428' }} />
        </button>
      </div>

      {(elements || []).map((element) => {
          const wall = normaliseWallValue(element?.wall);
          const isFrontOrRear = wall === 'front' || wall === 'rear';

          return (
            <div
              key={element.id}
              className="rounded-lg border"
              style={{
                borderColor: '#DCDBD6',
                background: '#FFFFFF',
                borderLeftWidth: 3,
                borderLeftColor: element?.type === 'projector' ? '#7A9B8C' : '#C4B5A8',
              }}
            >
              <div
                className="flex justify-between items-center px-4 py-2.5 cursor-pointer select-none"
                onClick={() => toggleCollapsed(element.id)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm font-medium shrink-0" style={{ color: element?.type === 'projector' ? '#213428' : '#625143' }}>
                    {element?.label || typeLabel(element?.type)}
                  </span>
                  {isCollapsed(element.id) && (
                    <span className="text-xs truncate" style={{ color: '#9CA3AF' }}>
                      {buildSummary(element)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="p-1.5 rounded-md" style={{ color: '#9CA3AF' }} aria-hidden="true">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCollapsed(element.id) ? '' : 'rotate-180'}`} />
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeElement(element.id); }}
                    className="p-1.5 rounded-md transition-colors hover:bg-[#F3F2EF]"
                    style={{ color: '#9CA3AF' }}
                    aria-label="Remove element"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {!isCollapsed(element.id) && (
                <div className="px-4 pb-4 pt-1">
              {/* PROJECTOR LAYOUT */}
              {element?.type === 'projector' ? (
                <>
                  {/* Label */}
                  <div className="mb-3">
                    <Label className={fieldLabelClassName}>Label</Label>
                    <Input
                      type="text"
                      value={element?.label ?? ''}
                      onChange={(e) => updateElement(element.id, 'label', e.target.value)}
                      className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                      placeholder="Projector"
                    />
                  </div>

                  {/* Lens Centre */}
                  <div style={groupTitleStyle}>Lens Centre (m)</div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <Label className={fieldLabelClassName}>Lens X (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fmtM(element?.x_lens_m, '')}
                        onChange={(e) => updateElement(element.id, 'x_lens_m', e.target.value)}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                        placeholder="—"
                      />
                      <div className="flex items-center justify-between" style={helperTextStyle}>
                        <span>From left wall</span>
                        <button
                          type="button"
                          className="underline hover:opacity-80"
                          onClick={() => {
                            const roomW = Number(roomDims?.widthM ?? roomDims?.width ?? 0) || 0;
                            if (!roomW) return;
                            updateElement(element.id, 'x_lens_m', roomW / 2);
                          }}
                        >
                          Centre
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label className={fieldLabelClassName}>Lens Y (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fmtM(element?.y_lens_m, '')}
                        onChange={(e) => updateElement(element.id, 'y_lens_m', e.target.value)}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                        placeholder="—"
                      />
                      <div style={helperTextStyle}>From front wall</div>
                    </div>
                    <div>
                      <Label className={fieldLabelClassName}>Lens Z (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fmtM(element?.z_lens_m, '')}
                        onChange={(e) => updateElement(element.id, 'z_lens_m', e.target.value)}
                        className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                        placeholder="—"
                      />
                      <div style={helperTextStyle}>Height from floor</div>
                    </div>
                  </div>

                  {/* Body Dimensions */}
                  <div style={groupTitleStyle}>Body Dimensions (m)</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className={fieldLabelClassName}>Body Width (m)</Label>
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
                      <Label className={fieldLabelClassName}>Body Height (m)</Label>
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
                      <Label className={fieldLabelClassName}>Body Depth (m)</Label>
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
                /* NON-PROJECTOR layout */
                <div className="space-y-3">
                  {/* Placement: Wall + Length */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className={fieldLabelClassName}>Wall</Label>
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
                      <div style={helperTextStyle}>Screen is always on the Front wall.</div>
                    </div>

                    <div>
                      <Label className={fieldLabelClassName}>Length (m)</Label>
                      <StepperInput
                        value={Number(element?.length_m) || 0.9}
                        step={0.01}
                        min={0.05}
                        onChange={(newLen) => {
                          const roomW = Number(roomDims?.widthM ?? roomDims?.width ?? 0) || 0;
                          const roomL = Number(roomDims?.lengthM ?? roomDims?.length ?? 0) || 0;
                          const wallLen = isFrontOrRear ? roomW : roomL;
                          const posM = Number(element?.pos_m ?? element?.x_m ?? element?.y_m ?? 0) || 0;
                          const maxPos = wallLen > 0 ? Math.max(0, wallLen - newLen) : posM;
                          const clampedPos = Math.min(posM, maxPos);
                          const next = { ...element, length_m: newLen, pos_m: clampedPos };
                          onChange((elements || []).map(el => el.id === element.id ? next : el));
                        }}
                      />
                    </div>
                  </div>

                  {/* Label */}
                  <div>
                    <Label className={fieldLabelClassName}>Label</Label>
                    <Input
                      type="text"
                      value={element?.label ?? ''}
                      onChange={(e) => updateElement(element.id, 'label', e.target.value)}
                      className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                      placeholder="e.g. Entrance door"
                    />
                  </div>

                  {/* Dimensions: Height from Floor + Element Height */}
                  <div className="grid grid-cols-2 gap-3">
                    {(() => {
                      const roomH = Number(roomDims?.heightM ?? roomDims?.height ?? 2.8) || 2.8;
                      const elH = Number(element?.height) || 2.1;
                      const elZ = Number(element?.z_position) || 0;
                      const maxZ = Math.max(0, roomH - elH);
                      const maxH = Math.max(0.05, roomH - elZ);
                      return (
                        <>
                          <div>
                            <Label className={fieldLabelClassName}>Height from Floor (m)</Label>
                            <StepperInput
                              value={elZ}
                              step={0.01}
                              min={0}
                              max={maxZ}
                              onChange={(val) => updateElement(element.id, 'z_position', Math.max(0, Math.min(val, maxZ)))}
                            />
                            <div style={helperTextStyle}>Bottom of element AFF</div>
                          </div>
                          <div>
                            <Label className={fieldLabelClassName}>Element Height (m)</Label>
                            <StepperInput
                              value={elH}
                              step={0.01}
                              min={0.05}
                              max={maxH}
                              onChange={(val) => updateElement(element.id, 'height', Math.max(0.05, Math.min(val, maxH)))}
                            />
                            <div style={helperTextStyle}>Opening height</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Position: Distance fields */}
                  <div className="grid grid-cols-2 gap-3">
                    {(() => {
                      const posM = Number(element?.pos_m ?? element?.x_m ?? element?.y_m ?? 0) || 0;
                      const elLen = Number(element?.length_m) || 0.9;
                      const roomW = Number(roomDims?.widthM ?? roomDims?.width ?? 0) || 0;
                      const roomL = Number(roomDims?.lengthM ?? roomDims?.length ?? 0) || 0;
                      const wallLen = isFrontOrRear ? roomW : roomL;
                      const distA = wallLen > 0 ? Math.max(0, posM) : 0;
                      const distB = wallLen > 0 ? Math.max(0, wallLen - posM - elLen) : 0;
                      const maxDistA = wallLen > 0 ? Math.max(0, wallLen - elLen) : 0;
                      const labelA = isFrontOrRear ? 'Left Distance' : 'Front Distance';
                      const labelB = isFrontOrRear ? 'Right Distance' : 'Rear Distance';
                      const hintA = isFrontOrRear ? 'From left wall to element edge' : 'From front wall to element edge';
                      const hintB = isFrontOrRear ? 'From element edge to right wall' : 'From element edge to rear wall';

                      const setDistA = (newDistA) => {
                        const clamped = Math.max(0, Math.min(newDistA, maxDistA));
                        onChange((elements || []).map(el =>
                          el.id === element.id ? { ...el, pos_m: clamped } : el
                        ));
                      };

                      const setDistB = (newDistB) => {
                        const maxDistB = Math.max(0, wallLen - elLen);
                        const clamped = Math.max(0, Math.min(newDistB, maxDistB));
                        const newPosM = wallLen - elLen - clamped;
                        onChange((elements || []).map(el =>
                          el.id === element.id ? { ...el, pos_m: Math.max(0, newPosM) } : el
                        ));
                      };

                      return (
                        <>
                          <div>
                            <Label className={fieldLabelClassName}>{labelA} (m)</Label>
                            <StepperInput
                              value={distA}
                              step={0.01}
                              min={0}
                              max={maxDistA}
                              onChange={setDistA}
                            />
                            <div style={helperTextStyle}>{hintA}</div>
                          </div>
                          <div>
                            <Label className={fieldLabelClassName}>{labelB} (m)</Label>
                            <StepperInput
                              value={distB}
                              step={0.01}
                              min={0}
                              max={Math.max(0, wallLen - elLen)}
                              onChange={setDistB}
                            />
                            <div style={helperTextStyle}>{hintB}</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}