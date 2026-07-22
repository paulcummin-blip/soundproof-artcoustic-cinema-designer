export const ROOM_MODE_STYLES = Object.freeze({
  axial: { label: "Axial", color: "#E05A33" },
  tangential: { label: "Tangential", color: "#168C95" },
  oblique: { label: "Oblique", color: "#7C4D9E" },
});

function axisLabel(mode) {
  if (mode.type !== "axial") return null;
  if (mode.nx > 0) return "Width";
  if (mode.ny > 0) return "Length";
  if (mode.nz > 0) return "Height";
  return null;
}

export function buildVisibleRoomModeMarkers({ modes = [], show = false, families = {}, xDomain = [20, 200] } = {}) {
  if (!show) return { axial: [], tangential: [], oblique: [] };
  const grouped = { axial: [], tangential: [], oblique: [] };
  for (const mode of modes) {
    if (!ROOM_MODE_STYLES[mode?.type] || families[mode.type] === false) continue;
    if (!Number.isFinite(mode.freq) || mode.freq < xDomain[0] || mode.freq > xDomain[1]) continue;
    grouped[mode.type].push({
      fHz: mode.freq,
      family: mode.type,
      n: [mode.nx, mode.ny, mode.nz],
      axisLabel: axisLabel(mode),
      order: mode.nx + mode.ny + mode.nz,
    });
  }
  return grouped;
}

export function nearestRoomModes(frequency, modes = [], maximumDistanceHz = 5) {
  return modes
    .filter((mode) => Number.isFinite(mode?.freq) && Math.abs(mode.freq - frequency) <= maximumDistanceHz)
    .sort((left, right) => Math.abs(left.freq - frequency) - Math.abs(right.freq - frequency))
    .slice(0, 3)
    .map((mode) => ({ frequencyHz: mode.freq, type: mode.type, indices: [mode.nx, mode.ny, mode.nz], axis: axisLabel(mode) }));
}