/**
 * selectClientDesignHighlights
 * ----------------------------
 * Pure selector: client-facing Design Summary (intro page).
 *
 * Returns four concise highlights grouped under three RP22 categories:
 *   - Spatial Resolution (P1, P4, P6, P10 / P5, P9)
 *   - Dynamic Range (P12, P13)
 *   - Timbre Matching (P16, P17)
 *
 * This is a static introduction summary that describes the visual pages
 * that follow. No calculations, no pass-level gating, no score creation.
 *
 * @returns {Array} highlights
 */
export function selectClientDesignHighlights() {
  return [
    {
      id: "strong-listening-area",
      category: "Spatial Resolution",
      icon: "Headphones",
      title: "Strong listening area",
      paramRef: "RP22 Parameters 1, 4, 6 & 10",
      copy: "The centre seating positions provide the strongest overall balance, with good separation from the room boundaries and consistent coverage from the speaker system.",
    },
    {
      id: "smooth-three-dimensional-movement",
      category: "Spatial Resolution",
      icon: "ChevronUp",
      title: "Smooth three-dimensional movement",
      paramRef: "RP22 Parameters 5 & 9",
      copy: "The listener-level and overhead speakers are spaced to support smooth, convincing movement around and above the seating area.",
    },
    {
      id: "strong-cinema-level-dynamics",
      category: "Dynamic Range",
      icon: "Zap",
      title: "Strong cinema-level dynamics",
      paramRef: "RP22 Parameters 12 & 13",
      copy: "The screen, surround and overhead speakers provide strong dynamic capability at the reference listening position, preserving the impact of demanding movie soundtracks.",
    },
    {
      id: "consistent-sound-across-the-seats",
      category: "Timbre Matching",
      icon: "Waves",
      title: "Consistent sound across the seats",
      paramRef: "RP22 Parameters 16 & 17",
      copy: "The system is designed to maintain a consistent tonal character across the seating area, preserving clarity and detail as listeners move away from the reference position.",
    },
  ];
}