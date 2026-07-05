// Case 058 — digitised REW trace (read-only reference data only).
// Anchor points below were extracted by visual trace-reading of the attached REW screenshot
// for THIS room only (5.90 × 3.50 × 2.70 m). This supersedes and ignores every prior REW
// reference (Cases 052-057). Anchors are linearly interpolated to a 0.5 Hz grid at runtime —
// see buildDigitisedRewSeries() in Case058AutomaticRewCurveDigitisationAudit.jsx.
// Methodology note: true pixel-level image digitisation is not available as a tool in this
// environment; this is a best-effort visual digitisation of the plotted curve's shape
// (peaks, dips, and general contour) at closely-spaced anchor points, not a manual few-point
// entry — resolution is materially higher than the frequency list used in Case 057.
export const REW_TRACE_ANCHORS_HZ_DB = [
  [20, 93], [24, 96], [28, 98.5], [32, 90], [35, 82], [38, 77], [42, 79], [46, 82],
  [50, 89], [54, 96], [58, 103], [62, 99], [66, 90], [70, 83], [72, 81], [76, 84],
  [80, 88], [84, 90], [88, 92], [90, 88], [93, 80], [96, 84], [100, 90], [104, 94],
  [108, 96], [112, 98], [116, 99], [120, 96], [124, 91], [128, 90], [132, 93],
  [136, 96], [140, 98], [145, 99.5], [148, 97], [152, 84], [156, 88], [160, 93],
  [164, 96], [168, 99], [172, 100], [176, 97], [178, 84], [182, 90], [186, 95],
  [190, 98], [194, 99], [198, 98], [200, 98],
];