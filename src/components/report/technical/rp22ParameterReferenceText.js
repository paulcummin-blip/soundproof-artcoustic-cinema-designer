/**
 * rp22ParameterReferenceText.js
 * -----------------------------
 * The RP22 parameter wording, reproduced verbatim from the supplied
 * "RP22 Parameters" PDF (source authority). Not paraphrased, shortened or
 * substituted with Sound Proof's internal short labels. Do not edit the strings.
 */
export const RP22_PARAMETER_REFERENCE = [
  {
    category: 'Spatial Resolution',
    range: 'P1–P11',
    parameters: [
      ['P1', 'Minimum distance between the listening area and the room walls (dsw, dbw)'],
      ['P2', 'Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers'],
      ['P3', 'Number of screen wall speakers allowed outside of recommended zonal locations'],
      ['P4', 'Maximum SPL difference between screen wall speakers'],
      ['P5', 'Maximum allowable horizontal angle between adjacent surround speakers'],
      ['P6', 'Maximum SPL difference between surround speakers'],
      ['P7', 'Wide speakers (If implemented) maximum allowable horizontal deviation from median angle'],
      ['P8', 'Upfiring/elevation speakers allowed?'],
      ['P9', 'Maximum allowable vertical angle between adjacent (L/R rows of) upper speakers'],
      ['P10', 'Maximum SPL difference between upper speakers'],
      ['P11', 'Number of surround/wide/upper speakers allowed outside of zonal recommendation locations'],
    ],
  },
  {
    category: 'Dynamic Range',
    range: 'P12–P16',
    parameters: [
      ['P12', 'Screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping'],
      ['P13', 'Non-screen speakers SPL capability at RSP (Post calibration EQ within assigned bandwidth) without clipping (includes amplifier headroom)'],
      ['P14', 'LFE frequencies total SPL capability at RSP, plus bass management if used (post calibration EQ, within bass extension spec for the level) without clipping (includes amplifier headroom)'],
      ['P15', 'Background noise floor with all AV equipment and mechanical systems and building services switched on, at nominal operating temperatures'],
      ['P16', 'Seat-to-seat frequency response variance across all screen wall speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)'],
    ],
  },
  {
    category: 'Timbre Matching',
    range: 'P17–P21',
    parameters: [
      ['P17', 'Seat-to-seat frequency response variance across all wide/surround/upper speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)'],
      ['P18', 'In-room bass extension -3 dB cut off frequency point'],
      ['P19', 'Frequency response below the room\'s transition frequency at the RSP relative to target curve (1/3 octave smoothing). "The Result"'],
      ['P20', 'Seat-to-seat frequency response relative to measured RSP response below the room\'s transition frequency per seat (1/3 octave smoothing). "The Consistency"'],
      ['P21', 'Level of early reflections relative to direct sound (0-15 ms, 1-8 kHz)'],
    ],
  },
];