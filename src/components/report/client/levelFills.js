/**
 * ONE canonical level-fill map for all client visual reports.
 * Opaque, tonal dark→light. No opacity stacking.
 * Below L1 = darkest, L4 = lightest.
 *
 * Neutral grey palette — matches the restrained visual language
 * used across P5, P9, P12, P13 and P16/P17 client report pages.
 */
export const LEVEL_FILLS = {
  "below-l1": "#3E4349", // darkest — poorest result
  "l1":       "#6F7275",
  "l2":       "#989B9D",
  "l3":       "#C4C5C4",
  "l4":       "#E8E8E6", // lightest — best result
};