// rp22HfOffAxis.js
// RP22 P16 implementation: off-axis HF attenuation helpers

const LCR_ROLES = new Set(['FL', 'L', 'FC', 'C', 'FR', 'R']);

const normAngle = (deg) => ((deg % 360) + 360) % 360;

const shortestDiff = (a, b) => {
  const da = normAngle(a);
  const db = normAngle(b);
  let diff = Math.abs(da - db);
  if (diff > 180) diff = 360 - diff;
  return diff; // 0..180
};

export function computeP16ForSeat(seat, speakers, getSpeakerModelMeta) {
  if (!seat || !Number.isFinite(seat.x) || !Number.isFinite(seat.y)) {
    return null;
  }

  const lcrSpeakers = Array.isArray(speakers)
    ? speakers.filter((s) => {
        const role = String(s.role || '').toUpperCase();
        return (
          LCR_ROLES.has(role) &&
          s.position &&
          Number.isFinite(s.position.x) &&
          Number.isFinite(s.position.y)
        );
      })
    : [];

  if (!lcrSpeakers.length) return null;

  const debugRows = [];
  let worstLossDb = -Infinity;
  let worstSpeakerRole = null;

  for (const spk of lcrSpeakers) {
    const role = String(spk.role || '').toUpperCase();

    // Vector from speaker → seat in plan view
    const dx = seat.x - spk.position.x;
    const dy = seat.y - spk.position.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;

    // Seat azimuth from the speaker's point of view.
    // Use same convention as elsewhere: 0° = "down the room" (+Y), +ve = to the right.
    const seatAzimuthDeg = (Math.atan2(dx, dy) * 180) / Math.PI; // -180..+180

    // Speaker aim / yaw – 0° means facing straight into the room.
    const aimDeg = Number.isFinite(spk.rotation_deg) ? spk.rotation_deg : 0;

    // Off-axis angle = difference between where the speaker is pointed and where the seat is.
    const offAxisDeg = shortestDiff(seatAzimuthDeg, aimDeg); // 0..180

    // Get HF horizontal 3 dB coverage from model meta
    const meta = spk.model ? getSpeakerModelMeta(spk.model) : null;
    const coverage3dB =
      meta &&
      [meta.hfOffAxis16k?.minus3deg, meta.hfHoriz3dB, meta.hfHoriz_3db, meta.hfHorz3dB, meta.horiz3dB].find(
        (v) => typeof v === 'number' && Number.isFinite(v)
      );

    if (!coverage3dB) {
      // No HF coverage data – skip this speaker for P16
      continue;
    }

    // Convert off-axis angle → predicted dB loss:
    //  • offAxis ≤ coverage3dB   → treat as 1.5 dB
    //  • offAxis ≥ coverage3dB+10 → clamp at 5 dB
    //  • between them → interpolate 3 → 5 dB linearly
    let lossDb;
    if (offAxisDeg <= coverage3dB) {
      lossDb = 1.5;
    } else if (offAxisDeg >= coverage3dB + 10) {
      lossDb = 5;
    } else {
      const t = (offAxisDeg - coverage3dB) / 10; // 0..1
      lossDb = 3 + 2 * t; // 3 → 5 dB
    }

    if (!Number.isFinite(lossDb)) continue;

    const lossRounded = Number(lossDb.toFixed(1));

    // Collect debug row
    debugRows.push({
      role,
      offAxisDeg: Number(offAxisDeg.toFixed(1)),
      coverage3dB: Number(coverage3dB.toFixed(1)),
      lossDb: lossRounded,
    });

    // Track worst (highest) loss
    if (lossRounded > worstLossDb) {
      worstLossDb = lossRounded;
      worstSpeakerRole = role;
    }
  }

  if (!debugRows.length || !Number.isFinite(worstLossDb) || !worstSpeakerRole) {
    return null;
  }

  const loss = Number(worstLossDb.toFixed(1));
  let level = null;

  if (loss > 5) {
    level = null;         // FAIL
  } else if (loss > 3) {
    level = 1;            // 3 < loss ≤ 5
  } else if (loss >= 1.5) {
    level = 2;            // 1.5 ≤ loss ≤ 3
  } else {
    level = 4;            // loss < 1.5
  }

  return {
    value: loss,
    formatted: `±${loss.toFixed(1)} dB`,
    hudLabel: `${worstSpeakerRole} ±${loss.toFixed(1)} dB`,
    level,
    debug: {
      perSpeaker: debugRows,
      worst: { role: worstSpeakerRole, lossDb: loss },
    },
  };
}