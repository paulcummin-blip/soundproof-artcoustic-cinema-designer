// components/data/screenSizes.js

export const WIDTH_PRESETS = ["80","90","100","110","120","130","140","150","160","170","180","190","200","210","220","230","240","250"];

export const screenRows = [
  { visible_width_in: 80, overall_width_cm_169: 219, overall_height_cm_169: 139, overall_width_cm_235: 219, overall_height_cm_235: 109 },
  { visible_width_in: 90, overall_width_cm_169: 245, overall_height_cm_169: 154, overall_width_cm_235: 245, overall_height_cm_235: 120 },
  { visible_width_in: 100, overall_width_cm_169: 270, overall_height_cm_169: 168, overall_width_cm_235: 270, overall_height_cm_235: 131 },
  { visible_width_in: 110, overall_width_cm_169: 295, overall_height_cm_169: 182, overall_width_cm_235: 295, overall_height_cm_235: 142 },
  { visible_width_in: 120, overall_width_cm_169: 321, overall_height_cm_169: 196, overall_width_cm_235: 321, overall_height_cm_235: 153 },
  { visible_width_in: 130, overall_width_cm_169: 346, overall_height_cm_169: 211, overall_width_cm_235: 346, overall_height_cm_235: 164 },
  { visible_width_in: 140, overall_width_cm_169: 372, overall_height_cm_169: 225, overall_width_cm_235: 372, overall_height_cm_235: 174 },
  { visible_width_in: 150, overall_width_cm_169: 397, overall_height_cm_169: 239, overall_width_cm_235: 397, overall_height_cm_235: 185 },
  { visible_width_in: 160, overall_width_cm_169: 422, overall_height_cm_169: 254, overall_width_cm_235: 422, overall_height_cm_235: 196 },
  { visible_width_in: 170, overall_width_cm_169: 448, overall_height_cm_169: 268, overall_width_cm_235: 448, overall_height_cm_235: 207 },
  { visible_width_in: 180, overall_width_cm_169: 473, overall_height_cm_169: 282, overall_width_cm_235: 473, overall_height_cm_235: 218 },
  { visible_width_in: 190, overall_width_cm_169: 499, overall_height_cm_169: 296, overall_width_cm_235: 499, overall_height_cm_235: 228 },
  { visible_width_in: 200, overall_width_cm_169: 524, overall_height_cm_169: 311, overall_width_cm_235: 524, overall_height_cm_235: 239 },
  { visible_width_in: 210, overall_width_cm_169: 549, overall_height_cm_169: 325, overall_width_cm_235: 549, overall_height_cm_235: 250 },
  { visible_width_in: 220, overall_width_cm_169: 575, overall_height_cm_169: 339, overall_width_cm_235: 575, overall_height_cm_235: 261 },
  { visible_width_in: 230, overall_width_cm_169: 600, overall_height_cm_169: 354, overall_width_cm_235: 600, overall_height_cm_235: 272 },
  { visible_width_in: 240, overall_width_cm_169: 626, overall_height_cm_169: 368, overall_width_cm_235: 626, overall_height_cm_235: 282 },
  { visible_width_in: 250, overall_width_cm_169: 651, overall_height_cm_169: 382, overall_width_cm_235: 651, overall_height_cm_235: 293 }
];

export function getVisibleWidthOptions() {
  return screenRows.map(row => row.visible_width_in);
}

export function findRowByVisibleWidth(visibleWidth) {
  return screenRows.find(row => row.visible_width_in === visibleWidth);
}

export function rowToSpec(row, aspectRatio) {
  if (!row) return null;
  
  if (aspectRatio === '16:9') {
    return {
      visibleWidthInches: row.visible_width_in,
      overallWidthCm: row.overall_width_cm_169,
      overallHeightCm: row.overall_height_cm_169,
      aspectRatio: '16:9',
    };
  }
  return {
    visibleWidthInches: row.visible_width_in,
    overallWidthCm: row.overall_width_cm_235,
    overallHeightCm: row.overall_height_cm_235,
    aspectRatio: '2.35:1',
  };
}