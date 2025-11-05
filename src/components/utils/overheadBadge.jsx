export const safeArr = (x) => (Array.isArray(x) ? x : []);
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export function safeComputeBadge(args, computeOverheadBadge) {
  try {
    const badge = computeOverheadBadge({
      speakersBase: safeArr(args.speakersBase),
      seats: safeArr(args.seats),
      room: args.room ?? { yMin: 0, yMax: 6 },
      roomHeight: isNum(args.roomHeight) ? args.roomHeight : 2.4,
      rowTarget: args.rowTarget ?? "front",
      overheadCount: isNum(args.overheadCount) ? args.overheadCount : 0,
      offsetM: isNum(args.offsetM) ? args.offsetM : 0
    });
    return {
      overallLevel: Number(badge?.overallLevel) || 1,
      perParam: badge?.perParam || { 9:1, 10:1, 11:1, 13:1 },
      speakersProjected: safeArr(badge?.speakersProjected)
    };
  } catch(e) {
    console.warn("safeComputeBadge failed:", e);
    return { overallLevel: 1, perParam: { 9:1, 10:1, 11:1, 13:1 }, speakersProjected: safeArr(args.speakersBase) };
  }
}