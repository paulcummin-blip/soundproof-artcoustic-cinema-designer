
// components/utils/overheadPlacement.js
const A = (x) => (Array.isArray(x) ? x : []);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const cloneSpeakers = (speakers) =>
  A(speakers).map((s) => ({
    ...s,
    position: s?.position ? { ...s.position } : { x: 0, y: 0, z: 0 },
  }));

const lateralFromSeatSpacing = (seatSpacing) =>
  clamp(isNum(seatSpacing) ? seatSpacing / 2 : 0.35, 0.25, 0.45);

const clampY = (y, room, keep = 0.30) => {
  const yMin = isNum(room?.yMin) ? room.yMin : 0;
  const yMax = isNum(room?.yMax) ? room.yMax : 6;
  return clamp(y, yMin + keep, yMax - keep);
};

const roomFromBox = (roomBox) => ({
  xMin: 0,
  yMin: 0,
  xMax: isNum(roomBox?.width) ? roomBox.width : 6,
  yMax: isNum(roomBox?.length) ? roomBox.length : 8,
  height: isNum(roomBox?.height) ? roomBox.height : 2.4,
});

export function placeTopMiddlesAtMLP({ speakers, mlp, room, offsetM = 0 }) {
  const next = cloneSpeakers(speakers);
  const iL = next.findIndex((s) => s.role === "TML");
  const iR = next.findIndex((s) => s.role === "TMR");
  if (iL < 0 || iR < 0 || !mlp) return next;

  const lat = lateralFromSeatSpacing(mlp.seatSpacing);
  const y = clampY((mlp?.y ?? 0) + (isNum(offsetM) ? offsetM : 0), room);
  const zTop = isNum(room?.height) ? room.height - 0.2 : 2.3;

  next[iL].position.x = mlp.x - lat;
  next[iL].position.y = y;
  next[iL].position.z = next[iL].position.z ?? zTop;

  next[iR].position.x = mlp.x + lat;
  next[iR].position.y = y;
  next[iR].position.z = next[iR].position.z ?? zTop;

  return next;
}

export function applyMirroredTFTR({ speakers, room, offsetM = 0 }) {
  const next = cloneSpeakers(speakers);
  const pairs = [["TFL","TRL"],["TFR","TRR"]];
  const off = isNum(offsetM) ? offsetM : 0;
  for (const [F,R] of pairs) {
    const iF = next.findIndex(s => s.role === F);
    const iR = next.findIndex(s => s.role === R);
    if (iF >= 0) next[iF].position.y = clampY(next[iF].position.y - off, room);
    if (iR >= 0) next[iR].position.y = clampY(next[iR].position.y + off, room);
  }
  return next;
}

export function snapMiddlesBetweenTFTR({ speakers, room }) {
  const next = cloneSpeakers(speakers);
  const tfl = next.find(s=>s.role==="TFL");
  const trl = next.find(s=>s.role==="TRL");
  const tfr = next.find(s=>s.role==="TFR");
  const trr = next.find(s=>s.role==="TRR");
  const iML = next.findIndex(s=>s.role==="TML");
  const iMR = next.findIndex(s=>s.role==="TMR");

  const mid = (a,b) => (a?.position && b?.position)
    ? { x:(a.position.x+b.position.x)/2,
        y:clampY((a.position.y+b.position.y)/2, room),
        z:a.position.z ?? b.position.z }
    : null;

  if (iML >= 0 && tfl && trl) {
    const m = mid(tfl, trl);
    if (m) { m.x = tfl.position.x; next[iML].position = m; }
  }
  if (iMR >= 0 && tfr && trr) {
    const m = mid(tfr, trr);
    if (m) { m.x = tfr.position.x; next[iMR].position = m; }
  }
  return next;
}

export function applyOverheadPlacement({
  speakers,
  seating,
  roomBox,
  overheadCount,
  offsetM = 0,
}) {
  const S = Array.isArray(speakers) ? speakers : [];
  let next = S.map(s => ({ ...s, position: s.position ? { ...s.position } : null }));

  const mlp = seating?.mlp;
  const oh = isNum(overheadCount) ? overheadCount : 0;
  if (!oh || !mlp) return next;

  const room = roomFromBox(roomBox);
  if (oh === 2) return placeTopMiddlesAtMLP({ speakers: next, mlp, room, offsetM });
  if (oh === 4) return applyMirroredTFTR({ speakers: next, room, offsetM });
  if (oh === 6) return snapMiddlesBetweenTFTR({ speakers: applyMirroredTFTR({ speakers: next, room, offsetM }), room });
  return next;
}

export const placeTwoOverheadsOverMLP = ({ speakers, mlp, foreAftOffsetM = 0, minLat = 0.25, maxLat = 0.45 }) => {
  const next = cloneSpeakers(speakers);
  const iL = next.findIndex(s => s.role === 'TML');
  const iR = next.findIndex(s => s.role === 'TMR');
  if (iL === -1 || iR === -1 || !mlp) return next;
  const lat = clamp((mlp.seatSpacing ?? 0.6)/2, minLat, maxLat);
  const y = (mlp.y ?? 0) + (isNum(foreAftOffsetM) ? foreAftOffsetM : 0);
  next[iL].position.x = mlp.x - lat; next[iL].position.y = y;
  next[iR].position.x = mlp.x + lat; next[iR].position.y = y;
  return next;
};

export default {
  placeTopMiddlesAtMLP,
  applyMirroredTFTR,
  snapMiddlesBetweenTFTR,
  applyOverheadPlacement,
  placeTwoOverheadsOverMLP,
};
