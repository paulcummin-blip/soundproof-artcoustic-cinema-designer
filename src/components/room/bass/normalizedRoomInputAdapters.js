const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function canonicalizeSeatIdentity(value) {
  const rawIdentity = value?.seatId ?? value?.id ?? value;
  return rawIdentity == null ? "" : String(rawIdentity).trim().toLowerCase();
}

export function isReferenceSeatIdentity(seat) {
  if (seat?.__isSyntheticRsp === true) return true;
  return ["rsp", "mlp"].includes(canonicalizeSeatIdentity(seat));
}

export function canonicalizeRoomDims(room) {
  const widthM = finite(room?.widthM ?? room?.width_m ?? room?.width ?? room?.room_width);
  const lengthM = finite(room?.lengthM ?? room?.length_m ?? room?.length ?? room?.room_length);
  const heightM = finite(room?.heightM ?? room?.height_m ?? room?.height ?? room?.room_height);
  return widthM > 0 && lengthM > 0 && heightM > 0 ? { widthM, lengthM, heightM } : null;
}

export function canonicalizeListenerPosition(listener, fallbackId = null) {
  const position = listener?.position ?? listener;
  const x = finite(position?.x ?? position?.x_m);
  const y = finite(position?.y ?? position?.y_m);
  if (x === null || y === null) return null;
  const z = finite(position?.z ?? position?.z_m);
  return { ...listener, id: listener?.id ?? fallbackId, x, y, z: z ?? 1.2, position: undefined };
}

export function canonicalizeSeatingPositions(seats) {
  return (Array.isArray(seats) ? seats : [])
    .map((seat, index) => canonicalizeListenerPosition(seat, `seat-${index + 1}`))
    .filter(Boolean);
}

export function canonicalizeNormalizedRoomInputs({ roomDims, seatingPositions, rspPosition }) {
  return {
    roomDims: canonicalizeRoomDims(roomDims),
    seatingPositions: canonicalizeSeatingPositions(seatingPositions),
    rspPosition: canonicalizeListenerPosition(rspPosition, "rsp"),
  };
}