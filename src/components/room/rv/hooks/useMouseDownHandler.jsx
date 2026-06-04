"use client";

import { useCallback } from "react";

export function useMouseDownHandler({
  byId,
  setDragState,
  setDragWarning,
  setTooltip,
  rsDragLockRef,
  getCanonicalRole,
  widthM,
  lengthM,
  canvasToRoom,
  svgRef,
  isAnyDraggingRef,
  isDraggingSpeakerRef,
  isDraggingRearRef,
  isDraggingFW,
  isDraggingSubRef,
  dragOffsetRoomRef,
  draggedSubWallRef,
  draggedSubTypeRef,
  draftFrontSubsRef,
  draftRearSubsRef,
  idleCommitTimerRef,
  frontSubs,
  rearSubs,
  frontSubsCfg,
  rearSubsCfg,
  isRenderableSpeaker,
  isDraggable,
  roomElements,
}) {
  const handleMouseDown = useCallback(
    (e, id, type) => {
      e.preventDefault();
      e.stopPropagation();

      // Shared cursor calculation — must come first so all branches can use cursorRoom
      if (!svgRef.current) return;
      const svgElement = svgRef.current;
      const point = svgElement.createSVGPoint();
      point.x = e.clientX;
      point.y = e.clientY;
      const ctm = svgElement.getScreenCTM();
      if (!ctm) return;
      const inverseCTM = ctm.inverse();
      const svgPoint = point.matrixTransform(inverseCTM);
      const cursorRoom = canvasToRoom({ x: svgPoint.x, y: svgPoint.y });

      let target = byId.get(id);

      // If it's a sub id like "rear-sub-0" / "front-sub-0", it might only exist
      // in the fallback rendering list, so byId will not contain it.
      // In that case, build a minimal target from the cfg so dragging can work.
      if (!target && typeof id === "string") {
        const mRear = id.match(/^rear-sub-(\d+)$/);
        const mFront = id.match(/^front-sub-(\d+)$/);

        if (mRear) {
          const idx = Number(mRear[1] || 0);
          const xFromCfg = rearSubsCfg?.positions?.[idx]?.x;
          const x = Number.isFinite(xFromCfg) ? xFromCfg : (widthM / 2);

          target = {
            id,
            model: rearSubsCfg?.model || "SUB2-12",
            role: `SUBR${idx + 1}`,
            position: { x, y: lengthM, z: 0 },
            _subType: "rear",
          };
        } else if (mFront) {
          const idx = Number(mFront[1] || 0);
          const xFromCfg = frontSubsCfg?.positions?.[idx]?.x;
          const x = Number.isFinite(xFromCfg) ? xFromCfg : (widthM / 2);

          target = {
            id,
            model: frontSubsCfg?.model || "SUB2-12",
            role: `SUBF${idx + 1}`,
            position: { x, y: 0, z: 0 },
            _subType: "front",
          };
        }
      }

      // Projector drag: handled separately (not in byId)
      if (type === 'projector') {
        const projEl = Array.isArray(roomElements)
          ? roomElements.find(e => e?.type === 'projector')
          : null;
        const lensY = Number(projEl?.y_lens_m) || lengthM * 0.8;
        dragOffsetRoomRef.current = { x: (Number(projEl?.x_lens_m) || widthM / 2) - cursorRoom.x, y: lensY - cursorRoom.y };
        isAnyDraggingRef.current = true;
        setDragState({ dragging: true, draggedItemId: id, dragType: 'projector' });
        setDragWarning({ show: false });
        rsDragLockRef.current = null;
        return;
      }

      // Room element drag (non-projector wall elements)
      if (type === 'roomElement') {
        const el = Array.isArray(roomElements)
          ? roomElements.find(re => String(re?.id) === String(id))
          : null;
        if (!el) return;
        const wall = String(el?.wall || 'front').toLowerCase();
        const isFrontRear = wall === 'front' || wall === 'rear';
        const posM = Number.isFinite(Number(el?.pos_m)) ? Number(el.pos_m) :
                     Number.isFinite(Number(el?.x_m)) ? Number(el.x_m) :
                     Number.isFinite(Number(el?.y_m)) ? Number(el.y_m) : 0;
        // Compute room coords of element centre for offset
        const L = Number(el?.length_m) || 0.9;
        const centerPosM = posM + L / 2;
        dragOffsetRoomRef.current = {
          x: isFrontRear ? (centerPosM - cursorRoom.x) : 0,
          y: isFrontRear ? 0 : (centerPosM - cursorRoom.y),
        };
        isAnyDraggingRef.current = true;
        setDragState({ dragging: true, draggedItemId: String(id), dragType: 'roomElement' });
        setDragWarning({ show: false });
        rsDragLockRef.current = null;
        return;
      }

      if (!target) return;

      const canonicalRole = getCanonicalRole(target.role);
      const isOverhead =
        typeof canonicalRole === "string" && canonicalRole.startsWith("T");

      // 1) For non-overhead speakers, keep the existing "renderable" guard.
      if (type === "speaker" && !isOverhead && !isRenderableSpeaker(target)) {
        return;
      }

      // 2) For non-overhead speakers, keep the existing "locked" behaviour.
      //    Overheads bypass this, so they never show "Position is locked".
      if (type === "speaker" && !isOverhead && !isDraggable(target)) {
        setTooltip({ show: true, text: "Position is locked" });
        setTimeout(() => {
          setTooltip((t) =>
            t.text === "Position is locked" ? { show: false } : t
          );
        }, 1500);
        return;
      }

      if (globalThis.__B44_LOGS) console.log("[DRAG] START", { id, type, role: target?.role, hasTarget: !!target });

      // Store offset between speaker center and cursor
      if (type === "speaker" && target.position) {
        dragOffsetRoomRef.current = {
          x: target.position.x - cursorRoom.x,
          y: target.position.y - cursorRoom.y
        };
      } else if (type === "seat" && (target.x || target.position?.x)) {
        const seatX = target.x ?? target.position?.x ?? 0;
        const seatY = target.y ?? target.position?.y ?? 0;
        dragOffsetRoomRef.current = {
          x: seatX - cursorRoom.x,
          y: seatY - cursorRoom.y
        };
      } else if (type === "sub" && target.position) {
        // Detect wall first so we can align the Y offset with the first drag frame.
        // On front/rear walls, Y is pinned by useSubDragHandler (finalY = halfD+EPS or
        // lengthM-halfD-EPS), so the Y offset must be 0 to avoid a first-frame jump.
        // On left/right walls, X is pinned and Y is free, so Y offset is meaningful.
        const _sx = target.position.x;
        const _sy = target.position.y;
        const _threshold = 0.05;
        let _detectedWall = null;
        if (Math.abs(_sy) < _threshold) _detectedWall = 'front';
        else if (Math.abs(_sy - lengthM) < _threshold) _detectedWall = 'rear';
        else if (Math.abs(_sx) < _threshold) _detectedWall = 'left';
        else if (Math.abs(_sx - widthM) < _threshold) _detectedWall = 'right';
        else {
          const _dF = _sy, _dR = lengthM - _sy, _dL = _sx, _dRt = widthM - _sx;
          const _min = Math.min(_dF, _dR, _dL, _dRt);
          if (_min === _dF) _detectedWall = 'front';
          else if (_min === _dR) _detectedWall = 'rear';
          else if (_min === _dL) _detectedWall = 'left';
          else _detectedWall = 'right';
        }

        const _yIsPinned = _detectedWall === 'front' || _detectedWall === 'rear';
        const _xIsPinned = _detectedWall === 'left' || _detectedWall === 'right';

        dragOffsetRoomRef.current = {
          x: _xIsPinned ? 0 : (target.position.x - cursorRoom.x),
          y: _yIsPinned ? 0 : (target.position.y - cursorRoom.y),
        };
        // Detect and store which wall this sub is on
        const x = target.position.x;
        const y = target.position.y;
        const threshold = 0.05;

        let wall = null;
        if (Math.abs(y) < threshold) wall = 'front';
        else if (Math.abs(y - lengthM) < threshold) wall = 'rear';
        else if (Math.abs(x) < threshold) wall = 'left';
        else if (Math.abs(x - widthM) < threshold) wall = 'right';
        else {
          // Default to closest wall
          const distFront = y;
          const distRear = lengthM - y;
          const distLeft = x;
          const distRight = widthM - x;
          const minDist = Math.min(distFront, distRear, distLeft, distRight);

          if (minDist === distFront) wall = 'front';
          else if (minDist === distRear) wall = 'rear';
          else if (minDist === distLeft) wall = 'left';
          else wall = 'right';
        }

        draggedSubWallRef.current = wall;
        draggedSubTypeRef.current = target._subType;

        // Initialize draft positions from current real positions
        isDraggingSubRef.current = true;
        // Build a "seed" list for dragging.
        // If live arrays are empty (common when only fallback is drawn), seed from cfg.
        // Always normalise IDs to canonical format: front-sub-${idx} / rear-sub-${idx}
        // so that useSubDragHandler can reliably extract subIndex via regex.
        const normaliseSubs = (subs, group, cfg, defaultY) =>
          (Array.isArray(subs) && subs.length > 0)
            ? subs.map((s, idx) => ({
                ...s,
                id: `${group}-sub-${idx}`,
                position: s.position ? { ...s.position } : { x: widthM / 2, y: defaultY, z: 0 },
                _subType: group,
              }))
            : Array.from({ length: Number(cfg?.count || 0) }, (_, idx) => {
                const xFromCfg = cfg?.positions?.[idx]?.x;
                const yFromCfg = cfg?.positions?.[idx]?.y;
                const x = Number.isFinite(xFromCfg) ? xFromCfg : (widthM / 2);
                const y = Number.isFinite(yFromCfg) ? yFromCfg : defaultY;
                return {
                  id: `${group}-sub-${idx}`,
                  model: cfg?.model || "SUB2-12",
                  role: group === 'front' ? `SUBF${idx + 1}` : `SUBR${idx + 1}`,
                  position: { x, y, z: 0 },
                  _subType: group,
                };
              });

        const seedFront = normaliseSubs(frontSubs, 'front', frontSubsCfg, 0);
        const seedRear  = normaliseSubs(rearSubs,  'rear',  rearSubsCfg,  lengthM);

        // Normalise draft order so index 0 is always the leftmost sub and index 1
        // is always the rightmost. This ensures the mirror logic in useSubDragHandler
        // (which assumes draftArray[0]=left, draftArray[1]=right) is always correct
        // on the very first grab, before any commit has normalised the stored order.
        const sortByX = (arr) => {
          if (arr.length <= 1) return arr;
          const allValid = arr.every(s => Number.isFinite(s?.position?.x));
          if (!allValid) return arr;
          return [...arr].sort((a, b) => a.position.x - b.position.x);
        };

        draftFrontSubsRef.current = sortByX(seedFront).map(s => ({ ...s, position: { ...s.position } }));
        draftRearSubsRef.current  = sortByX(seedRear).map(s => ({ ...s, position: { ...s.position } }));

        // Signal BassResponse that dragging started
        if (typeof window !== 'undefined' && typeof window.__B44_setIsDraggingSub === 'function') {
          window.__B44_setIsDraggingSub(true);
        }

        // Clear any pending idle timer
        if (idleCommitTimerRef.current) {
          clearTimeout(idleCommitTimerRef.current);
          idleCommitTimerRef.current = null;
        }
      }

      isAnyDraggingRef.current = true;

      setDragState({
        dragging: true,
        draggedItemId: id,
        dragType: type,
      });
      setDragWarning({ show: false });
      rsDragLockRef.current = null;

      if (type === "speaker") {
        isDraggingSpeakerRef.current = true;
        const speakerBeingDragged = byId.get(id);
        const canonRole = getCanonicalRole(speakerBeingDragged.role);
        if (canonRole === "SBL" || canonRole === "SBR") {
          isDraggingRearRef.current++;
        }
        if (canonRole === "LW" || canonRole === "RW") {
          isDraggingFW.current = true;
        }

        // Capture pointer on the target element
        try {
          if (e.target && typeof e.target.setPointerCapture === 'function') {
            e.target.setPointerCapture(e.pointerId);
          }
        } catch (err) {
          // Ignore capture errors
        }
      }

      if (type === "sub") {
        isDraggingSpeakerRef.current = true;

        // Capture pointer on the target element
        try {
          if (e.target && typeof e.target.setPointerCapture === 'function') {
            e.target.setPointerCapture(e.pointerId);
          }
        } catch (err) {
          // Ignore capture errors
        }
      }
    },
    [byId, setDragState, setDragWarning, setTooltip, rsDragLockRef, getCanonicalRole, widthM, lengthM, canvasToRoom, svgRef, roomElements]
  );

  return { handleMouseDown };
}