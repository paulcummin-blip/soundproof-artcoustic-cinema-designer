// RP22 Parameter Canonical Definitions
// Source: CEDIA RP22 - Room Acoustics & Design Guide

export const RP22_DEFINITIONS = {
  P1: {
    title: "1. Minimum distance between the listening area and the room walls (dsw, dbw)",
    description: "This parameter helps avoid speakers being too loud for some and too quiet for others, whilst simultaneously minimizing wall boundary interference. Design prediction requires measuring from the proposed center of each listener's head to the nearest boundary wall or protruding speaker baffle.",
    thresholds: [
      { level: 1, criteria: ">0.5m" },
      { level: 2, criteria: ">0.8m" },
      { level: 3, criteria: ">1.2m" },
      { level: 4, criteria: ">1.5m" }
    ],
    scope: "Per seat"
  },
  
  P4: {
    title: "4. Maximum measured in-situ SPL difference between screen speakers",
    description: "This parameter ensures uniform presentation across the screen. It measures the maximum SPL difference between any two screen speakers (L, C, R) at the reference listening position.",
    thresholds: [
      { level: 1, criteria: "≤6 dB" },
      { level: 2, criteria: "≤4 dB" },
      { level: 3, criteria: "≤3 dB" },
      { level: 4, criteria: "≤2 dB" }
    ],
    scope: "At RSP"
  },
  
  P5: {
    title: "5. Maximum horizontal spacing between adjacent surround speakers",
    description: "This parameter ensures adequate surround field coverage. It measures the maximum horizontal angular gap between adjacent surround speakers as viewed from each listening position.",
    thresholds: [
      { level: 1, criteria: ">80.05°" },
      { level: 2, criteria: "≤80°" },
      { level: 3, criteria: "≤60°" },
      { level: 4, criteria: "≤50°" }
    ],
    scope: "Per seat"
  },
  
  P6: {
    title: "6. Maximum measured in-situ SPL difference between surround speakers",
    description: "This parameter ensures uniform surround presentation. It measures the maximum SPL difference between any two surround speakers at each listening position.",
    thresholds: [
      { level: 1, criteria: "≤10 dB" },
      { level: 2, criteria: "≤6 dB" },
      { level: 3, criteria: "≤4 dB" },
      { level: 4, criteria: "≤2 dB" }
    ],
    scope: "Per seat"
  },
  
  P9: {
    title: "9. Vertical viewing angle to top of image",
    description: "This parameter ensures comfortable neck posture and optimal image perception. It measures the vertical angle from the listener's eye position to the top edge of the visible image.",
    thresholds: [
      { level: 1, criteria: "≤35°" },
      { level: 2, criteria: "≤30°" },
      { level: 3, criteria: "≤25°" },
      { level: 4, criteria: "≤20°" }
    ],
    scope: "Per seat"
  },
  
  P10: {
    title: "10. Maximum measured in-situ SPL difference between upper speakers",
    description: "This parameter ensures uniform overhead presentation. It measures the maximum SPL difference between any two overhead/height speakers at each listening position.",
    thresholds: [
      { level: 1, criteria: "≤8 dB" },
      { level: 2, criteria: "≤8 dB" },
      { level: 3, criteria: "≤5 dB" },
      { level: 4, criteria: "≤2 dB" }
    ],
    scope: "Per seat"
  },
  
  P16: {
    title: "16. Seat-to-seat frequency response variance across all screen wall speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)",
    description: "Predicts how similar the experience and performance level will be across multiple seats. Design prediction should consider correct speaker alignment, off-axis frequency response on both the horizontal & vertical axes, and the effect of the room.",
    thresholds: [
      { level: 1, criteria: "≤ 5 dB" },
      { level: 2, criteria: "≤ 3 dB" },
      { level: 3, criteria: "≤ 1.5 dB" },
      { level: 4, criteria: "≤ 1.5 dB" }
    ],
    scope: "Normalised to measured RSP response (500 Hz–16 kHz, 1 octave smoothing)"
  },
  
  P17: {
    title: "17. Seat-to-seat frequency response variance across all wide/surround/upper speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)",
    description: "Predicts how similar the experience and performance level will be across multiple seats. Design prediction should consider correct speaker alignment, off-axis frequency response on both the horizontal & vertical axis, and the effect of the room.",
    thresholds: [
      { level: 1, criteria: "N/A" },
      { level: 2, criteria: "N/A" },
      { level: 3, criteria: "≤ ±3 dB (Max.)" },
      { level: 4, criteria: "≤ ±1.5 dB (Max.)" }
    ],
    scope: "Normalised to measured RSP response (500 Hz–16 kHz, 1 octave smoothing)",
    unit: "± dB"
  },
  
  P20: {
    title: "20. Low frequency SPL capability at RSP",
    description: "This parameter measures the maximum continuous SPL that the bass management system can deliver at the reference listening position, post-calibration EQ, in the 30-80 Hz band, without exceeding excursion or thermal limits.",
    thresholds: [
      { level: 1, criteria: "≥105 dB SPL(C)" },
      { level: 2, criteria: "≥108 dB SPL(C)" },
      { level: 3, criteria: "≥111 dB SPL(C)" },
      { level: 4, criteria: "≥114 dB SPL(C)" }
    ],
    scope: "At RSP"
  }
};

export function getRP22Definition(parameterKey) {
  const key = String(parameterKey).toUpperCase();
  return RP22_DEFINITIONS[key] || null;
}