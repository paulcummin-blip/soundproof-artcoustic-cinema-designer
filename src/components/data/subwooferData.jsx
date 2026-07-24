export const subModels = ["SUB2-12", "SUB3-12", "SUB4-12"];

// Millimetres
export const subDimsMM = {
  // From your message
  "SUB2-12": { w: 500, h: 500, d: 255 },
  "SUB3-12": { w: 600, h: 600, d: 255 },
  "SUB4-12": { w: 440, h: 1700, d: 260 }
};

// All heights are referenced from the BOTTOM of the cabinet
export const subHeightDefault = {
  "SUB2-12": { mode: "bottom", z_mm: 800 }, // bottom @ 800 mm
  "SUB3-12": { mode: "bottom", z_mm: 800 }, // bottom @ 800 mm
  "SUB4-12": { mode: "bottom", z_mm: 100 }  // bottom @ 100 mm
};

export const subPerformance = {
  "SUB2-12": {
    frequency_range_hz: [25, 170],
    usable_lf_hz: 22,
    coverage: "omni",
    sensitivity_db_1w_1m: 94,
    power_handling_w: 350,
    max_cont_spl_db_1m: 120,
    max_cont_spl_30hz_db_1m: 118,
    max_peak_spl_db_1m_cf6: 126,
    impedance_ohm: 4,
    amp: "CPH-1000D stereo or bridged",
    drivers: "1 x 12\" long throw",
    connection: "Single amped gold plated push terminals",
    weight_kg: 25
  },
  "SUB3-12": {
    frequency_range_hz: [25, 120],
    usable_lf_hz: 22,
    coverage: "omni",
    sensitivity_db_1w_1m: 97,
    power_handling_w: 700,
    max_cont_spl_db_1m: 125,
    max_cont_spl_30hz_db_1m: 122,
    max_peak_spl_db_1m_cf6: 131,
    impedance_ohm: 8,
    amp: "CPH-1000D bridged",
    drivers: "2 x 12\"",
    connection: "Single amped gold plated push terminals",
    weight_kg: 32
  },
  "SUB4-12": {
    frequency_range_hz: [15, 170],
    usable_lf_hz: 12,
    coverage: "omni",
    sensitivity_db_1w_1m: 99,
    power_handling_w: 1400,
    max_cont_spl_db_1m: 126,
    max_cont_spl_30hz_db_1m: 126,
    max_peak_spl_db_1m_cf6: 132,
    impedance_ohm: 4,
    amp: "Approved system amplification",
    drivers: "4 x 12\"",
    connection: "Single amped input",
    weight_kg: null
  }
};