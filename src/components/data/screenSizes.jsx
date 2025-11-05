
// components/data/screenSizes.js

export const WIDTH_PRESETS = ["80","90","100","110","120","130","140","150","160","170","180","200","210","220","230","240","250"];

export const screenRows = [
  { visible_width_in: 100, overall_width_cm_169: 270, overall_height_cm_169: 159, overall_width_cm_235: 270, overall_height_cm_235: 124 },
  { visible_width_in: 110, overall_width_cm_169: 295, overall_height_cm_169: 173, overall_width_cm_235: 295, overall_height_cm_235: 135 },
  { visible_width_in: 120, overall_width_cm_169: 321, overall_height_cm_169: 187, overall_width_cm_235: 321, overall_height_cm_235: 146 },
  { visible_width_in: 130, overall_width_cm_169: 346, overall_height_cm_169: 202, overall_width_cm_235: 346, overall_height_cm_235: 157 },
  { visible_width_in: 140, overall_width_cm_169: 372, overall_height_cm_169: 216, overall_width_cm_235: 372, overall_height_cm_235: 167 },
  { visible_width_in: 150, overall_width_cm_169: 397, overall_height_cm_169: 230, overall_width_cm_235: 397, overall_height_cm_235: 178 },
  { visible_width_in: 160, overall_width_cm_169: 422, overall_height_cm_169: 245, overall_width_cm_235: 422, overall_height_cm_235: 189 },
  { visible_width_in: 170, overall_width_cm_169: 448, overall_height_cm_169: 259, overall_width_cm_235: 448, overall_height_cm_235: 200 },
  { visible_width_in: 180, overall_width_cm_169: 473, overall_height_cm_169: 273, overall_width_cm_235: 473, overall_height_cm_235: 211 },
  { visible_width_in: 190, overall_width_cm_169: 499, overall_height_cm_169: 287, overall_width_cm_235: 499, overall_height_cm_235: 221 },
  { visible_width_in: 200, overall_width_cm_169: 524, overall_height_cm_169: 302, overall_width_cm_235: 524, overall_height_cm_235: 232 },
  { visible_width_in: 210, overall_width_cm_169: 549, overall_height_cm_169: 316, overall_width_cm_235: 549, overall_height_cm_235: 243 },
  { visible_width_in: 220, overall_width_cm_169: 575, overall_height_cm_169: 330, overall_width_cm_235: 575, overall_height_cm_235: 254 },
  { visible_width_in: 230, overall_width_cm_169: 600, overall_height_cm_169: 345, overall_width_cm_235: 600, overall_height_cm_235: 265 },
  { visible_width_in: 240, overall_width_cm_169: 626, overall_height_cm_169: 359, overall_width_cm_235: 626, overall_height_cm_235: 275 },
  { visible_width_in: 250, overall_width_cm_169: 651, overall_height_cm_169: 373, overall_width_cm_235: 651, overall_height_cm_235: 286 }
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
