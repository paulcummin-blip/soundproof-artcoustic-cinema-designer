// /src/core/rp22/rp22Parameters.js
// RP22 Parameters — Official CEDIA definitions
// DO NOT EDIT. Numbers, names, descriptions, and thresholds are locked.

const RAW = [
  {
    id: 1,
    number: 1,
    name: "Minimum distance between the listening area and the room walls (dsw, dbw)",
    description: "Avoids SPL imbalance and wall boundary interference. Measured from the listener’s head centre to the nearest wall or protruding baffle.",
    unit: "m",
    thresholds: { L1: 0.5, L2: 0.8, L3: 1.2, L4: 1.5 },
    metric: "Min.",
    scope: "Seat"
  },
  {
    id: 2,
    number: 2,
    name: "Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers",
    description: "Includes all listener-level and upper discrete processor outputs; multiple combinations possible depending on design.",
    unit: "Number discrete speakers",
    thresholds: { L1: 5, L2: 11, L3: 15, L4: 15 },
    metric: "Min.",
    scope: "Room"
  },
  {
    id: 3,
    number: 3,
    name: "Number of screen wall speakers allowed outside of recommended zonal locations",
    description: "Speaker locations are zones, not strict angles. Zones allow flexibility within recommended areas.",
    unit: "Number speakers",
    thresholds: { L1: 0, L2: 0, L3: 0, L4: 0 },
    metric: "-",
    scope: "Room"
  },
  {
    id: 4,
    number: 4,
    name: "Maximum SPL difference between screen wall speakers",
    description: "Normalised to RSP (0dB ref). Max predicted SPL diff using anechoic propagation loss.",
    unit: "dB",
    thresholds: { L1: 6, L2: 5, L3: 4, L4: 2 },
    metric: "Max.",
    scope: "Seat"
  },
  {
    id: 5,
    number: 5,
    name: "Maximum allowable horizontal angle between adjacent surround speakers",
    description: "Ensures smooth sound movement and accurate localisation.",
    unit: "Degrees (°)",
    thresholds: { L1: null, L2: 80, L3: 60, L4: 50 },
    metric: "Max.",
    scope: "Seat"
  },
  {
    id: 6,
    number: 6,
    name: "Maximum SPL difference between surround speakers",
    description: "Normalised to RSP (0dB ref).",
    unit: "dB",
    thresholds: { L1: 10, L2: 6, L3: 4, L4: 2 },
    metric: "Max.",
    scope: "Seat"
  },
  {
    id: 7,
    number: 7,
    name: "Wide speakers (if implemented) — maximum allowable horizontal deviation from median angle",
    description: "Ensures localisation accuracy.",
    unit: "Degrees (°)",
    thresholds: { L1: 10, L2: 7, L3: 5, L4: 2 },
    metric: "±",
    scope: "Room"
  },
  {
    id: 8,
    number: 8,
    name: "Upfiring/elevation speakers allowed?",
    description: "Solution for when overhead speakers cannot be installed.",
    unit: "Yes/No",
    thresholds: { L1: "Yes", L2: "Yes", L3: "No", L4: "No" },
    metric: "-",
    scope: "-"
  },
  {
    id: 9,
    number: 9,
    name: "Maximum allowable vertical angle between adjacent (L/R rows of) upper speakers",
    description: "Ensures smooth sound movement and accurate localisation. Excludes 'Voice of God' and height centre.",
    unit: "Degrees (°)",
    thresholds: { L1: 80.1, L2: 80, L3: 60, L4: 50 },
    metric: "Max.",
    scope: "Seat"
  },
  {
    id: 10,
    number: 10,
    name: "Maximum SPL difference between upper speakers",
    description: "Normalised to RSP.",
    unit: "dB",
    thresholds: { L1: 12, L2: 8, L3: 5, L4: 2 },
    metric: "Max.",
    scope: "Seat"
  },
  {
    id: 11,
    number: 11,
    name: "Number of surround/wide/upper speakers allowed outside of zonal recommendation locations",
    description: "Zones allow flexibility but must remain within recommended placement areas.",
    unit: "Number speakers",
    thresholds: { L1: null, L2: 0, L3: 0, L4: 0 },
    metric: "-",
    scope: "Room"
  },
  {
    id: 12,
    number: 12,
    name: "Screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping",
    description: "Min SPL per AES75-2022 or ANSI-CTA-2034-A; includes headroom for bass contours and +EQ.",
    unit: "dB SPL (C)",
    thresholds: { L1: 102, L2: 105, L3: 108, L4: 111 },
    metric: "Min.",
    scope: "Room"
  },
  {
    id: 13,
    number: 13,
    name: "Non-screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping",
    description: "Includes amplifier headroom; same SPL spec logic as parameter 12.",
    unit: "dB SPL (C)",
    thresholds: { L1: 99, L2: 102, L3: 105, L4: 108 },
    metric: "Min.",
    scope: "Room"
  },
  {
    id: 14,
    number: 14,
    name: "LFE frequencies total SPL capability at RSP, plus bass management if used (post calibration EQ, within bass extension spec for the level) without clipping (includes amplifier headroom)",
    description: "Post calibration EQ; includes amp headroom; can include boundary gain.",
    unit: "dB SPL (C)",
    thresholds: { L1: 114, L2: 117, L3: 120, L4: 123 },
    metric: "Min.",
    scope: "Room"
  },
  {
    id: 15,
    number: 15,
    name: "Background noise floor",
    description: "With all AV/mechanical systems running at nominal operating temps.",
    unit: "NCB rating",
    thresholds: { L1: 26, L2: 22, L3: 18, L4: 15 },
    metric: "Max.",
    scope: "-"
  },
  {
    id: 16,
    number: 16,
    name: "Seat-to-seat frequency response variance across all screen wall speakers",
    description: "Normalised to RSP between 500 Hz–16 kHz (1 octave smoothing).",
    unit: "± dB",
    thresholds: { L1: 5, L2: 3, L3: 1.5, L4: 1.5 },
    metric: "Max.",
    scope: "Seat"
  },
  {
    id: 17,
    number: 17,
    name: "Seat-to-seat frequency response variance across all wide/surround/upper speakers",
    description: "Normalised to RSP between 500 Hz–16 kHz (1 octave smoothing).",
    unit: "± dB",
    thresholds: { L1: null, L2: null, L3: 3, L4: 1.5 },
    metric: "Max.",
    scope: "Seat"
  },
  {
    id: 18,
    number: 18,
    name: "In-room bass extension -3 dB cut off frequency point",
    description: "In-room predicted -3 dB bass extension frequency with no perceptible distortion or audible mechanical resonances at the specified minimum SPL according to performance parameter 14… To include speaker coupling, boundary and room gain.",
    unit: "Hz",
    thresholds: { L1: 30, L2: 25, L3: 18, L4: 15 },
    metric: "Min.",
    scope: "Room"
  },
  {
    id: 19,
    number: 19,
    name: "Frequency response below room’s transition frequency at RSP (“The Result”)",
    description: "Relative to target curve (1/3 oct smoothing).",
    unit: "± dB",
    thresholds: { L1: 5, L2: 4, L3: 3, L4: 2 },
    metric: "Max.",
    scope: "Room"
  },
  {
    id: 20,
    number: 20,
    name: "Seat-to-seat frequency response below transition frequency (“The Consistency”)",
    description: "Relative to RSP (1/3 oct smoothing).",
    unit: "± dB",
    thresholds: { L1: null, L2: 4, L3: 3, L4: 2 },
    metric: "Max.",
    scope: "Seat"
  },
  {
    id: 21,
    number: 21,
    name: "Level of early reflections relative to direct sound (0–15 ms, 1–8 kHz)",
    description: "Manages early reflections for balance of direct/reflected sound.",
    unit: "dB",
    thresholds: { L1: null, L2: -8, L3: -10, L4: -12 },
    metric: "Min.",
    scope: "Room"
  }
];

function deepFreeze(obj) {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const v = obj[prop];
    if (
      v !== null &&
      (typeof v === "object" || typeof v === "function") &&
      !Object.isFrozen(v)
    ) {
      deepFreeze(v);
    }
  });
  return obj;
}

function validate(params) {
  if (!Array.isArray(params) || params.length !== 21) {
    throw new Error("RP22: parameter array must contain exactly 21 items.");
  }
  const ids = new Set();
  const nums = new Set();
  for (const p of params) {
    if (typeof p.id !== "number" || typeof p.number !== "number") {
      throw new Error("RP22: id/number must be numbers.");
    }
    if (ids.has(p.id) || nums.has(p.number)) {
      throw new Error("RP22: duplicate id or number detected.");
    }
    ids.add(p.id);
    nums.add(p.number);
    ["name", "description", "unit", "metric", "scope"].forEach((k) => {
      if (!p[k]) throw new Error(`RP22: missing field '${k}' on #${p.number}.`);
    });
    if (!p.thresholds || typeof p.thresholds !== "object") {
      throw new Error(`RP22: missing thresholds on #${p.number}.`);
    }
    const keys = Object.keys(p.thresholds);
    if (keys.length > 0 && keys.sort().join(",") !== "L1,L2,L3,L4") {
      // Allow empty threshold objects but validate if not empty
      throw new Error(`RP22: thresholds must be L1..L4 on #${p.number}.`);
    }
  }
}

validate(RAW);

export const rp22Parameters = deepFreeze(RAW);

// Convenience lookups
export const rp22ById = Object.freeze(
  rp22Parameters.reduce((m, p) => ((m[p.id] = p), m), {})
);

export const rp22ByNumber = Object.freeze(
  rp22Parameters.reduce((m, p) => ((m[p.number] = p), m), {})
);

// A short version string if you want to surface it in UI/exports
export const RP22_SPEC_VERSION = "RP22-Canon-v1";