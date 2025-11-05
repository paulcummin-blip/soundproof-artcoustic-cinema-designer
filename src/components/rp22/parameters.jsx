// RP22 Parameters - Official SMPTE RP22 specification (exact titles and thresholds)
export const RP22_PARAMS = [
  {
    id: "param01",
    title: "1. Minimum distance between the listening area and the room walls (dsw, dbw)",
    short: "This parameter helps avoid speakers being too loud for some and too quiet for others, whilst simultaneously minimizing wall boundary interference.",
    unit: "m",
    thresholds: { L4: 1.5, L3: 1.2, L2: 0.8, L1: 0.5, direction: ">" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[1]?.value ?? null
  },
  {
    id: "param02", 
    title: "2. Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers",
    short: "Includes all listener-level and upper discrete processor outputs, though there are multiple combinations of speaker locations possible therein.",
    unit: "speakers",
    thresholds: { L4: 15, L3: 15, L2: 11, L1: 5, direction: ">=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[2]?.value ?? null
  },
  {
    id: "param03",
    title: "3. Number of screen wall speakers allowed outside of recommended zonal locations",
    short: "Speaker locations are not strict angle numbers. They are zones/areas resulting from multiple trade-offs and defining acceptable possible locations.",
    unit: "speakers", 
    thresholds: { L4: 0, L3: 0, L2: 0, L1: 0, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[3]?.value ?? null
  },
  {
    id: "param04",
    title: "4. Maximum SPL difference between screen wall speakers",
    short: "Normalised to RSP (where levels will be set to have a 0dB variation). Individually for every seat, the maximum predicted SPL difference between any two screen wall speakers.",
    unit: "dB",
    thresholds: { L4: 2, L3: 4, L2: 5, L1: 6, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[4]?.value ?? null
  },
  {
    id: "param05",
    title: "5. Maximum allowable horizontal angle between adjacent surround speakers",
    short: "To ensure that sound movement is smooth and localization is accurate, this metric specifies the maximum horizontal angle between adjacent surround speakers at the seating location.",
    unit: "°",
    thresholds: { L4: 50, L3: 60, L2: 80, L1: null, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[5]?.value ?? null
  },
  {
    id: "param06", 
    title: "6. Maximum SPL difference between surround speakers",
    short: "Normalized to RSP (where levels will be set to have a 0dB variation). Individually for every seat, the maximum predicted SPL difference between any two listener-level surround speakers.",
    unit: "dB",
    thresholds: { L4: 2, L3: 4, L2: 6, L1: 10, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[6]?.value ?? null
  },
  {
    id: "param07",
    title: "7. Wide speakers (If implemented) maximum allowable horizontal deviation from median angle", 
    short: "To ensure localization accuracy, this metric is the maximum horizontal angular deviation allowed from the ideal median angular location for wide front speakers.",
    unit: "°",
    thresholds: { L4: 2, L3: 5, L2: 7, L1: 10, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[7]?.value ?? null
  },
  {
    id: "param08",
    title: "8. Upfiring/elevation speakers allowed?",
    short: "Absent the ability to install top (overhead) speakers, one solution is to employ upfiring/elevation speakers aimed at a reflective ceiling surface.", 
    unit: "Yes/No",
    thresholds: { L4: "No", L3: "No", L2: "Yes", L1: "Yes", direction: "=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[8]?.value ?? null
  },
  {
    id: "param09",
    title: "9. Maximum allowable vertical angle between adjacent (L/R rows of) upper speakers",
    short: "To ensure that sound movement is smooth, and localization is accurate, this metric specifies the maximum vertical angle between adjacent upper speakers at the seating location.",
    unit: "°", 
    thresholds: { L4: 50, L3: 60, L2: 80, L1: 80.1, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[9]?.value ?? null
  },
  {
    id: "param10",
    title: "10. Maximum SPL difference between upper speakers",
    short: "Normalized to RSP (where levels will be set to have a 0 dB variation). Individually for every seat, the maximum predicted SPL difference between any two height/upper speakers.",
    unit: "dB",
    thresholds: { L4: 2, L3: 5, L2: 8, L1: 12, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[10]?.value ?? null
  },
  {
    id: "param11", 
    title: "11. Number of surround/wide/upper speakers allowed outside of zonal recommendation locations",
    short: "Speaker locations are not strict angle numbers; they are designated zones/areas for speaker groups resulting from multiple trade-offs.",
    unit: "speakers",
    thresholds: { L4: 0, L3: 0, L2: 0, L1: null, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[11]?.value ?? null
  },
  {
    id: "param12",
    title: "12. Screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping",
    short: "Sound Pressure Level at the Reference Seating Position is the recommended minimum long term SPL according to AES75-2022 or ANSI-CTA-2034-A, Section 8.",
    unit: "dB SPL (C)", 
    thresholds: { L4: 111, L3: 108, L2: 105, L1: 102, direction: ">=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[12]?.value ?? null
  },
  {
    id: "param13",
    title: "13. Non-screen speakers SPL capability at RSP (Post calibration EQ within assigned bandwidth) without clipping (includes amplifier headroom)",
    short: "Sound Pressure Level at the Reference Seating Position is the recommended minimum long term SPL according to AES75-2022 or ANSI-CTA-2034-A, Section 8.",
    unit: "dB SPL (C)",
    thresholds: { L4: 108, L3: 105, L2: 102, L1: 99, direction: ">=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[13]?.value ?? null
  },
  {
    id: "param14",
    title: "14. LFE frequencies total SPL capability at RSP, plus bass management if used (post calibration EQ, within bass extension spec for the level) without clipping (includes amplifier headroom)",
    short: "Total system SPL capability at LFE frequencies for speakers and/or subwoofers. Can include room/boundary gain and gain resulting from summing multiple speakers/subwoofers acting as one virtual subwoofer.",
    unit: "dB SPL (C)",
    thresholds: { L4: 123, L3: 120, L2: 117, L1: 114, direction: ">=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[14]?.value ?? null
  },
  {
    id: "param15",
    title: "15. Background noise floor with all AV equipment and mechanical systems and building services switched on, at nominal operating temperatures",
    short: "Noise floor indicates the level of general noise in the background — that which is discernible with all systems running (including HVAC) during regular operation of the entertainment space but while no multimedia content is being played.",
    unit: "NCB rating",
    thresholds: { L4: 15, L3: 18, L2: 22, L1: 26, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[15]?.value ?? null
  },
  {
    id: "param16",
    title: "16. Seat-to-seat frequency response variance across all screen wall speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)",
    short: "Predicts how similar the experience and performance level will be across multiple seats. Design prediction should consider correct speaker alignment, off-axis frequency response on both the horizontal & vertical axes, and the effect of the room.",
    unit: "± dB",
    thresholds: { L4: 1.5, L3: 1.5, L2: 3, L1: 5, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[16]?.value ?? null
  },
  {
    id: "param17",
    title: "17. Seat-to-seat frequency response variance across all wide/surround/upper speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)",
    short: "Predicts how similar the experience and performance level will be across multiple seats. Design prediction should consider correct speaker alignment, off-axis frequency response on both the horizontal & vertical axis, and the effect of the room.",
    unit: "± dB",
    thresholds: { L4: 1.5, L3: 3, L2: null, L1: null, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[17]?.value ?? null
  },
  {
    id: "param18",
    title: "18. In-room bass extension -3 dB cut off frequency point",
    short: "In-room predicted -3dB bass extension frequency with no perceptible distortion or audible mechanical resonances (e.g., rattles) at the specified minimum SPL according to performance parameter 14.",
    unit: "Hz",
    thresholds: { L4: 15, L3: 18, L2: 25, L1: 30, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[18]?.value ?? null
  },
  {
    id: "param19",
    title: "19. Frequency response below the room's transition frequency at the RSP relative to target curve (1/3 octave smoothing). \"The Result\"",
    short: "Predicts a smooth frequency response at the RSP, relative to a pre-determined target curve.",
    unit: "± dB",
    thresholds: { L4: 2, L3: 3, L2: 4, L1: 5, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[19]?.value ?? null
  },
  {
    id: "param20",
    title: "20. Seat-to-seat frequency response relative to measured RSP response below the room's transition frequency per seat (1/3 octave smoothing). \"The Consistency\"",
    short: "Predicts how similar the experience and performance level will be across multiple seats.",
    unit: "± dB",
    thresholds: { L4: 2, L3: 3, L2: 4, L1: null, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[20]?.value ?? null
  },
  {
    id: "param21",
    title: "21. Level of early reflections relative to direct sound (0-15 ms, 1-8 kHz)",
    short: "Management of early reflections ensures an optimum balance of direct and reflected sound.",
    unit: "dB",
    thresholds: { L4: -12, L3: -10, L2: -8, L1: null, direction: "<=" },
    valueFromAnalysis: (ar) => ar?.gradedParameters?.primary?.[21]?.value ?? null
  }
];

// Helper to determine level from value and thresholds
export function levelFor(value, thresholds) {
  if (value == null || !thresholds) return 0;
  
  const { direction, L4, L3, L2, L1 } = thresholds;
  
  // Handle special cases for Yes/No parameters
  if (direction === "=" && typeof value === "string") {
    if (value === L4) return 4;
    if (value === L3) return 3;
    if (value === L2) return 2;
    if (value === L1) return 1;
    return 0;
  }
  
  // Handle numeric thresholds
  const pass = (threshold) => {
    if (threshold === null) return false;
    if (direction === ">=" || direction === ">") return value >= threshold;
    if (direction === "<=" || direction === "<") return value <= threshold;
    return false;
  };
  
  if (L4 !== null && pass(L4)) return 4;
  if (L3 !== null && pass(L3)) return 3;
  if (L2 !== null && pass(L2)) return 2;
  if (L1 !== null && pass(L1)) return 1;
  return 0;
}