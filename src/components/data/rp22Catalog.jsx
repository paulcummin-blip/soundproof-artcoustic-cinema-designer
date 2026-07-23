// components/data/rp22Catalog.js
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((prop) => deepFreeze(obj[prop]));
  }
  return obj;
}

export const rp22Zones = [
  { id: "Front L", label: "Front L" },
  { id: "Front R", label: "Front R" },
  { id: "Front Wide", label: "Front Wide" },
  { id: "Side Surround", label: "Side Surround" },
  { id: "Rear Surround", label: "Rear Surround" },
];

export const RP22_CATALOG = deepFreeze({
  "1": {
    number: 1,
    title: "Minimum distance between the listening area and the room walls (dsw, dbw)",
    metric: "Distance to nearest wall from each listener head center",
    unit: "m",
    scope: "Per seat",
    direction: "min",
    levels: { L1: 0.5, L2: 0.8, L3: 1.2, L4: 1.5 },
    notes:
      "This parameter helps avoid speakers being too loud for some and too quiet for others, whilst simultaneously minimizing wall boundary interference. Design prediction requires measuring from the proposed center of each listener’s head to the nearest boundary wall or protruding speaker baffle."
  },
  "2": {
    number: 2,
    title: "Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers",
    metric: "Number of discrete speakers",
    unit: "count",
    scope: "Room",
    direction: "min",
    levels: { L1: 5, L2: 11, L3: 15, L4: 15 },
    notes:
      "Includes all listener-level and upper discrete processor outputs, though there are multiple combinations of speaker locations possible therein, depending on the room design and characteristics."
  },
  "3": {
    number: 3,
    title: "Number of screen wall speakers allowed outside of recommended zonal locations",
    metric: "Number speakers",
    unit: "count",
    scope: "Room",
    direction: "allowed",
    levels: { L1: 0, L2: 0, L3: 0, L4: 0 },
    notes:
      "Speaker locations are not strict angle numbers. They are zones/areas resulting from multiple trade-offs and defining acceptable possible locations for a given screen wall speaker. Defined zones are wide enough to allow some flexibility in speaker locations within the recommended zone."
  },
  "4": {
    number: 4,
    title: "Maximum SPL difference between screen wall speakers",
    metric: "SPL difference (screen wall)",
    unit: "dB",
    scope: "Seat",
    direction: "max",
    levels: { L1: 6, L2: 5, L3: 4, L4: 2 },
    notes:
      "Normalised to RSP (where levels will be set to have a 0dB variation). Individually for every seat, the maximum predicted SPL difference (using anechoic propagation loss) between any two screen wall speakers."
  },
  "5": {
    number: 5,
    title: "Maximum allowable horizontal angle between adjacent surround speakers",
    metric: "Horizontal angle between adjacent surrounds",
    unit: "deg",
    scope: "Seat",
    direction: "max",
    levels: { L1: null, L2: 80, L3: 60, L4: 50 },
    notes:
      "To ensure that sound movement is smooth and localization is accurate, this metric specifies the maximum horizontal angle between adjacent surround speakers at the seating location."
  },
  "6": {
    number: 6,
    title: "Maximum SPL difference between surround speakers",
    metric: "SPL difference (surrounds)",
    unit: "dB",
    scope: "Seat",
    direction: "max",
    levels: { L1: 10, L2: 6, L3: 4, L4: 2 },
    notes:
      "Normalized to RSP (where levels will be set to have a 0dB variation). Individually for every seat, the maximum predicted SPL difference (using anechoic propagation loss) between any two listener-level surround speakers."
  },
  "7": {
    number: 7,
    title: "Wide speakers (If implemented) maximum allowable horizontal deviation from median angle",
    metric: "Horizontal deviation from bisector",
    unit: "deg (±)",
    scope: "Room",
    direction: "±max",
    levels: { L1: 10, L2: 7, L3: 5, L4: 2 },
    notes:
      "To ensure localization accuracy, this metric is the maximum horizontal angular deviation allowed from the ideal median angular location for wide front speakers."
  },
  "8": {
    number: 8,
    title: "Upfiring/elevation speakers allowed?",
    metric: "Allowance",
    unit: "yes/no",
    scope: "-",
    direction: "boolean",
    levels: { L1: "Yes", L2: "Yes", L3: "No", L4: "No" },
    notes:
      "Absent the ability to install top (overhead) speakers, one solution is to employ upfiring/elevation (e.g., \"Atmos Enabled\") speakers aimed at a reflective ceiling surface to reproduce immersive content and audio objects. These speakers should have a suitable mechanical and electrical design."
  },
  "9": {
    number: 9,
    title: "Maximum allowable vertical angle between adjacent (L/R rows of) upper speakers",
    metric: "Vertical angle between adjacent uppers",
    unit: "deg",
    scope: "Seat",
    direction: "max",
    levels: { L1: 80.1, L2: 80, L3: 60, L4: 50 },
    notes:
      "To ensure that sound movement is smooth, and localization is accurate, this metric specifies the maximum vertical angle between adjacent upper speakers at the seating location. Excludes top middle center (\"Voice of God\") and height center speakers."
  },
  "10": {
    number: 10,
    title: "Maximum SPL difference between upper speakers",
    metric: "SPL difference (uppers)",
    unit: "dB",
    scope: "Seat",
    direction: "max",
    levels: { L1: 12, L2: 8, L3: 5, L4: 2 },
    notes:
      "Normalized to RSP (where levels will be set to have a 0 dB variation). Individually for every seat, the maximum predicted SPL difference (using anechoic propagation loss) between any two height/upper speakers."
  },
  "11": {
    number: 11,
    title: "Number of surround/wide/upper speakers allowed outside of zonal recommendation locations",
    metric: "Number speakers",
    unit: "count",
    scope: "Room",
    direction: "allowed",
    levels: { L1: null, L2: 0, L3: 0, L4: 0 },
    notes:
      "Speaker locations are not strict angle numbers; they are designated zones/areas for speaker groups resulting from multiple trade-offs. Zones are broad enough to allow some flexibility in speaker locations."
  },
  "12": {
    number: 12,
    title: "Screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping",
    metric: "Long-term SPL capability at RSP (screen)",
    unit: "dB SPL (C)",
    scope: "Room",
    direction: "min",
    levels: { L1: 102, L2: 105, L3: 108, L4: 111 },
    notes:
      "Sound Pressure Level at the Reference Seating Position is the recommended minimum long term SPL according to AES75-2022 or ANSI-CTA-2034-A, Section 8. Consideration: (1) extra LF capability for bass contours, (2) extra capability for +EQ."
  },
  "13": {
    number: 13,
    title: "Non-screen speakers SPL capability at RSP (Post calibration EQ within assigned bandwidth) without clipping (includes amplifier headroom)",
    metric: "Long-term SPL capability at RSP (non-screen)",
    unit: "dB SPL (C)",
    scope: "Room",
    direction: "min",
    levels: { L1: 99, L2: 102, L3: 105, L4: 108 },
    notes:
      "Sound Pressure Level at the Reference Seating Position is the recommended minimum long term SPL according to AES75-2022 or ANSI-CTA-2034-A, Section 8. Consideration: (1) extra LF capability for bass contours, (2) extra capability for +EQ."
  },
  "14": {
    number: 14,
    title: "LFE frequencies total SPL capability at RSP, plus bass management if used (post calibration EQ, within bass extension spec for the level) without clipping (includes amplifier headroom)",
    metric: "Estimated LFE Capability",
    unit: "dB SPL (C)",
    scope: "Room",
    direction: "min",
    levels: { L1: 114, L2: 117, L3: 120, L4: 123 },
    notes:
      "Total system SPL capability at LFE frequencies for speakers and/or subwoofers. Can include room/boundary gain and summation from multiple sources acting as one virtual subwoofer."
  },
  "15": {
    number: 15,
    title: "Background noise floor with all AV equipment and mechanical systems and building services switched on, at nominal operating temperatures",
    metric: "Noise floor",
    unit: "NCB rating (Rec.)",
    scope: "Room",
    direction: "max",
    levels: { L1: 26, L2: 22, L3: 18, L4: 15 },
    notes:
      "Noise floor indicates the level of general noise in the background with all systems running during regular operation of the space while no content is playing."
  },
  "16": {
    number: 16,
    title: "Seat-to-seat frequency response variance across all screen wall speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)",
    metric: "Seat-to-seat FR variance (screen)",
    unit: "± dB",
    scope: "Seat",
    direction: "±max",
    levels: { L1: 5, L2: 3, L3: 1.5, L4: 1.5 },
    notes:
      "Predicts similarity of experience across seats; consider alignment, off-axis response (H/V), and room effects."
  },
  "17": {
    number: 17,
    title: "Seat-to-seat frequency response variance across all wide/surround/upper speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)",
    metric: "Seat-to-seat FR variance (wide/surround/upper)",
    unit: "± dB",
    scope: "Seat",
    direction: "±max",
    levels: { L1: null, L2: null, L3: 3, L4: 1.5 },
    notes:
      "Predicts similarity of experience across seats; consider alignment, off-axis response (H/V), and room effects."
  },
  "18": {
    number: 18,
    title: "In-room bass extension -3 dB cut off frequency point",
    metric: "Bass extension (-3 dB)",
    unit: "Hz",
    scope: "Room",
    direction: "min (lower is better)",
    levels: { L1: 30, L2: 25, L3: 18, L4: 15 },
    notes:
      "In-room predicted -3dB bass extension with no perceptible distortion or resonances at the specified SPL of Parameter 14. Includes coupling, boundary and room gain."
  },
  "19": {
    number: 19,
    title: "Frequency response below the room's transition frequency at the RSP relative to target curve (1/3 octave smoothing). \"The Result\"",
    metric: "FR vs target below transition (RSP)",
    unit: "± dB",
    scope: "Seat",
    direction: "±max",
    levels: { L1: 5, L2: 4, L3: 3, L4: 2 },
    notes:
      "Predicts a smooth response at the RSP, relative to a predetermined target curve."
  },
  "20": {
    number: 20,
    title: "Seat-to-seat frequency response relative to measured RSP response below the room's transition frequency per seat (1/3 octave smoothing). \"The Consistency\"",
    metric: "Seat-to-seat FR vs RSP below transition",
    unit: "± dB",
    scope: "Seat",
    direction: "±max",
    levels: { L1: null, L2: 4, L3: 3, L4: 2 },
    notes:
      "Predicts similarity of the experience and performance across seats."
  },
  "21": {
    number: 21,
    title: "Level of early reflections relative to direct sound (0-15 ms, 1-8 kHz)",
    metric: "Early reflections relative to direct",
    unit: "dB (min)",
    scope: "Room",
    direction: "min",
    levels: { L1: null, L2: -8, L3: -10, L4: -12 },
    notes:
      "Management of early reflections ensures an optimum balance of direct and reflected sound."
  }
});

export function getRP22Param(n) {
  const key = String(n);
  const p = RP22_CATALOG[key];
  if (!p) throw new Error(`RP22 parameter not found: ${n}`);
  return p;
}

export { deepFreeze };