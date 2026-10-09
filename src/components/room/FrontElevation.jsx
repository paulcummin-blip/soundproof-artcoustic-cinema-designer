import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";
import { isRenderableSpeaker } from "@/components/room/rv/RenderPrimitives";
import { Q43FaceIcon, Q45FaceIcon, Q85FaceIcon, Q63FaceIcon, Evolve11FaceIcon, Evolve21FaceIcon, Evolve31FaceIcon, Evolve42FaceIcon, Evolve63FaceIcon, Evolve84FaceIcon, C1FaceIcon, C41FaceIcon, MultiSoundbarArtworkFaceIcon, MultiSoundbar77ArtworkFaceIcon, MultiSoundbar65ArtworkFaceIcon, MultiSoundbar100ArtworkFaceIcon } from "@/components/report/SpeakerFaceIcons";
import { C41_1222FaceIcon, C41_1441FaceIcon, C41_1711FaceIcon } from "@/components/report/C41ArtworkFaceIcons";
import ProductArtwork from "@/components/report/ProductArtwork";
import { computeSpeakerAnnotation, speakerBBox } from "@/components/room/frontElevationAnnotationLayout";
import { resolveEffectiveViewableDimsM, isManualOverrideActive } from "@/components/models/screen/resolveEffectiveScreen";
import { detectFrontStageMode } from "@/components/roomdesigner/utils/lcrHeightAuthority";
import {
  isCentreCabinetRole,
  resolveCentreCabinetFootprintM,
} from "@/components/utils/frontStageModeAuthority";
import { resolveSoundbarCabinetLengthMm } from "@/components/models/speakers/soundbarCabinetVariant";
import {
  centreCabinetPartnerRole,
  linkedCentreCabinetPositions,
} from "@/components/utils/dualCentrePairAuthority";
import SpeakerInfoTooltip from "@/components/room/speakerInfo/SpeakerInfoTooltip";
import { useSpeakerInfoTooltip } from "@/components/room/speakerInfo/useSpeakerInfoTooltip";
import { buildSpeakerInfo } from "@/components/room/speakerInfo/speakerInfoModel";
import { scaleSvgBoxToContainer } from "@/components/room/speakerInfo/speakerTooltipPlacement";

// Roles displayed in front elevation
const FRONT_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);
const canonFront = (role) => {
  const map = { L: "FL", C: "FC", R: "FR", FL: "FL", FC: "FC", FR: "FR" };
  return map[String(role || "").toUpperCase()] || null;
};

// Convert screen config to viewable width/height in metres — uses the single
// effective-screen resolver so manual override dimensions are authoritative.
function screenDimsM(screen) {
  const dims = resolveEffectiveViewableDimsM(screen);
  return { w: dims.widthM, h: dims.heightM };
}

export default function FrontElevation({ dimensions, screen, placedSpeakers = [], frontSubs = [], frontSubsCfg, roomElements = [], onLcrSpeakerMoved, onFrontSubMoved, isDraggingRef }) {
  const roomW = Number(dimensions?.widthM ?? dimensions?.width) || 4.5;
  const roomH = Number(dimensions?.heightM ?? dimensions?.height) || 2.8;

  // Internal coordinate system — fixed virtual canvas
  const SVG_W = 640;
  const PADDING = 36;
  const LABEL_TOP = 56; // increased top padding — title breathing room + label rows
  const LABEL_LEFT = 36;
  const drawW = SVG_W - PADDING * 2 - LABEL_LEFT;
  const drawH = Math.round(drawW * (roomH / roomW));
  const SVG_H = drawH + PADDING * 2 + LABEL_TOP;

  const offsetX = PADDING + LABEL_LEFT;
  const offsetY = PADDING + LABEL_TOP;

  // room-metres → SVG px
  const rx = (m) => offsetX + (m / roomW) * drawW;
  const ry = (m) => offsetY + drawH - (m / roomH) * drawH; // y=0 is floor

  // ── Front Elevation drag machinery ──────────────────────────────────────
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const geomRef = useRef({});
  geomRef.current = { offsetX, offsetY, drawW, drawH, roomW, roomH };
  const onMovedRef = useRef(onLcrSpeakerMoved);
  useEffect(() => { onMovedRef.current = onLcrSpeakerMoved; }, [onLcrSpeakerMoved]);
  const onSubMovedRef = useRef(onFrontSubMoved);
  useEffect(() => { onSubMovedRef.current = onFrontSubMoved; }, [onFrontSubMoved]);

  // Speaker information tooltip — hover or tap a speaker to read the stored
  // height, cabinet size and orientation. The card is inert (pointer-events:
  // none), so it can never interfere with dragging.
  const wrapRef = useRef(null);
  const drawingRef = useRef(null);
  const speakerInfo = useSpeakerInfoTooltip({ containerRef: wrapRef, boundsRef: drawingRef });

  // Alignment guide state
  const [alignGuide, setAlignGuide] = useState(null); // { draggingRole, liveZ } | null
  const setAlignGuideRef = useRef(setAlignGuide);

  // Magnetic snap state
  const [activeSnap, setActiveSnap] = useState(null); // { axis: 'x'|'z', value: number } | null
  const setActiveSnapRef = useRef(setActiveSnap);

  // TV vertical-centre guide state — only for FL/FR drag in TV mode
  const [tvGuide, setTvGuide] = useState(null); // null | { snapped: boolean }
  const setTvGuideRef = useRef(setTvGuide);
  const tvCentreRef = useRef(null); // current TV viewable vertical centre in metres
  // Local live drag state for sub dragging — avoids calling onFrontSubMoved on every mousemove
  const [liveDragSubs, setLiveDragSubs] = useState(null); // { [index]: {x, z} } | null
  const liveDragSubsRef = useRef(null); // readable in mouseup without stale closure
  // Local live drag state for LCR dragging — avoids calling onLcrSpeakerMoved on every mousemove.
  // Preview-only during drag; one authoritative commit on release.
  const [liveDragLcr, setLiveDragLcr] = useState(null); // { FL: {x,z}, FC: {x,z}, FR: {x,z} } | null
  const liveDragLcrRef = useRef(null); // readable in mouseup without stale closure
  // Live refs so mousemove handler can read current speaker positions without stale closure
  const lcrSpeakersRef = useRef([]);
  const subItemsRef = useRef([]);
  const frontStageModeRef = useRef('standard');

  const clientToRoom = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    const { offsetX: ox, offsetY: oy, drawW: dW, drawH: dH, roomW: rW, roomH: rH } = geomRef.current;
    return { mX: (svgP.x - ox) * rW / dW, mZ: (oy + dH - svgP.y) * rH / dH };
  }, []);

  const handleLcrMouseDown = useCallback((e, role, speakerMX, speakerMZ) => {
    e.preventDefault();
    const start = clientToRoom(e.clientX, e.clientY);
    if (!start) return;
    dragRef.current = { role, speakerMX, speakerMZ, startRoomX: start.mX, startRoomZ: start.mZ, axisLocked: null };
    if (isDraggingRef) isDraggingRef.current = true;
    document.body.style.cursor = 'grabbing';
    // Show TV centre guide immediately when dragging FL/FR in TV mode
    if ((role === 'FL' || role === 'FR') && tvCentreRef.current !== null) {
      setTvGuideRef.current?.({ snapped: false });
    }
  }, [clientToRoom, isDraggingRef]);

  const handleSubMouseDown = useCallback((e, subIndex, subId, speakerMX, speakerMZ) => {
    e.preventDefault();
    const start = clientToRoom(e.clientX, e.clientY);
    if (!start) return;
    dragRef.current = { type: 'sub', subIndex, subId, speakerMX, speakerMZ, startRoomX: start.mX, startRoomZ: start.mZ, axisLocked: null };
    if (isDraggingRef) isDraggingRef.current = true;
    document.body.style.cursor = 'grabbing';
  }, [clientToRoom, isDraggingRef]);

  useEffect(() => {
    const THRESHOLD_PX = 4;
    const onMouseMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const curr = clientToRoom(e.clientX, e.clientY);
      if (!curr) return;
      const dX = curr.mX - drag.startRoomX;
      const dZ = curr.mZ - drag.startRoomZ;
      const { drawW: dW, drawH: dH, roomW: rW, roomH: rH } = geomRef.current;
      const dXpx = Math.abs(dX / rW * dW);
      const dZpx = Math.abs(dZ / rH * dH);
      if (!drag.axisLocked) {
        if (Math.max(dXpx, dZpx) < THRESHOLD_PX) return;
        drag.axisLocked = drag.role === 'FC' ? 'z' : (dXpx >= dZpx ? 'x' : 'z');
      }
      const rawX = Math.max(0, Math.min(rW, drag.speakerMX + (drag.axisLocked === 'x' ? dX : 0)));
      const rawZ = Math.max(0, Math.min(rH, drag.speakerMZ + (drag.axisLocked === 'z' ? dZ : 0)));
      // Magnetic snap (50 mm threshold, room-space metres)
      const SNAP_M = 0.05;
      const isDragSub = drag.type === 'sub';
      const isDraggedItem = (s) => isDragSub
        ? (typeof s.index === 'number' && s.index === drag.subIndex)
        : (s.role || s.label) === drag.role;
      // A dual-centre cabinet is never a snap target for its own partner: the
      // pair is linked, so the partner's position is derived from this drag.
      const pairPartnerRole = centreCabinetPartnerRole(drag.role);
      const allOtherSpks = [...lcrSpeakersRef.current, ...subItemsRef.current]
        .filter(s => !isDraggedItem(s) && !(pairPartnerRole && (s.role || s.label) === pairPartnerRole));
      let snappedX = rawX, snappedZ = rawZ, snapResult = null;
      if (drag.axisLocked === 'x') {
        const xTargets = [
          { value: rW / 2, type: 'centre' },
          ...allOtherSpks.map(s => ({ value: s.x, type: 'speaker' })),
        ];
        let best = null, bestD = SNAP_M;
        xTargets.forEach(t => { const d = Math.abs(rawX - t.value); if (d < bestD) { bestD = d; best = t; } });
        if (best) { snappedX = best.value; snapResult = { axis: 'x', value: best.value }; }
      }
      if (drag.axisLocked === 'z') {
        const isLRPair = !isDragSub && (drag.role === 'FL' || drag.role === 'FR');
        const zTargets = allOtherSpks
          .filter(s => !(isLRPair && (s.role === 'FL' || s.role === 'FR')))
          .map(s => ({ value: s.z, type: 'speaker' }));
        // Inject TV vertical centre as a snap target for FL/FR in TV mode
        const tvCentre = tvCentreRef.current;
        if (isLRPair && tvCentre !== null) {
          zTargets.push({ value: tvCentre, type: 'tv_centre' });
        }
        let best = null, bestD = SNAP_M;
        zTargets.forEach(t => { const d = Math.abs(rawZ - t.value); if (d < bestD) { bestD = d; best = t; } });
        if (best) { snappedZ = best.value; snapResult = { axis: 'z', value: best.value }; }
      }
      setActiveSnapRef.current?.(snapResult);
      if (isDragSub) {
        // Build local live map — do NOT call onFrontSubMoved here
        const { roomW: rW } = geomRef.current;
        const totalFrontSubs = subItemsRef.current.length;
        const liveMap = { [drag.subIndex]: { x: snappedX, z: snappedZ } };
        if (totalFrontSubs === 2 && drag.axisLocked === 'x') {
          const otherIdx = 1 - drag.subIndex;
          const otherCurrent = subItemsRef.current[otherIdx];
          liveMap[otherIdx] = { x: rW - snappedX, z: liveDragSubsRef.current?.[otherIdx]?.z ?? otherCurrent?.z ?? snappedZ };
        } else if (totalFrontSubs === 2 && drag.axisLocked === 'z') {
          const otherIdx = 1 - drag.subIndex;
          const otherCurrent = subItemsRef.current[otherIdx];
          liveMap[otherIdx] = { x: liveDragSubsRef.current?.[otherIdx]?.x ?? otherCurrent?.x ?? snappedX, z: snappedZ };
        }
        liveDragSubsRef.current = liveMap;
        setLiveDragSubs({ ...liveMap });
      } else {
        // LCR local preview — do NOT call onLcrSpeakerMoved here.
        // Pairing logic mirrors handleLcrSpeakerMoved's setSpeakers logic.
        const liveMap = { ...(liveDragLcrRef.current || {}) };
        liveMap[drag.role] = { x: snappedX, z: snappedZ };
        // Linked pair: the partner cabinet mirrors this drag instantly — x
        // reflected about the room centreline, height shared — so the two
        // cabinets move as one on every axis, live, before any commit.
        if (pairPartnerRole) {
          const partnerSpk = lcrSpeakersRef.current.find(s => s.role === pairPartnerRole);
          const linked = linkedCentreCabinetPositions({
            roomWidthM: rW,
            draggedRole: drag.role,
            draggedPosition: { x: snappedX, z: snappedZ },
            partnerPosition: { x: partnerSpk?.x, z: partnerSpk?.z },
          });
          if (linked) {
            liveMap[pairPartnerRole] = { x: linked.partner.x, z: linked.partner.z };
          }
        }
        if (drag.axisLocked === 'x' && drag.role === 'FL') {
          const frSpk = lcrSpeakersRef.current.find(s => s.role === 'FR');
          liveMap['FR'] = { x: rW - snappedX, z: liveMap['FR']?.z ?? frSpk?.z ?? snappedZ };
        }
        if (drag.axisLocked === 'x' && drag.role === 'FR') {
          const flSpk = lcrSpeakersRef.current.find(s => s.role === 'FL');
          liveMap['FL'] = { x: rW - snappedX, z: liveMap['FL']?.z ?? flSpk?.z ?? snappedZ };
        }
        if (drag.axisLocked === 'z') {
          const flSpk = lcrSpeakersRef.current.find(s => s.role === 'FL');
          const fcSpk = lcrSpeakersRef.current.find(s => s.role === 'FC');
          const frSpk = lcrSpeakersRef.current.find(s => s.role === 'FR');
          const allSameModel = flSpk && fcSpk && frSpk && flSpk.modelKey === fcSpk.modelKey && fcSpk.modelKey === frSpk.modelKey;
          const isCenterOnly = frontStageModeRef.current === 'center_only';
          if (allSameModel) {
            liveMap['FL'] = { x: liveMap['FL']?.x ?? flSpk?.x ?? snappedX, z: snappedZ };
            liveMap['FC'] = { x: liveMap['FC']?.x ?? fcSpk?.x ?? snappedX, z: snappedZ };
            liveMap['FR'] = { x: liveMap['FR']?.x ?? frSpk?.x ?? snappedX, z: snappedZ };
          } else if (!isCenterOnly && (drag.role === 'FL' || drag.role === 'FR')) {
            // Only sync FL↔FR in standard/integrated mode.
            // In center_only mode FL/FR are independent — the commit does not
            // sync them, so the preview must not either.
            const otherRole = drag.role === 'FL' ? 'FR' : 'FL';
            const otherSpk = lcrSpeakersRef.current.find(s => s.role === otherRole);
            liveMap[otherRole] = { x: liveMap[otherRole]?.x ?? otherSpk?.x ?? snappedX, z: snappedZ };
          }
        }
        liveDragLcrRef.current = liveMap;
        setLiveDragLcr({ ...liveMap });
        if (drag.axisLocked === 'z') {
          setAlignGuideRef.current?.({ draggingRole: drag.role, liveZ: snappedZ });
          // Update TV centre snap state for FL/FR
          const tvCentre = tvCentreRef.current;
          if ((drag.role === 'FL' || drag.role === 'FR') && tvCentre !== null) {
            setTvGuideRef.current?.({ snapped: Math.abs(snappedZ - tvCentre) < 0.005 });
          }
        }
      }
    };
    const onMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      // Commit final sub position(s) once on mouseup by exact stable id.
      // If the paired front sub visually moved, patch both exact ids in one commit.
      if (drag.type === 'sub') {
        const liveMap = liveDragSubsRef.current;
        if (liveMap && drag.axisLocked) {
          const movedBySubId = {};
          subItemsRef.current.forEach((sub, i) => {
            const live = liveMap[i];
            if (live && sub?.id) {
              movedBySubId[sub.id] = { x: live.x, z: live.z };
            }
          });
          if (Object.keys(movedBySubId).length > 0) {
            onSubMovedRef.current?.({ movedBySubId, axis: drag.axisLocked });
          }
        }
        liveDragSubsRef.current = null;
        setLiveDragSubs(null);
      } else {
        // LCR commit: one authoritative call on release (not on every mousemove).
        const liveMap = liveDragLcrRef.current;
        if (liveMap && drag.axisLocked) {
          const live = liveMap[drag.role];
          if (live) {
            onMovedRef.current?.({ role: drag.role, newX: live.x, newZ: live.z, axis: drag.axisLocked });
          }
        }
        liveDragLcrRef.current = null;
        setLiveDragLcr(null);
      }
      dragRef.current = null;
      if (isDraggingRef) isDraggingRef.current = false;
      document.body.style.cursor = '';
      setAlignGuideRef.current?.(null);
      setActiveSnapRef.current?.(null);
      setTvGuideRef.current?.(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [clientToRoom, isDraggingRef]);
  // ────────────────────────────────────────────────────────────────────────

  // Screen
  const screenData = useMemo(() => screenDimsM(screen), [screen]);
  const screenFloorM = Number(screen?.heightFromFloorM) || 0.5;
  const screenCenterX = roomW / 2;
  // Border/frame: use persisted value, else safe visual fallback
  const hasBorderData = Number(screen?.borderThicknessM) > 0;
  const borderM = hasBorderData ? Number(screen.borderThicknessM) : 0.05; // 5cm fallback
  const overallW = screenData.w + borderM * 2;
  const overallH = screenData.h + borderM * 2;

  // TV vertical centre — only when displaying a TV (not a projector screen)
  const isTV = !!(screen?.tvPresetKey || Number(screen?.tvWidthMm) > 0);
  const tvVerticalCentreM = isTV ? (screenFloorM + borderM + screenData.h / 2) : null;

  // LCR speakers — always returns a plain array
  // Pass the TV preset key as `orientation` so tv_linked models (e.g. C4-1) resolve
  // the correct width from their tvWidthMap instead of falling back to undefined/0.
  const tvPresetKey = screen?.tvPresetKey || null;
  const lcrSpeakers = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return [];
    return placedSpeakers
      // Only installed speakers are drawn: a role with no assigned model is not
      // in the design yet, whatever the selected format requires of it.
      .filter(s => (canonFront(s?.role) || isCentreCabinetRole(s?.role)) && isRenderableSpeaker(s))
      .map(s => {
        const cabinet = isCentreCabinetRole(s?.role);
        // A dual-centre cabinet is drawn from its INSTALLED footprint: mounted
        // vertically it is the same cabinet rotated a quarter turn, so its drawn
        // width and height swap while its acoustic centre stays the centre.
        const footprint = cabinet
          ? resolveCentreCabinetFootprintM(s?.model, s?.orientation, tvPresetKey, { cabinetLengthMm: s?.cabinetLengthMm })
          : null;
        // A TV-linked soundbar is drawn at its INSTALLED cabinet length: the
        // catalogue variant closest to the screen's physical width, or the
        // designer's own recorded choice. The shared variant authority owns that
        // decision, so Plan View and the reports resolve the same cabinet.
        const meta = cabinet
          ? getSpeakerModelMeta(s?.model, tvPresetKey)
          : getSpeakerModelMeta(s?.model, tvPresetKey, {
            cabinetLengthMm: resolveSoundbarCabinetLengthMm({
              modelKey: s?.model,
              screen,
              explicitMm: s?.cabinetLengthMm,
            }),
          });
        const wM = footprint ? footprint.widthM : ((meta && !meta.notFound && meta.widthM) ? meta.widthM : 0.20);
        const hM = footprint ? footprint.heightM : ((meta && !meta.notFound && meta.heightM) ? meta.heightM : 0.20);
        const baseX = Number.isFinite(s?.position?.x) ? s.position.x : roomW / 2;
        const baseZ = Number.isFinite(s?.position?.z) ? s.position.z : 1.2;
        const role = cabinet ? String(s.role || '').toUpperCase() : canonFront(s.role);
        const liveOverride = liveDragLcr?.[role];
        const x = liveOverride ? liveOverride.x : baseX;
        const z = liveOverride ? liveOverride.z : baseZ;
        const modelKey = normaliseModelKey(s?.model);
        return {
          role,
          x,
          z,
          wM,
          hM,
          label: role,
          modelKey,
          // Raw stored model + installed orientation, read only by the hover
          // information card; drawing and dragging keep using modelKey.
          model: s?.model ?? modelKey,
          orientation: footprint ? footprint.orientation : null,
          isCabinet: cabinet,
          // Which C4-1 cabinet length is installed: the drawings pick the
          // artwork for that variant and for nothing else.
          cabinetLengthMm: footprint?.cabinetLengthMm ?? meta?.cabinetLengthMm ?? null,
          vertical: !!footprint && footprint.orientation === 'vertical',
        };
      });
  }, [placedSpeakers, roomW, tvPresetKey, liveDragLcr, screen]);

  // Front subs — always returns a plain array
  const subItems = useMemo(() => {
    const safeSubs = Array.isArray(frontSubs) ? frontSubs.filter((s) => s?.enabled !== false) : [];
    return safeSubs.map((s, i) => {
      const orientation = s?.orientation || frontSubsCfg?.orientation;
      const meta = getSpeakerModelMeta(s?.model, orientation);
      const wM = (meta && !meta.notFound && meta.widthM) ? meta.widthM : 0.35;
      const hM = (meta && !meta.notFound && meta.heightM) ? meta.heightM : 0.35;
      const baseX = Number.isFinite(s?.position?.x) ? s.position.x : roomW / 2;
      const baseZ = Number.isFinite(s?.position?.z) ? s.position.z : hM / 2;
      const liveOverride = liveDragSubs?.[i];
      const x = liveOverride ? liveOverride.x : baseX;
      const z = liveOverride ? liveOverride.z : baseZ;
      return { x, z, wM, hM, label: "SUB", index: i, id: s?.id, model: s?.model ?? null, orientation: orientation ?? null };
    });
  }, [frontSubs, roomW, liveDragSubs]);
  // Front stage mode — drives whether FL/FR z-drag syncs the paired speaker.
  // Must match the commit logic in useElevationDragHandlers.
  const frontStageMode = useMemo(() => detectFrontStageMode(placedSpeakers), [placedSpeakers]);

  // Keep snap refs current on every render
  lcrSpeakersRef.current = lcrSpeakers;
  subItemsRef.current = subItems;
  tvCentreRef.current = tvVerticalCentreM;
  frontStageModeRef.current = frontStageMode;

  // Clash detection — recalculates live (also during drag via lcrSpeakers/subItems reactivity)
  const clashes = useMemo(() => {
    const T = 0.05; // 50 mm threshold
    const items = [
      ...lcrSpeakers.map(s => ({
        label: s.label || s.role,
        xMin: s.x - s.wM / 2, xMax: s.x + s.wM / 2,
        zMin: s.z - s.hM / 2, zMax: s.z + s.hM / 2,
      })),
      ...subItems.map(s => ({
        label: s.label || 'SUB',
        xMin: s.x - s.wM / 2, xMax: s.x + s.wM / 2,
        zMin: s.z - s.hM / 2, zMax: s.z + s.hM / 2,
      })),
    ].filter(it => it.xMin != null && it.zMin != null);
    const pairs = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const gapX = Math.max(0, Math.max(a.xMin, b.xMin) - Math.min(a.xMax, b.xMax));
        const gapZ = Math.max(0, Math.max(a.zMin, b.zMin) - Math.min(a.zMax, b.zMax));
        if (gapX === 0 && gapZ === 0) pairs.push(`${a.label} and ${b.label}`);
      }
    }
    return pairs;
  }, [lcrSpeakers, subItems]);

  // Screen bounding box in SVG px — for annotation collision detection
  const screenBoxSvg = useMemo(() => {
    const oW = (overallW / roomW) * drawW;
    const oH = (overallH / roomH) * drawH;
    const ox = rx(screenCenterX) - oW / 2;
    const oy = ry(screenFloorM + screenData.h + borderM);
    return { left: ox, top: oy, right: ox + oW, bottom: oy + oH };
  }, [overallW, overallH, roomW, roomH, drawW, drawH, screenCenterX, screenFloorM, screenData, borderM]);

  // All speaker/sub bounding boxes — for annotation collision detection
  const allSpeakerBoxes = useMemo(() => {
    const lcr = lcrSpeakers.map((spk, i) => {
      const isC41 = (spk.modelKey || "").includes("c4-1");
      const hMult = isC41 ? 1.0 : 1.20;
      const cx = rx(spk.x);
      const cy = ry(spk.z);
      const sw = Math.max(12, (spk.wM / roomW) * drawW);
      const sh = Math.max(12, (spk.hM / roomH) * drawH * hMult);
      return { id: `lcr-${i}`, box: speakerBBox(cx, cy, sw, sh) };
    });
    const subs = subItems.map((sub, i) => {
      const cx = rx(sub.x);
      const cy = ry(sub.z);
      const sw = Math.max(12, (sub.wM / roomW) * drawW);
      const sh = Math.max(12, (sub.hM / roomH) * drawH);
      return { id: `sub-${i}`, box: speakerBBox(cx, cy, sw, sh) };
    });
    return [...lcr, ...subs];
  }, [lcrSpeakers, subItems, roomW, roomH, drawW, drawH]);

  const roomBounds = { left: offsetX, right: offsetX + drawW, top: offsetY, bottom: offsetY + drawH };

  // Neighbouring speakers and the screen, mapped into container pixels, so the
  // information card can prefer empty space and avoid sitting over a neighbour.
  const speakerInfoExclusions = useCallback((exceptId) => {
    const svgEl = svgRef.current;
    const containerEl = wrapRef.current;
    if (!svgEl || !containerEl) return [];
    const svgRect = svgEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const boxes = (allSpeakerBoxes || [])
      .filter((b) => b.id !== exceptId)
      .map((b) => scaleSvgBoxToContainer(b.box, svgRect, containerRect, SVG_W))
      .filter(Boolean);
    const screenBox = scaleSvgBoxToContainer(screenBoxSvg, svgRect, containerRect, SVG_W);
    if (screenBox) boxes.push(screenBox);
    return boxes;
  }, [allSpeakerBoxes, screenBoxSvg]);

  // Projector element from roomElements
  const projectorEl = useMemo(() => {
    if (!Array.isArray(roomElements)) return null;
    return roomElements.find(el => el?.type === 'projector') || null;
  }, [roomElements]);

  // Riser element from roomElements
  const riserEl = useMemo(() => {
    if (!Array.isArray(roomElements)) return null;
    return roomElements.find(el => el?.type === 'riser') || null;
  }, [roomElements]);

  // Engineering drawing palette — premium technical style
  const ROOM_FILL = "#F4F3F0";
  const ROOM_STROKE = "#B0AEA8";  // lighter grey, less dominant
  const SCREEN_FILL = "#2C2C2C";
  const SCREEN_STROKE = "#1a1a1a";
  const SPEAKER_FILL = "#213428";
  const SPEAKER_STROKE = "#152420";
  const SUB_FILL = "#4A3B30";      // darker than before for contrast
  const SUB_STROKE = "#2E241D";
  const FLOOR_COLOR = "#8C8880";   // construction floor line
  const LABEL_COLOR = "#4A4540";
  const DIM_COLOR = "#9B9890";
  const PROJ_FILL = "#3E4349";
  const RISER_FILL = "rgba(180,170,160,0.18)";
  const RISER_STROKE = "#9B9890";

  /**
   * drawSpeakerFront — reusable helper for rendering a single speaker
   * in the XZ front-elevation plane.
   *
   * @param {string}  key    - React key
   * @param {number}  cx     - SVG centre X (pixels)
   * @param {number}  cy     - SVG centre Y (pixels, position.z mapped via ry)
   * @param {number}  sw     - rendered width in SVG pixels
   * @param {number}  sh     - rendered height in SVG pixels
   * @param {boolean} isRound - true → circle, false → rectangle
   * @param {string}  fill   - body fill colour
   * @param {string}  stroke - body stroke colour
   * @param {string}  label  - text label above speaker
   * @param {number}  zM     - acoustic centre height in metres (for z= annotation)
   * @param {boolean} labelInsideBox - if true, centre label inside the shape; if false, above
   */
  const drawSpeakerFront = ({ key, cx, cy, sw, sh, isRound, fill, stroke, label, zM, modelKey, tvPresetKey: speakerTvPreset, labelInsideBox = false, labelY, onMouseDown, vertical = false, cabinetLengthMm = null }) => {
    const sx = cx - sw / 2;
    const sy = cy - sh / 2;

    // Detect Artcoustic models for face icon rendering
    const mk = modelKey || "";
    const isQ43 = mk.includes("q4-3");
    const isQ45 = mk.includes("q4-5");
    const isQ85 = mk.includes("q8-5");
    const isQ63 = mk.includes("q6-3");
    const isEv11 = mk.includes("evolve-1-1");
    const isEv21 = !isEv11 && mk.includes("evolve-2-1");
    const isEv31 = !isEv11 && mk.includes("evolve-3-1");
    const isEv42 = mk.includes("evolve-4-2");
    const isEv63 = !isEv31 && mk.includes("evolve-6-3");
    const isEv84 = mk.includes("evolve-8-4");
    const isC41 = mk.includes("c4-1");
    // The 1222 mm, 1441 mm and 1711 mm C4-1 cabinets each have their own
    // approved artwork; every other C4-1 length keeps the existing drawing.
    const isC41_1222 = isC41 && Number(cabinetLengthMm) === 1222;
    const isC41_1441 = isC41 && Number(cabinetLengthMm) === 1441;
    const isC41_1711 = isC41 && Number(cabinetLengthMm) === 1711;
    // The C-1 is its own product ("c-1"); "c4-1" never contains that key.
    const isC1 = mk.includes("c-1");
    const isMultiSoundbar = mk.includes("multi-lcr") || mk.includes("multi-mono");
    const isTv65 = speakerTvPreset === "tv65";
    const isTv77 = speakerTvPreset === "tv77";
    const isTv83 = speakerTvPreset === "tv83";
    const isTv100 = speakerTvPreset === "tv100";
    const isManualScreen = isManualOverrideActive(screen);
    const useMulti65Artwork = isMultiSoundbar && isTv65;
    const useMulti83Artwork = isMultiSoundbar && (isTv83 || isManualScreen);
    const useMulti77Artwork = isMultiSoundbar && isTv77;
    const useMulti100Artwork = isMultiSoundbar && isTv100;
    const useMultiArtwork = useMulti65Artwork || useMulti83Artwork || useMulti77Artwork || useMulti100Artwork;

    // Full-width Multi Soundbar artwork — renders the dedicated technical line
    // drawing at exactly the screen's rendered width. ViewBox and aspect
    // ratios match each source image's NATIVE pixel dimensions to prevent
    // preserveAspectRatio="meet" from letterboxing the artwork inside the
    // screen-width container. SVG threshold filters (not CSS filters) produce
    // pure black-and-white from the grey source screenshots.
    if (useMultiArtwork) {
      const screenOW = (overallW / roomW) * drawW;
      const aspectRatio = useMulti65Artwork ? (1544 / 118) : useMulti77Artwork ? (1588 / 106) : useMulti100Artwork ? (1722 / 90) : (1558 / 90);
      const artworkW = screenOW;
      const artworkH = screenOW / aspectRatio;
      const artworkX = rx(screenCenterX) - artworkW / 2;
      const artworkY = cy - artworkH / 2;
      const ArtworkComponent = useMulti65Artwork ? MultiSoundbar65ArtworkFaceIcon : useMulti77Artwork ? MultiSoundbar77ArtworkFaceIcon : useMulti100Artwork ? MultiSoundbar100ArtworkFaceIcon : MultiSoundbarArtworkFaceIcon;
      return (
        <g key={key} onMouseDown={onMouseDown} style={onMouseDown ? { cursor: 'grab', userSelect: 'none' } : undefined}>
          <ArtworkComponent x={artworkX} y={artworkY} width={artworkW} height={artworkH} />
          <text x={rx(screenCenterX)} y={labelY ?? (artworkY - 10)} textAnchor="middle" fontSize={9} fill={LABEL_COLOR} fontWeight={700} letterSpacing="0.04em">
            {label}
          </text>
        </g>
      );
    }

    const hasFaceIcon = isQ43 || isQ45 || isQ85 || isQ63 || isEv11 || isEv21 || isEv31 || isEv42 || isEv63 || isEv84 || isC41 || isC1;

    // C4-1 and Multi Soundbar vector icons fill edge-to-edge — no transparent padding, so ratio = 1.0.
    // All other Artcoustic PNG assets have internal transparent padding; enlarge them so
    // the visible cabinet drawing fills the speaker boundary box with ~2–4px clearance.
    // C4-1, C-1 and Multi Soundbar icons are cropped to their own cabinet edges,
    // so their drawing fills the boundary box exactly (ratio 1.0). Every other
    // Artcoustic PNG carries internal transparent padding and is enlarged to
    // compensate.
    const FACE_ICON_VISIBLE_RATIO = (isC41 || isC1) ? 1.0 : 0.72;
    // A vertically mounted cabinet draws the SAME face rotated a quarter turn:
    // the face icon's own long axis is the box's height, and the whole icon is
    // turned 90° about the cabinet centre, so the drawn footprint is the cabinet's
    // rotated width × height (the dimension labels read from the same box).
    const iconBoxW = vertical ? sh : sw;
    const iconBoxH = vertical ? sw : sh;
    const adjustedW = hasFaceIcon ? iconBoxW / FACE_ICON_VISIBLE_RATIO : iconBoxW;
    const adjustedH = hasFaceIcon ? iconBoxH / FACE_ICON_VISIBLE_RATIO : iconBoxH;
    const adjustedX = hasFaceIcon ? cx - adjustedW / 2 : sx;
    const adjustedY = hasFaceIcon ? cy - adjustedH / 2 : sy;

    const renderFaceIcon = () => {
      if (isC1) return <C1FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      // Every C4-1 artwork is drawn at the cabinet's installed footprint (and
      // rotated with the cabinet when it is mounted vertically) — never
      // stretched onto another cabinet's shape.
      if (isC41 && isC41_1222) return <C41_1222FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isC41 && isC41_1441) return <C41_1441FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isC41 && isC41_1711) return <C41_1711FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isC41) return <C41FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isQ43) return <Q43FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isQ45) return <Q45FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isQ85) return <Q85FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isQ63) return <Q63FaceIcon x={adjustedX} y={adjustedY} size={Math.min(adjustedW, adjustedH)} />;
      if (isEv11) return <Evolve11FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv21) return <Evolve21FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv31) return <Evolve31FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv42) return <Evolve42FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv63) return <Evolve63FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      if (isEv84) return <Evolve84FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
      return null;
    };

    return (
      <g key={key} onMouseDown={onMouseDown} style={onMouseDown ? { cursor: 'grab', userSelect: 'none' } : undefined}>
        {/* Body */}
        {hasFaceIcon ? (
          <g transform={vertical ? `rotate(90 ${cx} ${cy})` : undefined}>
            {/* Product artwork is line art on an opaque white page — the page is
                knocked out so the graphic shows only the cabinet's own drawing. */}
            <ProductArtwork>{renderFaceIcon()}</ProductArtwork>
          </g>
        ) : isRound ? (
          <circle cx={cx} cy={cy} r={Math.max(6, sw / 2)} fill={fill} stroke={stroke} strokeWidth={1.2} opacity={0.90} />
        ) : (
          <rect x={sx} y={sy} width={sw} height={sh} fill={fill} stroke={stroke} strokeWidth={1.2} rx={2} opacity={0.90} />
        )}
        {/* Acoustic centre dot — fallback only (face icons include their own markers) */}
        {!hasFaceIcon && <circle cx={cx} cy={cy} r={1.8} fill="rgba(255,255,255,0.55)" />}
        {/* Label: above for speakers, inside for subs */}
        {labelInsideBox ? (
          <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fill={LABEL_COLOR} fontWeight={700} letterSpacing="0.04em" dominantBaseline="middle">
            {label}
          </text>
        ) : (
          <text x={cx} y={labelY ?? (sy - 10)} textAnchor="middle" fontSize={9} fill={LABEL_COLOR} fontWeight={700} letterSpacing="0.04em">
            {label}
          </text>
        )}
      </g>
    );
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", padding: 16, background: "#F8F8F7", boxSizing: "border-box" }}>
      {/* Responsive wrapper: aspect-ratio drives height from available width */}
      <div ref={drawingRef} style={{ width: "100%", aspectRatio: `${SVG_W} / ${SVG_H}` }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Title */}
        <text x={offsetX + drawW / 2} y={14} textAnchor="middle" fontSize={10} fontWeight={600} fill={LABEL_COLOR} letterSpacing="0.06em">
          FRONT ELEVATION
        </text>

        {/* Room rectangle — lighter stroke, thinner */}
        <rect
          x={offsetX}
          y={offsetY}
          width={drawW}
          height={drawH}
          fill={ROOM_FILL}
          stroke={ROOM_STROKE}
          strokeWidth={0.8}
        />

        {/* Floor construction line */}
        <line
          x1={offsetX - 6}
          y1={offsetY + drawH}
          x2={offsetX + drawW + 6}
          y2={offsetY + drawH}
          stroke={FLOOR_COLOR}
          strokeWidth={2}
          strokeLinecap="square"
        />
        {/* Floor hatch marks (engineering convention) */}
        {Array.from({ length: Math.floor(drawW / 14) + 1 }, (_, i) => (
          <line
            key={`hatch-${i}`}
            x1={offsetX + i * 14}
            y1={offsetY + drawH}
            x2={offsetX + i * 14 - 6}
            y2={offsetY + drawH + 7}
            stroke={FLOOR_COLOR}
            strokeWidth={0.7}
            opacity={0.55}
          />
        ))}

        {/* Dimension: room width */}
        <line x1={offsetX} y1={offsetY - 10} x2={offsetX + drawW} y2={offsetY - 10} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX} y1={offsetY - 14} x2={offsetX} y2={offsetY - 6} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX + drawW} y1={offsetY - 14} x2={offsetX + drawW} y2={offsetY - 6} stroke={DIM_COLOR} strokeWidth={0.8} />
        <text x={offsetX + drawW / 2} y={offsetY - 13} textAnchor="middle" fontSize={9} fill={DIM_COLOR}>
          {roomW.toFixed(2)}m
        </text>

        {/* Dimension: room height (rotated left side) */}
        <line x1={offsetX - 10} y1={offsetY} x2={offsetX - 10} y2={offsetY + drawH} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX - 14} y1={offsetY} x2={offsetX - 6} y2={offsetY} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX - 14} y1={offsetY + drawH} x2={offsetX - 6} y2={offsetY + drawH} stroke={DIM_COLOR} strokeWidth={0.8} />
        <text
          x={offsetX - 18}
          y={offsetY + drawH / 2}
          textAnchor="middle"
          fontSize={9}
          fill={DIM_COLOR}
          transform={`rotate(-90, ${offsetX - 18}, ${offsetY + drawH / 2})`}
        >
          {roomH.toFixed(2)}m
        </text>



        {/* ── drawSpeakerFront ─────────────────────────────────────────────────
           Internal helper: renders a single speaker in the XZ (front elevation)
           plane. rect for rectangular models, circle for round models.
           Designed to be the single rendering path for all front-stage speakers,
           ready to accept product SVG art in future without changing call sites.
           ──────────────────────────────────────────────────────────────────── */}

        {/* Riser outline if element exists */}
        {riserEl && (() => {
          const rW_m = Number(riserEl.length_m) || Number(riserEl.width) || roomW * 0.6;
          const rH_m = Number(riserEl.height_m) || 0.20;
          const rX_m = Number(riserEl.pos_m) || (roomW / 2 - rW_m / 2);
          const rPx_w = (rW_m / roomW) * drawW;
          const rPx_h = (rH_m / roomH) * drawH;
          return (
            <g opacity={0.9}>
              <rect
                x={rx(rX_m)}
                y={ry(rH_m)}
                width={rPx_w}
                height={rPx_h}
                fill={RISER_FILL}
                stroke={RISER_STROKE}
                strokeWidth={0.8}
                strokeDasharray="3 2"
              />
              <text x={rx(rX_m + rW_m / 2)} y={ry(rH_m) - 3} textAnchor="middle" fontSize={7} fill={DIM_COLOR} letterSpacing="0.05em">
                RISER
              </text>
            </g>
          );
        })()}

        {/* TV vertical centre guide — appears only during FL/FR drag in TV mode */}
        {tvGuide !== null && tvVerticalCentreM !== null && (() => {
          const guideY = ry(tvVerticalCentreM);
          const isSnapped = tvGuide.snapped;
          const guideColor = isSnapped ? '#10B981' : '#9B9890';
          return (
            <g key="tv-centre-guide" style={{ pointerEvents: 'none' }}>
              <line
                x1={offsetX} y1={guideY} x2={offsetX + drawW} y2={guideY}
                stroke={guideColor}
                strokeWidth={isSnapped ? 1.5 : 0.9}
                strokeDasharray={isSnapped ? '6 3' : '4 3'}
                opacity={0.9}
              />
              {isSnapped && (
                <g>
                  <rect x={offsetX + drawW / 2 - 56} y={guideY - 9} width={112} height={14} fill={guideColor} rx={2} />
                  <text x={offsetX + drawW / 2} y={guideY + 1} textAnchor="middle" fontSize={8} fill="white" fontWeight={700} letterSpacing="0.06em">
                    Aligned to TV Centre
                  </text>
                </g>
              )}
            </g>
          );
        })()}

        {/* LCR Speakers — via drawSpeakerFront helper */}
        {(Array.isArray(lcrSpeakers) ? lcrSpeakers : []).map((spk, idx) => {
          // A cropped, edge-to-edge icon (C4-1, C-1) is drawn at the cabinet's own
          // catalogue size; the padded PNG icons are enlarged to compensate for
          // their internal transparent padding.
          const isEdgeToEdgeSpk = (spk.modelKey || "").includes("c4-1") || (spk.modelKey || "").includes("c-1");
          const hMultiplier = isEdgeToEdgeSpk ? 1.0 : 1.20;
          const spkCx = rx(spk.x);
          const spkCy = ry(spk.z);
          const spkSw = Math.max(12, (spk.wM / roomW) * drawW);
          const spkSh = Math.max(12, (spk.hM / roomH) * drawH * hMultiplier);
          const heightCm = Number.isFinite(spk.z) ? Math.round(spk.z * 100) : null;
          const wCm = Number.isFinite(spk.wM) ? Math.round(spk.wM * 100) : null;
          const hCm = Number.isFinite(spk.hM) ? Math.round(spk.hM * 100) : null;
          const heightLabel = heightCm !== null ? `H${heightCm}cm` : '';
          const sizeLabel = (wCm !== null && hCm !== null) ? `${wCm}×${hCm}cm` : '';
          const otherBoxes = allSpeakerBoxes.filter(b => b.id !== `lcr-${idx}`).map(b => b.box);
          const annotation = computeSpeakerAnnotation({
            speaker: { cx: spkCx, cy: spkCy, sw: spkSw, sh: spkSh, role: spk.role, label: spk.label },
            screen: screenBoxSvg,
            roomBounds,
            otherSpeakers: otherBoxes,
            heightLabel,
            sizeLabel,
          });
          return (
            <g
              key={spk.role}
              {...speakerInfo.bind(() => ({
                ...buildSpeakerInfo({
                  role: spk.role,
                  model: spk.model,
                  acousticCentreZ_m: spk.z,
                  cabinetWidth_m: spk.wM,
                  cabinetHeight_m: spk.hM,
                  orientation: spk.orientation,
                }),
                exclusions: speakerInfoExclusions(`lcr-${idx}`),
              }))}
            >
              {drawSpeakerFront({
                key: spk.role + '-body',
                cx: spkCx,
                cy: spkCy,
                sw: spkSw,
                sh: spkSh,
                isRound: spk.round === true,
                fill: SPEAKER_FILL,
                stroke: SPEAKER_STROKE,
                label: spk.label,
                zM: spk.z,
                modelKey: spk.modelKey ?? "",
                tvPresetKey: tvPresetKey,
                // A vertically mounted centre cabinet draws its face rotated.
                vertical: spk.vertical === true,
                // The installed cabinet variant decides which artwork is drawn.
                cabinetLengthMm: spk.cabinetLengthMm ?? null,
                labelY: annotation.label.y,
                // FL/FC/FR keep their existing drag behaviour; a dual-centre
                // cabinet is draggable by its own role (FCL / FCR), so its
                // automatic position can always be adjusted by hand.
                onMouseDown: (onLcrSpeakerMoved && (canonFront(spk.role) || isCentreCabinetRole(spk.role)))
                  ? (e) => handleLcrMouseDown(e, spk.role, spk.x, spk.z)
                  : undefined,
              })}
              {/* Height and cabinet dimensions are no longer drawn permanently:
                  they are read on hover or tap in the speaker information card. */}
            </g>
          );
        })}

        {/* Front subwoofers — via drawSpeakerFront helper */}
        {(Array.isArray(subItems) ? subItems : []).map((sub, i) => {
          const subCx = rx(sub.x);
          const subCy = ry(sub.z);
          const subSw = Math.max(12, (sub.wM / roomW) * drawW);
          const subSh = Math.max(12, (sub.hM / roomH) * drawH);
          const subHCm = Number.isFinite(sub.z) ? Math.round(sub.z * 100) : null;
          const subWCm = Number.isFinite(sub.wM) ? Math.round(sub.wM * 100) : null;
          const subDimCm = Number.isFinite(sub.hM) ? Math.round(sub.hM * 100) : null;
          const heightLabel = subHCm !== null ? `H${subHCm}cm` : '';
          const sizeLabel = (subWCm !== null && subDimCm !== null) ? `${subWCm}×${subDimCm}cm` : '';
          const otherBoxes = allSpeakerBoxes.filter(b => b.id !== `sub-${i}`).map(b => b.box);
          const annotation = computeSpeakerAnnotation({
            speaker: { cx: subCx, cy: subCy, sw: subSw, sh: subSh, role: 'SUB', label: sub.label },
            screen: screenBoxSvg,
            roomBounds,
            otherSpeakers: otherBoxes,
            heightLabel,
            sizeLabel,
          });
          return (
            <g
              key={`sub-${i}`}
              {...speakerInfo.bind(() => ({
                ...buildSpeakerInfo({
                  role: sub.label,
                  model: sub.model,
                  acousticCentreZ_m: sub.z,
                  cabinetWidth_m: sub.wM,
                  cabinetHeight_m: sub.hM,
                  orientation: sub.orientation,
                }),
                exclusions: speakerInfoExclusions(`sub-${i}`),
              }))}
            >
              {drawSpeakerFront({
                key: `sub-${i}-body`,
                cx: subCx,
                cy: subCy,
                sw: subSw,
                sh: subSh,
                isRound: false,
                fill: "#fff",
                stroke: "#4A4540",
                label: sub.label,
                zM: sub.z,
                labelInsideBox: true,
                onMouseDown: onFrontSubMoved ? (e) => handleSubMouseDown(e, i, sub.id, sub.x, sub.z) : undefined,
              })}
              {/* Dimensions are read on hover or tap instead of being drawn. */}
            </g>
          );
        })}

        {/* Screen: overall frame (black), then viewable area (white).
            Drawn AFTER the loudspeaker and subwoofer layers, so the cabinet's
            screen frame and surface sit in front of every graphic on the front
            wall and no speaker can cut through the screen perimeter. */}
        {(() => {
          // Overall frame rect (viewable + border on all sides)
          const oW = (overallW / roomW) * drawW;
          const oH = (overallH / roomH) * drawH;
          const ox = rx(screenCenterX) - oW / 2;
          const oy = ry(screenFloorM + screenData.h + borderM);

          // Viewable rect
          const sw = (screenData.w / roomW) * drawW;
          const sh = (screenData.h / roomH) * drawH;
          const sx = rx(screenCenterX) - sw / 2;
          const syTop = ry(screenFloorM + screenData.h);

          const labelViewable = `${(screenData.w * 100).toFixed(0)} × ${(screenData.h * 100).toFixed(0)} cm (viewable)`;
          const labelOverall = `${(overallW * 100).toFixed(0)} × ${(overallH * 100).toFixed(0)} cm overall${!hasBorderData ? ' (est. frame)' : ''}`;

          return (
            <g>
              {/* Black frame */}
              <rect x={ox} y={oy} width={oW} height={oH} fill={SCREEN_STROKE} stroke={SCREEN_STROKE} strokeWidth={1} rx={2} />
              {/* White viewable area */}
              <rect x={sx} y={syTop} width={sw} height={sh} fill="#fff" stroke="#555" strokeWidth={0.5} />
              {/* Screen labels: inside white area top-left if there is room, else below frame */}
              {sw >= 90 && sh >= 36 ? (
                // Enough room — render inside top-left of the white viewable area
                <g>
                  <text x={sx + 5} y={syTop + 11} textAnchor="start" fontSize={7} fill="#888">
                    {labelOverall}
                  </text>
                  <text x={sx + 5} y={syTop + 21} textAnchor="start" fontSize={7} fill="#444" fontWeight={600}>
                    {labelViewable}
                  </text>
                </g>
              ) : (
                // Too small — render below the frame, centred
                <g>
                  <text x={rx(screenCenterX)} y={oy + oH + 12} textAnchor="middle" fontSize={7} fill={DIM_COLOR}>
                    {labelOverall}
                  </text>
                  <text x={rx(screenCenterX)} y={oy + oH + 22} textAnchor="middle" fontSize={7} fill={LABEL_COLOR} fontWeight={600}>
                    {labelViewable}
                  </text>
                </g>
              )}
            </g>
          );
        })()}

        {/* Projector element if present */}
        {projectorEl && (() => {
          const pX_m = Number.isFinite(Number(projectorEl.x_lens_m)) ? Number(projectorEl.x_lens_m) : (roomW / 2);
          const pZ_m = Number.isFinite(Number(projectorEl.z_lens_m)) ? Number(projectorEl.z_lens_m) : (roomH - 0.3);
          const pW_m = Number(projectorEl.body_width_m) || 0.35;
          const pD_m = Number(projectorEl.body_depth_m) || 0.25;
          const pW_px = Math.max(16, (pW_m / roomW) * drawW);
          const pD_px = Math.max(10, (pD_m / roomH) * drawH);
          const pX_px = rx(pX_m) - pW_px / 2;
          const pY_px = ry(pZ_m) - pD_px / 2;
          return (
            <g opacity={0.88}>
              <rect x={pX_px} y={pY_px} width={pW_px} height={pD_px} fill={PROJ_FILL} stroke="#222" strokeWidth={1} rx={2} />
              {/* Lens circle */}
              <circle cx={rx(pX_m)} cy={ry(pZ_m)} r={Math.max(3, pD_px * 0.28)} fill="#888" stroke="#555" strokeWidth={0.8} />
              <text x={rx(pX_m)} y={pY_px - 4} textAnchor="middle" fontSize={8} fill={DIM_COLOR} letterSpacing="0.05em">
                PROJ
              </text>
            </g>
          );
        })()}

        {/* Vertical alignment guide — visible only during vertical LCR drag, within 5 cm */}
        {alignGuide && (() => {
          const fc = lcrSpeakers.find(s => s.role === 'FC');
          const fl = lcrSpeakers.find(s => s.role === 'FL');
          if (!fc || !fl) return null;
          const isDraggingFC = alignGuide.draggingRole === 'FC';
          const fcZ = isDraggingFC ? alignGuide.liveZ : fc.z;
          const lrZ = (!isDraggingFC) ? alignGuide.liveZ : fl.z;
          const diffM = fcZ - lrZ; // positive = FC is higher than L/R
          if (Math.abs(diffM) > 0.05) return null; // outside 5 cm threshold — hide guide
          const diffCm = Math.round(diffM * 100);
          const isAligned = diffCm === 0;
          const fcY = ry(fcZ);
          const lrY = ry(lrZ);
          const x1 = offsetX + 8;
          const x2 = offsetX + drawW - 8;
          const midX = offsetX + drawW / 2;
          const labelY = (fcY + lrY) / 2;
          const guideColor = isAligned ? '#F59E0B' : '#6B7280';
          const label = isAligned ? 'Aligned' : diffCm > 0 ? `FC ${Math.abs(diffCm)} cm above` : `FC ${Math.abs(diffCm)} cm below`;
          return (
            <g key="align-guide" opacity={0.88}>
              {/* Guide line at L/R height */}
              <line x1={x1} y1={lrY} x2={x2} y2={lrY}
                stroke={guideColor} strokeWidth={isAligned ? 1.5 : 0.9}
                strokeDasharray={isAligned ? '5 2' : '4 3'} />
              {/* Guide line at FC height (only when not aligned) */}
              {!isAligned && (
                <line x1={x1} y1={fcY} x2={x2} y2={fcY}
                  stroke={guideColor} strokeWidth={0.9} strokeDasharray="4 3" />
              )}
              {/* Vertical callout between the two lines */}
              {!isAligned && (
                <line x1={midX} y1={Math.min(fcY, lrY)} x2={midX} y2={Math.max(fcY, lrY)}
                  stroke={guideColor} strokeWidth={0.8} />
              )}
              {/* Label background + text */}
              <rect x={midX - 32} y={labelY - 8} width={64} height={13} fill="white" opacity={0.9} rx={2} />
              <text x={midX} y={labelY + 2} textAnchor="middle" fontSize={8}
                fill={guideColor} fontWeight={isAligned ? 700 : 500}>{label}</text>
            </g>
          );
        })()}

        {/* Magnetic snap guide — visible only during active snap */}
        {activeSnap && (() => {
          const SNAP_COLOR = '#10B981';
          const drag = dragRef.current;
          const dragRole = drag?.role;
          const isDragSub = drag?.type === 'sub';
          const draggedSpk = lcrSpeakers.find(s => s.role === dragRole);
          const draggedSub = isDragSub ? (subItems[drag?.subIndex] ?? null) : null;
          const sx = draggedSpk ? rx(draggedSpk.x) : (draggedSub ? rx(draggedSub.x) : offsetX + drawW / 2);
          const sz = draggedSpk ? ry(draggedSpk.z) : (draggedSub ? ry(draggedSub.z) : offsetY + drawH / 2);
          // AFF: bottom of the dragged cabinet at the snapped position
          const draggedItem = draggedSpk ?? draggedSub;
          const snapZCentre = activeSnap.axis === 'z' ? activeSnap.value : (draggedItem?.z ?? 0);
          const affText = `${snapZCentre.toFixed(2)}m AFF`;
          return (
            <g key="snap-guide" opacity={0.85}>
              {activeSnap.axis === 'x' && (
                <line x1={rx(activeSnap.value)} y1={offsetY} x2={rx(activeSnap.value)} y2={offsetY + drawH}
                  stroke={SNAP_COLOR} strokeWidth={1.2} strokeDasharray="6 3" />
              )}
              {activeSnap.axis === 'z' && (
                <line x1={offsetX} y1={ry(activeSnap.value)} x2={offsetX + drawW} y2={ry(activeSnap.value)}
                  stroke={SNAP_COLOR} strokeWidth={1.2} strokeDasharray="6 3" />
              )}
              <rect x={sx + 7} y={sz - 8} width={44} height={23} fill={SNAP_COLOR} rx={2} />
              <text x={sx + 29} y={sz + 2} textAnchor="middle" fontSize={7} fill="white" fontWeight={700} letterSpacing="0.06em">SNAP</text>
              <text x={sx + 29} y={sz + 13} textAnchor="middle" fontSize={6.5} fill="white" fontWeight={600}>{affText}</text>
            </g>
          );
        })()}

        {/* Centre height AFF badge — visible during any vertical drag (non-snap) */}
        {alignGuide && (() => {
          const spk = lcrSpeakers.find(s => s.role === alignGuide.draggingRole);
          if (!spk) return null;
          const affZ = alignGuide.liveZ;
          const px = rx(spk.x);
          const pz = ry(affZ);
          return (
            <g key="aff-badge" opacity={0.92}>
              <rect x={px - 26} y={pz - 19} width={52} height={14} fill="#213428" rx={2} />
              <text x={px} y={pz - 8} textAnchor="middle" fontSize={7.5} fill="white" fontWeight={700} letterSpacing="0.04em">
                {affZ.toFixed(2)}m AFF
              </text>
            </g>
          );
        })()}

        {/* Clash warning — amber popup when objects are within 50 mm */}
        {clashes.length > 0 && (() => {
          const warnW = 162;
          const warnH = 28 + clashes.length * 13;
          const wx = offsetX + drawW - warnW - 6;
          const wy = offsetY + 6;
          return (
            <g key="clash-warning" style={{ pointerEvents: 'none' }}>
              <rect x={wx} y={wy} width={warnW} height={warnH} rx={4}
                fill="#FFFBEB" stroke="#F59E0B" strokeWidth={1.2} />
              <text x={wx + warnW / 2} y={wy + 13} textAnchor="middle" fontSize={8} fill="#92400E" fontWeight={700}>
                ⚠ Speaker/subwoofer clash detected
              </text>
              {clashes.map((pair, ci) => (
                <text key={ci} x={wx + warnW / 2} y={wy + 24 + ci * 13} textAnchor="middle" fontSize={7} fill="#78350F">
                  {pair}
                </text>
              ))}
            </g>
          );
        })()}

        {/* Empty state hint */}
        {lcrSpeakers.length === 0 && frontSubs.length === 0 && (
          <text x={offsetX + drawW / 2} y={offsetY + drawH / 2} textAnchor="middle" fontSize={11} fill={DIM_COLOR}>
            Add speakers in the Controls panel
          </text>
        )}
      </svg>
      </div>

      {/* Speaker information card — anchored to the hovered or tapped speaker,
          outside the SVG so the drawing can never clip it. */}
      <SpeakerInfoTooltip
        visible={speakerInfo.visible}
        title={speakerInfo.info?.title}
        lines={speakerInfo.info?.lines}
        anchor={speakerInfo.anchor}
        bounds={speakerInfo.bounds}
        exclusions={speakerInfo.info?.exclusions}
      />
    </div>
  );
}