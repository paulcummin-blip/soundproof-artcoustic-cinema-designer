// Deterministic client meaning, attached to frozen rows, never written by AI.
export default function comparisonClientMeaning(row) {
  if (row.identical) return 'Both options retain the same assessed result or specification.';
  const meanings = {
    p12: 'Screen output capability supports front-stage headroom and scale during demanding scenes.',
    p13: 'Surround and overhead output capability helps the immersive field keep pace with the screen stage.',
    p14: 'Bass output capability supports impact and headroom; this does not establish seat-to-seat consistency.',
    p2: 'Discrete channel capability describes the available physical sound positions.',
    p16: 'Screen timbre describes assessed tonal consistency across the front stage.',
    p17: 'A lower achieved level is a real trade-off in surround and overhead tonal consistency, even when output capability is higher.',
    p18: 'The assessed low-frequency limit describes bass depth, not output or seat consistency.',
    p19: 'Response versus target describes bass balance at the reference seating position only.',
    p20: 'Assessed seat-to-seat variation is disclosed separately from bass output.',
    subwoofers: 'The count and model change the bass specification; output authority is compared in P14, not inferred seat consistency.',
    lcr: 'The screen-speaker specification sets front-stage capability; assessed output is compared in P12.',
    surrounds: 'These speakers carry effects around the listening area; assessed output is compared in P13.',
    overheads: 'These speakers carry the height layer; assessed output is compared in P13.',
  };
  return meanings[row.key] || 'Read each option’s assessed value or specification; a difference is not automatically an improvement.';
}