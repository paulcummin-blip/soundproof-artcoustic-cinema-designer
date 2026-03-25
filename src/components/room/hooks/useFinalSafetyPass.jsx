import { useEffect } from 'react';
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { timeNowMs } from "@/components/utils/timeNow";

export function useFinalSafetyPass({
  placedSpeakers,
  effectivePreset,
  useWides,
  effectiveDims,
  allowedRoles,
  setSpeakers,
  surroundConfig,
}) {
  useEffect(() => {
    setSpeakers(prevSpeakers => {
      let speakers = [...prevSpeakers];
      let changed = false;

      const W = Number(effectiveDims?.width ?? effectiveDims?.widthM) || 0;
      const L = Number(effectiveDims?.length ?? effectiveDims?.lengthM) || 0;

      if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
        return prevSpeakers;
      }

      const earZ = 1.1;
      const EPS = 1e-4;

      const layoutMajor = parseInt(String(effectivePreset || '5.1').split('.')[0], 10) || 5;
      const expectsRears = (layoutMajor >= 9) || (layoutMajor === 7 && !useWides);

      const masterModel = surroundConfig?.value?.master;
      const masterModelValid = masterModel && String(masterModel).toLowerCase() !== 'off' && String(masterModel).toLowerCase() !== 'none';

      if (expectsRears && masterModelValid) {
        let SBL = speakers.find(s => getCanonicalRole(s.role) === 'SBL');
        let SBR = speakers.find(s => getCanonicalRole(s.role) === 'SBR');

        const hasFiniteXY = (s) => !!s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);

        if (!SBL) {
          const fixedX = Math.max(0.01, Math.min(W - 0.01, W * 0.25));
          const fixedY = Math.max(0.01, L - 0.10);
          SBL = { id: `sbl-${timeNowMs()}`, role: 'SBL', model: masterModelValid ? masterModel : null, position: { x: fixedX, y: fixedY, z: earZ }, rotation: { x: 0, y: 0, z: 0 }, draggable: true };
          speakers.push(SBL);
          changed = true;
        }

        if (!SBR) {
          const fixedX = Math.max(0.01, Math.min(W - 0.01, W * 0.75));
          const fixedY = Math.max(0.01, L - 0.10);
          SBR = { id: `sbr-${timeNowMs()}`, role: 'SBR', model: masterModelValid ? masterModel : null, position: { x: fixedX, y: fixedY, z: earZ }, rotation: { x: 0, y: 0, z: 0 }, draggable: true };
          speakers.push(SBR);
          changed = true;
        }

        const fixRearSpeaker = (speaker, defaultXFraction) => {
          if (!speaker || speaker.positionSource === 'user') return speaker;
          const mk = String(speaker?.model || '').trim().toLowerCase();
          const modelOn = !!mk && mk !== 'off' && mk !== 'none';
          if (modelOn && !hasFiniteXY(speaker)) {
            const fixedX = Math.max(0.01, Math.min(W - 0.01, W * defaultXFraction));
            const fixedY = Math.max(0.01, L - 0.10);
            changed = true;
            return { ...speaker, position: { x: fixedX, y: fixedY, z: earZ }, rotation: speaker.rotation || { x: 0, y: 0, z: 0 } };
          }
          return speaker;
        };

        const newSBL = fixRearSpeaker(SBL, 0.25);
        const newSBR = fixRearSpeaker(SBR, 0.75);
        if (newSBL !== SBL) speakers = speakers.map(s => getCanonicalRole(s.role) === 'SBL' ? newSBL : s);
        if (newSBR !== SBR) speakers = speakers.map(s => getCanonicalRole(s.role) === 'SBR' ? newSBR : s);
      } else if (expectsRears && !masterModelValid) {
        speakers = speakers.map(s => {
          const canon = getCanonicalRole(s.role);
          if (canon === 'SBL' || canon === 'SBR') {
            const modelKey = String(s?.model || '').trim().toLowerCase();
            const hasValidModel = !!modelKey && modelKey !== 'off' && modelKey !== 'none';
            const hasValidPosition = !!s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);
            if (!hasValidModel || !hasValidPosition) {
              if (s.position) { changed = true; return { ...s, position: null }; }
            }
          }
          return s;
        });
      }

      const LW = speakers.find(s => getCanonicalRole(s.role) === 'LW');
      const RW = speakers.find(s => getCanonicalRole(s.role) === 'RW');

      if (LW && RW && LW.position && RW.position && Number.isFinite(LW.position.x) && Number.isFinite(LW.position.y) && Number.isFinite(RW.position.x) && Number.isFinite(RW.position.y)) {
        const lwUser = LW.positionSource === 'user';
        const rwUser = RW.positionSource === 'user';

        if (lwUser && rwUser) return changed ? speakers : prevSpeakers;

        let sharedY;
        if (lwUser && !rwUser) sharedY = LW.position.y;
        else if (!lwUser && rwUser) sharedY = RW.position.y;
        else sharedY = (LW.position.y + RW.position.y) / 2;

        const roomCenter = W / 2;
        let targetLwX, targetRwX;

        if (lwUser && !rwUser) { targetLwX = LW.position.x; targetRwX = W - LW.position.x; }
        else if (!lwUser && rwUser) { targetRwX = RW.position.x; targetLwX = W - RW.position.x; }
        else {
          const avgDistFromCenter = ((roomCenter - LW.position.x) + (RW.position.x - roomCenter)) / 2;
          targetLwX = roomCenter - avgDistFromCenter;
          targetRwX = roomCenter + avgDistFromCenter;
        }

        const minXClamp = 0.02, maxXClamp = W - 0.02;
        targetLwX = Math.max(minXClamp, Math.min(maxXClamp, targetLwX));
        targetRwX = Math.max(minXClamp, Math.min(maxXClamp, targetRwX));

        let lwChanged = false, rwChanged = false;
        const updatedSpeakers = speakers.map(s => {
          const canon = getCanonicalRole(s.role);
          if (canon === 'LW') {
            let newPos = { ...s.position };
            if (Number.isFinite(sharedY) && Math.abs(newPos.y - sharedY) > EPS) { newPos.y = sharedY; lwChanged = true; }
            if (!lwUser && Number.isFinite(targetLwX) && Math.abs(newPos.x - targetLwX) > EPS) { newPos.x = targetLwX; lwChanged = true; }
            return lwChanged ? { ...s, position: newPos } : s;
          } else if (canon === 'RW') {
            let newPos = { ...s.position };
            if (Number.isFinite(sharedY) && Math.abs(newPos.y - sharedY) > EPS) { newPos.y = sharedY; rwChanged = true; }
            if (!rwUser && Number.isFinite(targetRwX) && Math.abs(newPos.x - targetRwX) > EPS) { newPos.x = targetRwX; rwChanged = true; }
            return rwChanged ? { ...s, position: newPos } : s;
          }
          return s;
        });

        if (lwChanged || rwChanged) { changed = true; speakers = updatedSpeakers; }
      }

      return changed ? speakers : prevSpeakers;
    });
  }, [
    placedSpeakers,
    effectivePreset,
    useWides,
    effectiveDims?.width, effectiveDims?.widthM,
    effectiveDims?.length, effectiveDims?.lengthM,
    allowedRoles,
    setSpeakers,
  ]);
}