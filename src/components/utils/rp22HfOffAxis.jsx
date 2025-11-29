// rp22HfOffAxis.js
// RP22 P16 implementation: off-axis HF attenuation helpers

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// LCR roles only for P16
const LCR_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);

// Horizontal off-axis from speaker → seat
function horizontalOffAxisDeg(speakerPos, seatPos) {
  if (!speakerPos || !seatPos) return null;
  if (!isNum(speakerPos.x) || !isNum(speakerPos.y)) return null;
  if (!isNum(seatPos.x) || !isNum(seatPos.y)) return null;

  const dx = seatPos.x - speakerPos.x; // lateral
  const dy = seatPos.y - speakerPos.y; // forward (into room)

  if (dx === 0 && dy === 0) return 0;
  const deg = Math.atan2(dx, dy) * 180 / Math.PI;
  return Math.abs(deg);
}

// Convert off-axis angle → predicted HF loss (dB)
function hfLoss(angleDeg, horiz3dB) {
  if (!isNum(angleDeg) || !isNum(horiz3dB)) return null;

  if (angleDeg <= horiz3dB) return 1.5;
  if (angleDeg <= horiz3dB + 10) return 3.0;
  return 6.0; // clearly >5 → FAIL
}

// Map predicted loss → RP22 P16 level
function classifyP16(lossDb) {
  if (!isNum(lossDb)) return { level: null, fail: true };

  if (lossDb > 5) return { level: "FAIL", fail: true };
  if (lossDb > 3) return { level: 1, fail: false };
  if (lossDb > 1.5) return { level: 2, fail: false };
  return { level: 4, fail: false };
}

export function computeP16ForSeat(seat, allSpeakers, getSpeakerMeta) {
  if (!seat || !allSpeakers) return null;
  if (!isNum(seat.x) || !isNum(seat.y)) return null;

  // Get valid LCR speakers
  const lcr = allSpeakers.filter(spk => {
    const r = String(spk.role || "").toUpperCase();
    return (
      LCR_ROLES.has(r) &&
      spk.position &&
      isNum(spk.position.x) &&
      isNum(spk.position.y)
    );
  });

  if (lcr.length === 0) return null;

  let worstLoss = 0;
  let worstRole = null;

  for (const spk of lcr) {
    const role = String(spk.role || "").toUpperCase();
    const meta = spk.model ? getSpeakerMeta(spk.model) : null;
    const horiz3dB = meta?.hfOffAxis16k?.minus3deg ?? 30;

    const angle = horizontalOffAxisDeg(spk.position, seat);
    const loss = hfLoss(angle, horiz3dB);
    if (!isNum(loss)) continue;

    if (loss > worstLoss) {
      worstLoss = loss;
      worstRole = role;
    }
  }

  if (!worstRole) return null;

  const result = classifyP16(worstLoss);

  return {
    valueDb: worstLoss,
    formatted: `±${worstLoss.toFixed(1)} dB`,
    hudLabel: `${worstRole} ±${worstLoss.toFixed(1)} dB`,
    level: result.level,
    fail: result.fail,
  };
}