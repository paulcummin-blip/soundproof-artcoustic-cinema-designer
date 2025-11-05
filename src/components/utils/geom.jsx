export const centerX = (dimsOrRoom) =>
  ((dimsOrRoom?.width ?? dimsOrRoom?.roomWidth ?? 4) / 2);

export function wallAnchorX(side, dims, margin = 0.10) {
    const w = dims?.width ?? 4;
    if (side === 'left') return margin;
    if (side === 'right') return w - margin;
    return w / 2; // centre fallback
}

export function wallAnchorY(side, dims, margin = 0.10) {
    const l = dims?.length ?? 6;
    if (side === 'front') return margin;
    if (side === 'rear') return l - margin;
    return l / 2;
}