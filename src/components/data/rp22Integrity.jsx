import { RP22_CATALOG } from "./rp22Catalog";

export function assertRP22Integrity() {
  const signature = Object.keys(RP22_CATALOG)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => `${RP22_CATALOG[k].number}:${RP22_CATALOG[k].title}`)
    .join("|");

  // Reference signature — DO NOT CHANGE
  const REF =
"1:Minimum distance between the listening area and the room walls (dsw, dbw)|2:Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers|3:Number of screen wall speakers allowed outside of recommended zonal locations|4:Maximum SPL difference between screen wall speakers|5:Maximum allowable horizontal angle between adjacent surround speakers|6:Maximum SPL difference between surround speakers|7:Wide speakers (If implemented) maximum allowable horizontal deviation from median angle|8:Upfiring/elevation speakers allowed?|9:Maximum allowable vertical angle between adjacent (L/R rows of) upper speakers|10:Maximum SPL difference between upper speakers|11:Number of surround/wide/upper speakers allowed outside of zonal recommendation locations|12:Screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping|13:Non-screen speakers SPL capability at RSP (Post calibration EQ within assigned bandwidth) without clipping (includes amplifier headroom)|14:LFE frequencies total SPL capability at RSP, plus bass management if used (post calibration EQ, within bass extension spec for the level) without clipping (includes amplifier headroom)|15:Background noise floor with all AV equipment and mechanical systems and building services switched on, at nominal operating temperatures|16:Seat-to-seat frequency response variance across all screen wall speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)|17:Seat-to-seat frequency response variance across all wide/surround/upper speakers normalised to measured RSP response between 500 Hz and 16 kHz (1 octave smoothing)|18:In-room bass extension -3 dB cut off frequency point|19:Frequency response below the room's transition frequency at the RSP relative to target curve (1/3 octave smoothing). \"The Result\"|20:Seat-to-seat frequency response relative to measured RSP response below the room's transition frequency per seat (1/3 octave smoothing). \"The Consistency\"|21:Level of early reflections relative to direct sound (0-15 ms, 1-8 kHz)";

  if (signature !== REF) {
    throw new Error("RP22 catalog integrity mismatch: numbers/titles differ from the canonical spec.");
  }
  return "RP22_OK";
}