// components/models/speakers/registry.js
// CANONICAL SPEAKER REGISTRY — DO NOT EDIT WITHOUT APPROVAL
// Units: millimetres. Plan view uses widthMm (X) and depthMm (Y). Height is for reporting/UI.
// Overheads use diameterMm + depthMm and render as circles in plan view.

const mmToM = (mm) => Math.round((Number(mm) || 0) * 1e-3 * 1e6) / 1e6; // 1 µm precision

export const CATEGORY_ORDER = ["LCR", "SURROUNDS", "ARCHITECT", "SUBWOOFERS"];

export const MODELS = [
  // LCR — EXACT ORDER
  { key: "q4-3", label: "Q4-3", category: "LCR", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 99, nominalOhms: 8, max_power: 120, max_spl_cont_db_1m_halfspace: 114, max_spl_peak_db_cf6_1m_halfspace: 120, max_spl_cont_db_1m_anechoic: 108, max_spl_peak_db_cf6_1m_anechoic: 114, price_gbp_exVat: 1820, retailPriceGBP: 1820.00, currency: "GBP", vatIncluded: true, vatRate: 0.20, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
  { key: "q6-3", label: "Q6-3", category: "LCR", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 10, max_power: 120, max_spl_cont_db_1m_halfspace: 118, max_spl_peak_db_cf6_1m_halfspace: 124, max_spl_cont_db_1m_anechoic: 112, max_spl_peak_db_cf6_1m_anechoic: 118, price_gbp_exVat: 2090, retailPriceGBP: 2090.00, currency: "GBP", vatIncluded: true, vatRate: 0.20, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 39, minus3dB: 48, minus5dB: 64 } } },
  { key: "q4-5", label: "Q4-5", category: "LCR", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 99, sensitivity_dB_2p83: 99, nominalOhms: 8, max_power: 400, max_spl_cont_db_1m_halfspace: 122, max_spl_peak_db_cf6_1m_halfspace: 128, max_spl_cont_db_1m_anechoic: 116, max_spl_peak_db_cf6_1m_anechoic: 122, price_gbp_exVat: 3910, retailPriceGBP: 3910.00, currency: "GBP", vatIncluded: true, vatRate: 0.20, hfOffAxis16k: { minus3deg: 40, minus5deg: 50 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
  { key: "q8-5", label: "Q8-5", category: "LCR", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 106, nominalOhms: 4, max_power: 800, max_spl_cont_db_1m_halfspace: 128, max_spl_peak_db_cf6_1m_halfspace: 134, max_spl_cont_db_1m_anechoic: 122, max_spl_peak_db_cf6_1m_anechoic: 128, price_gbp_exVat: 5730, retailPriceGBP: 5730.00, currency: "GBP", vatIncluded: true, vatRate: 0.20, hfOffAxis16k: { minus3deg: 40, minus5deg: 50 }, dispersion: { horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 } } },
  { key: "evolve-2-1", label: "EVOLVE 2-1", category: "LCR", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 100, nominalOhms: 4, max_power: 60, max_spl_cont_db_1m_halfspace: 108, max_spl_peak_db_cf6_1m_halfspace: 114, max_spl_cont_db_1m_anechoic: 102, max_spl_peak_db_cf6_1m_anechoic: 108, price_gbp_exVat: 780, retailPriceGBP: 780.00, currency: "GBP", vatIncluded: true, vatRate: 0.20, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 31, minus3dB: 45, minus5dB: 64 } } },
  { key: "evolve-3-1", label: "EVOLVE 3-1", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 101, nominalOhms: 3, max_power: 90, max_spl_cont_db_1m_halfspace: 110, max_spl_peak_db_cf6_1m_halfspace: 116, max_spl_cont_db_1m_anechoic: 104, max_spl_peak_db_cf6_1m_anechoic: 110, price_gbp_exVat: 1170, retailPriceGBP: 1170.00, currency: "GBP", vatIncluded: true, vatRate: 0.20, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 39, minus3dB: 55, minus5dB: 73 } } },
  { key: "evolve-4-2", label: "EVOLVE 4-2", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 99, nominalOhms: 4, max_power: 120, max_spl_cont_db_1m_halfspace: 113, max_spl_peak_db_cf6_1m_halfspace: 119, max_spl_cont_db_1m_anechoic: 107, max_spl_peak_db_cf6_1m_anechoic: 113, price_gbp_exVat: 1780, retailPriceGBP: 1780.00, currency: "GBP", vatIncluded: true, vatRate: 0.20, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
  { key: "evolve-6-3", label: "EVOLVE 6-3", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 103, nominalOhms: 4, max_power: 180, max_spl_cont_db_1m_halfspace: 118, max_spl_peak_db_cf6_1m_halfspace: 124, max_spl_cont_db_1m_anechoic: 112, max_spl_peak_db_cf6_1m_anechoic: 118, price_gbp_exVat: 2250, retailPriceGBP: 2250.00, currency: "GBP", vatIncluded: true, vatRate: 0.20, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
  { key: "evolve-8-4", label: "EVOLVE 8-4", category: "LCR", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 102, sensitivity_dB_2p83: 106, nominalOhms: 3, max_power: 240, max_spl_cont_db_1m_halfspace: 120, max_spl_peak_db_cf6_1m_halfspace: 126, max_spl_cont_db_1m_anechoic: 114, max_spl_peak_db_cf6_1m_anechoic: 120, price_gbp_exVat: 2720, retailPriceGBP: 2720.00, currency: "GBP", vatIncluded: true, vatRate: 0.20, hfOffAxis16k: { minus3deg: 30, minus5deg: 40 }, dispersion: { horizontal: { minus1p5dB: 36, minus3dB: 52, minus5dB: 70 } } },
  // TODO: Replace C-1 dimensions with verified source dimensions if/when available.
  { key: "c-1", label: "C-1", category: "LCR", frontStageType: "center_only", widthType: "fixed", fixedWidthMm: 400, widthMm: 400, heightMm: 120, depthMm: 81, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 96, nominalOhms: 4, max_power: 60, max_spl: 108, peak_spl: 114, frequency_response_low: 90, usable_lf_hz_minus6db: 87, recommended_hpf_hz: 100, recommended_hpf_slope: "24dB/oct", hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 50, minus3dB: 70, minus5dB: 85 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 100 } } },
  { key: "c4-1", label: "C4-1", category: "LCR", frontStageType: "center_only", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 120, depthMm: 81, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 98, nominalOhms: 8, max_power: 120, max_spl: 109, peak_spl: 115, max_spl_cont_db_1m_halfspace: 109, max_spl_peak_db_cf6_1m_halfspace: 115, max_spl_cont_db_1m_anechoic: 103, max_spl_peak_db_cf6_1m_anechoic: 109, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 45, minus5deg: 60 }, dispersion: { horizontal: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 } } },
  { key: "multi-lcr", label: "Multi (LCR)", category: "LCR", frontStageType: "integrated_lcr", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 96, nominalOhms: 12, max_power: 60, max_spl: 108, peak_spl: 114, max_spl_cont_db_1m_halfspace: 108, max_spl_peak_db_cf6_1m_halfspace: 114, max_spl_cont_db_1m_anechoic: 102, max_spl_peak_db_cf6_1m_anechoic: 108, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 45, minus5deg: 60 }, dispersion: { horizontal: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 } } },
  { key: "multi-mono", label: "Multi (Mono)", category: "LCR", frontStageType: "center_only", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 101, sensitivity_dB_2p83: 101, nominalOhms: 12, max_power: 180, max_spl: 113, peak_spl: 119, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 45, minus5deg: 60 }, dispersion: { horizontal: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 105 } } },
  { key: "hspl-lcr", label: "HSPL (LCR)", category: "LCR", frontStageType: "integrated_lcr", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 98, nominalOhms: 8, max_power: 120, max_spl: 110, peak_spl: 116, max_spl_cont_db_1m_halfspace: 110, max_spl_peak_db_cf6_1m_halfspace: 116, max_spl_cont_db_1m_anechoic: 104, max_spl_peak_db_cf6_1m_anechoic: 110, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 50, minus3dB: 70, minus5dB: 85 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 100 } } },
  { key: "hspl-mono", label: "HSPL (Mono)", category: "LCR", frontStageType: "center_only", widthType: "tv_linked", tvWidthMap: { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 }, heightMm: 100, depthMm: 80, placementOffsetFromScreenBottomMm: 200, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 103, nominalOhms: 8, max_power: 360, max_spl: 115, peak_spl: 121, frequency_response_low: 80, usable_lf_hz_minus6db: 77, hfOffAxis16k: { minus3deg: 35, minus5deg: 45 }, dispersion: { horizontal: { minus1p5dB: 50, minus3dB: 70, minus5dB: 85 }, vertical: { minus1p5dB: 65, minus3dB: 90, minus5dB: 100 } } },

  // SURROUNDS — EXACT ORDER
  { key: "evolve-1-1_s", label: "EVOLVE 1-1", category: "SURROUNDS", widthMm: 150, heightMm: 150, depthMm: 72, sensitivity_dB_1w1m: 93, sensitivity_dB_2p83: 96, nominalOhms: 8, max_power: 30, price_gbp_exVat: 550 },
  { key: "evolve-2-1_s", label: "EVOLVE 2-1", category: "SURROUNDS", widthMm: 200, heightMm: 200, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 100, nominalOhms: 4, max_power: 60, price_gbp_exVat: 780, retailPriceGBP: 780.00, currency: "GBP", vatIncluded: true, vatRate: 0.20 },
  { key: "evolve-3-1_s", label: "EVOLVE 3-1", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 97, sensitivity_dB_2p83: 101, nominalOhms: 3, max_power: 90, price_gbp_exVat: 1170, retailPriceGBP: 1170.00, currency: "GBP", vatIncluded: true, vatRate: 0.20 },
  { key: "evolve-4-2_s", label: "EVOLVE 4-2", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 96, sensitivity_dB_2p83: 99, nominalOhms: 4, max_power: 120, price_gbp_exVat: 1780, retailPriceGBP: 1780.00, currency: "GBP", vatIncluded: true, vatRate: 0.20 },
  { key: "evolve-6-3_s", label: "EVOLVE 6-3", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 103, nominalOhms: 4, max_power: 180, price_gbp_exVat: 2250, retailPriceGBP: 2250.00, currency: "GBP", vatIncluded: true, vatRate: 0.20 },
  { key: "evolve-8-4_s", label: "EVOLVE 8-4", category: "SURROUNDS", widthMm: 270, heightMm: 370, depthMm: 82, sensitivity_dB_1w1m: 102, sensitivity_dB_2p83: 106, nominalOhms: 3, max_power: 240, price_gbp_exVat: 2720, retailPriceGBP: 2720.00, currency: "GBP", vatIncluded: true, vatRate: 0.20 },
  { key: "q4-3_s", label: "Q4-3", category: "SURROUNDS", widthMm: 280, heightMm: 210, depthMm: 110, sensitivity_dB_1w1m: 98, sensitivity_dB_2p83: 98, nominalOhms: 8, max_power: 120, price_gbp_exVat: 1820, retailPriceGBP: 1820.00, currency: "GBP", vatIncluded: true, vatRate: 0.20 },
  { key: "q6-3_s", label: "Q6-3", category: "SURROUNDS", widthMm: 280, heightMm: 280, depthMm: 110, sensitivity_dB_1w1m: 100, sensitivity_dB_2p83: 100, nominalOhms: 10, max_power: 120, price_gbp_exVat: 2090, retailPriceGBP: 2090.00, currency: "GBP", vatIncluded: true, vatRate: 0.20 },
  { key: "q4-5_s", label: "Q4-5", category: "SURROUNDS", widthMm: 500, heightMm: 400, depthMm: 160, sensitivity_dB_1w1m: 99, sensitivity_dB_2p83: 99, nominalOhms: 8, max_power: 400, price_gbp_exVat: 3910, retailPriceGBP: 3910.00, currency: "GBP", vatIncluded: true, vatRate: 0.20 },
  { key: "q8-5_s", label: "Q8-5", category: "SURROUNDS", widthMm: 500, heightMm: 600, depthMm: 160, sensitivity_dB_1w1m: 103, sensitivity_dB_2p83: 106, nominalOhms: 4, max_power: 800, price_gbp_exVat: 5730, retailPriceGBP: 5730.00, currency: "GBP", vatIncluded: true, vatRate: 0.20 },

  // ARCHITECT (OVERHEAD) — EXACT ORDER
  { 
    key: "architect-mikro",
    label: "ARCHITECT Mikro",
    category: "ARCHITECT",
    widthMm: 54,     // short edge (left/right)
    depthMm: 138,    // long edge (front/back)
    heightMm: 26,    // physical depth only for reporting
    round: false,    // MUST be explicitly false
    sensitivity_dB_1w1m: 86,
    sensitivity_dB_2p83: 86,
    nominalOhms: 8,
    max_power: 15,
            price_gbp_exVat: null,
            builtInTiltDeg: 0,
    dispersion: {
      horizontal: {
        minus1p5dB: 90,
        minus3dB: 90,
        minus5dB: 90,
      }
    }
  },
  { 
    key: "architect-2-1", 
    label: "ARCHITECT 2-1", 
    category: "ARCHITECT", 
    diameterMm: 240, 
    depthMm: 120, 
    round: true, 
    sensitivity_dB_1w1m: 97, 
    sensitivity_dB_2p83: 100, 
    nominalOhms: 4, 
    max_power: 60,
    price_gbp_exVat: 740,
    retailPriceGBP: 740.00,
    currency: "GBP",
    vatIncluded: true,
    vatRate: 0.20,
    builtInTiltDeg: 5,
    dispersion: {
      horizontal: {
        minus1p5dB: 40,
        minus3dB: 55,
        minus5dB: 72,
      },
      vertical: {
        minus1p5dB: 40,
        minus3dB: 55,
        minus5dB: 72,
      }
    }
  },
  { 
    key: "architect-4-2", 
    label: "ARCHITECT 4-2", 
    category: "ARCHITECT", 
    diameterMm: 300, 
    depthMm: 120, 
    round: true, 
    sensitivity_dB_1w1m: 97, 
    sensitivity_dB_2p83: 97, 
    nominalOhms: 4, 
    max_power: 120,
    price_gbp_exVat: 1230,
    retailPriceGBP: 1230.00,
    currency: "GBP",
    vatIncluded: true,
    vatRate: 0.20,
    builtInTiltDeg: 5,
    dispersion: {
      horizontal: {
        minus1p5dB: 30,
        minus3dB: 45,
        minus5dB: 63,
      },
      vertical: {
        minus1p5dB: 30,
        minus3dB: 45,
        minus5dB: 63,
      }
    }
  },
  { 
    key: "architect-pas2-2", 
    label: "ARCHITECT PAS2-2", 
    category: "ARCHITECT", 
    diameterMm: 300, 
    depthMm: 150, 
    round: true, 
    sensitivity_dB_1w1m: 97, 
    sensitivity_dB_2p83: 97, 
    nominalOhms: 4, 
    max_power: 120,
    price_gbp_exVat: 1200,
    retailPriceGBP: 1200.00,
    currency: "GBP",
    vatIncluded: true,
    vatRate: 0.20,
    builtInTiltDeg: 20,
    dispersion: {
      horizontal: {
        minus1p5dB: 43,
        minus3dB: 60,
        minus5dB: 82,
      },
      vertical: {
        minus1p5dB: 24,
        minus3dB: 40,
        minus5dB: 60,
      }
    }
  },

  // SUBWOOFERS — EXACT ORDER
  { 
    key: "sub2-12", 
    label: "SUB2-12", 
    category: "SUBWOOFERS", 
    widthMm: 500, 
    heightMm: 500, 
    depthMm: 255, 
    sensitivity_dB_1w1m: 94, 
    max_power: 350,
    max_spl_cont_db_1m_halfspace: 120,
    max_spl_peak_db_cf6_1m_halfspace: 126,
    max_spl_cont_db_1m_anechoic: 114,
    max_spl_peak_db_cf6_1m_anechoic: 120,
    max_spl_cont_db_30hz_halfspace: 118,
    max_spl_cont_db_30hz_anechoic: 112,
    price_gbp_exVat: 2190,
    retailPriceGBP: 2190.00,
    currency: "GBP",
    vatIncluded: true,
    vatRate: 0.20,
    frequency_response_curve: [[15, 80], [20, 86], [25, 90], [30, 92], [40, 94], [50, 94], [63, 93], [80, 91], [100, 87], [125, 82], [160, 75], [200, 68]]
  },
  { 
    key: "sub3-12", 
    label: "SUB3-12", 
    category: "SUBWOOFERS", 
    widthMm: 600, 
    heightMm: 600, 
    depthMm: 255, 
    sensitivity_dB_1w1m: 97, 
    max_power: 700,
    max_spl_cont_db_1m_halfspace: 125,
    max_spl_peak_db_cf6_1m_halfspace: 131,
    max_spl_cont_db_1m_anechoic: 119,
    max_spl_peak_db_cf6_1m_anechoic: 125,
    max_spl_cont_db_30hz_halfspace: 122,
    max_spl_cont_db_30hz_anechoic: 116,
    price_gbp_exVat: 3740,
    retailPriceGBP: 3740.00,
    currency: "GBP",
    vatIncluded: true,
    vatRate: 0.20,
    frequency_response_curve: [[15, 83], [20, 89], [25, 93], [30, 95], [40, 97], [50, 97], [63, 96], [80, 94], [100, 90], [125, 85], [160, 78], [200, 71]]
  },
  { 
    key: "sub4-12", 
    label: "SUB4-12", 
    category: "SUBWOOFERS", 
    widthMm: 440, 
    heightMm: 1700, 
    depthMm: 270, 
    sensitivity_dB_1w1m: 99, 
    max_power: 1400,
    max_spl_cont_db_1m_halfspace: 126,
    max_spl_peak_db_cf6_1m_halfspace: 132,
    max_spl_cont_db_1m_anechoic: 120,
    max_spl_peak_db_cf6_1m_anechoic: 126,
    max_spl_cont_db_30hz_halfspace: 126,
    max_spl_cont_db_30hz_anechoic: 120,
    price_gbp_exVat: 6600,
    retailPriceGBP: 6600.00,
    currency: "GBP",
    vatIncluded: true,
    vatRate: 0.20,
    frequency_response_curve: [[15, 85], [20, 91], [25, 95], [30, 97], [40, 99], [50, 99], [63, 98], [80, 96], [100, 92], [125, 87], [160, 80], [200, 73]]
  },
];

// NORMALISATION — TOLERANT TO SPACES/CASE/EXTRA TEXT
export function normaliseModelKey(name = "") {
  const raw = String(name).toLowerCase();
  // STEP 1: Preserve underscores in the sanitiser
  let s = raw.replace(/[()]/g, " ").replace(/[^a-z0-9_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  // unify known families
  s = s.replace(/^spitfire-q-(\d+)-(\d+)$/, "q$1-$2");
  s = s.replace(/^spitfire-q(\d+)-(\d+)$/, "q$1-$2"); // NEW: handle "spitfire-q4-3" -> "q4-3"
  s = s.replace(/^evolve-(\d+)-(\d+)$/, "evolve-$1-$2");
  s = s.replace(/^architect-(pas2-2)$/, "architect-$1");
  s = s.replace(/^architect-mikro$/, "architect-mikro");
  
  // Safety net: normalise a trailing "-s" back to "_s"
  if (s.endsWith("-s")) {
      s = s.slice(0, -2) + "_s";
  }

  // allow "_s" variants for surrounds already keyed above
  return s;
}

// DISPLAY HELPER — Remove _s suffix for UI display
export function displayModelKey(modelKey = "") {
  const key = String(modelKey || "");
  return key.endsWith("_s") ? key.slice(0, -2) : key;
}

// PRIMARY ACCESSOR — RETURNS METRICS IN METRES, WITH PLAN SHAPE HINTS
export function getSpeakerModelMeta(modelName, orientation) {
  const key = normaliseModelKey(modelName);
  const hit =
    MODELS.find(m => m.key === key) ||
    // allow mapping of LCR keys into surrounds if labels match
    MODELS.find(m => m.label.toLowerCase() === String(modelName).trim().toLowerCase());

  if (!hit) {
    // HARD FAIL SAFE — don't silently substitute sizes
    return { 
      widthM: 0.27, 
      heightM: 0.27, 
      depthM: 0.082, 
      round: false, 
      notFound: true, 
      key, 
      label: String(modelName),
      price_gbp_exVat: null,
      sensitivity_dB_1w1m: null,
      sensitivity_dB_2p83: null,
      nominalOhms: null,
      max_power: null,
      frequency_response_curve: null,
    };
  }

  // If this is a SURROUNDS "_s" variant and it lacks dispersion data,
  // inherit dispersion (and hfOffAxis16k) from the matching non-s model.
  // This keeps P17 product-dependent for surrounds without duplicating tables.
  const inherited =
    (hit?.key && hit.key.endsWith("_s"))
      ? MODELS.find(m => m.key === hit.key.replace(/_s$/, ""))
      : null;

  const finalDispersion = hit?.dispersion ?? inherited?.dispersion ?? null;
  const finalHfOffAxis16k = hit?.hfOffAxis16k ?? inherited?.hfOffAxis16k ?? null;

  if (hit.round) {
    return {
      round: true,
      diameterM: mmToM(hit.diameterMm),
      depthM: mmToM(hit.depthMm),
      widthM: mmToM(hit.diameterMm),   // for generic callers
      heightM: mmToM(hit.diameterMm),  // for generic callers
      key: hit.key,
      label: hit.label,
      category: hit.category,
      sensitivity_dB_1w1m: hit.sensitivity_dB_1w1m ?? null,
      sensitivity_dB_2p83: hit.sensitivity_dB_2p83 ?? null,
      nominalOhms: hit.nominalOhms ?? null,
      max_power: hit.max_power ?? null,
      max_spl_cont_db_1m_halfspace: hit.max_spl_cont_db_1m_halfspace ?? null,
      max_spl_peak_db_cf6_1m_halfspace: hit.max_spl_peak_db_cf6_1m_halfspace ?? null,
      max_spl_cont_db_1m_anechoic: hit.max_spl_cont_db_1m_anechoic ?? null,
      max_spl_peak_db_cf6_1m_anechoic: hit.max_spl_peak_db_cf6_1m_anechoic ?? null,
      hfOffAxis16k: finalHfOffAxis16k,
      builtInTiltDeg: hit.builtInTiltDeg ?? null,
      dispersion: finalDispersion,
      // RP22 P17 measured engine (Stage 1 scaffolding) — null for every current model.
      polarModel: hit.polarModel ?? null,
      frequency_response_curve: hit.frequency_response_curve ?? null,
      price_gbp_exVat: hit.price_gbp_exVat ?? null,
    };
  }

  // SUB4-12 orientation handling: swap width and height for horizontal
  let resolvedWidthMm = hit.widthMm;

  if (hit.widthType === "fixed" && Number.isFinite(hit.fixedWidthMm)) {
    resolvedWidthMm = hit.fixedWidthMm;
  }

  if (hit.widthType === "tv_linked" && hit.tvWidthMap && orientation) {
    resolvedWidthMm = hit.tvWidthMap[orientation] || hit.widthMm || hit.fixedWidthMm;
  }

  let widthM = mmToM(resolvedWidthMm);
  let heightM = mmToM(hit.heightMm);
  const depthM = mmToM(hit.depthMm);
  
  if (hit.key === "sub4-12" && orientation === "horizontal") {
    // Swap width and height for horizontal orientation
    [widthM, heightM] = [heightM, widthM];
  }

  return {
    round: false,
    widthM,
    heightM,
    depthM,
    key: hit.key,
    label: hit.label,
    category: hit.category,
    frontStageType: hit.frontStageType ?? null,
    widthType: hit.widthType ?? null,
    fixedWidthMm: hit.fixedWidthMm ?? null,
    tvWidthMap: hit.tvWidthMap ?? null,
    placementOffsetFromScreenBottomMm: hit.placementOffsetFromScreenBottomMm ?? null,
    sensitivity_dB_1w1m: hit.sensitivity_dB_1w1m ?? null,
    sensitivity_dB_2p83: hit.sensitivity_dB_2p83 ?? null,
    nominalOhms: hit.nominalOhms ?? null,
    max_power: hit.max_power ?? null,
    max_spl: hit.max_spl ?? null,
    peak_spl: hit.peak_spl ?? null,
    // Canonical anechoic/halfspace SPL fields — RP22 maths must use the anechoic variants
    max_spl_cont_db_1m_halfspace: hit.max_spl_cont_db_1m_halfspace ?? null,
    max_spl_peak_db_cf6_1m_halfspace: hit.max_spl_peak_db_cf6_1m_halfspace ?? null,
    max_spl_cont_db_1m_anechoic: hit.max_spl_cont_db_1m_anechoic ?? null,
    max_spl_peak_db_cf6_1m_anechoic: hit.max_spl_peak_db_cf6_1m_anechoic ?? null,
    max_spl_cont_db_30hz_halfspace: hit.max_spl_cont_db_30hz_halfspace ?? null,
    max_spl_cont_db_30hz_anechoic: hit.max_spl_cont_db_30hz_anechoic ?? null,
    frequency_response_low: hit.frequency_response_low ?? null,
    usable_lf_hz_minus6db: hit.usable_lf_hz_minus6db ?? null,
    recommended_hpf_hz: hit.recommended_hpf_hz ?? null,
    recommended_hpf_slope: hit.recommended_hpf_slope ?? null,
    hfOffAxis16k: finalHfOffAxis16k,
    builtInTiltDeg: hit.builtInTiltDeg ?? null,
    dispersion: finalDispersion,
    // RP22 P17 measured engine (Stage 1 scaffolding) — null for every current model.
    polarModel: hit.polarModel ?? null,
    frequency_response_curve: hit.frequency_response_curve ?? null,
    price_gbp_exVat: hit.price_gbp_exVat ?? null,
  };
}

// SUBWOOFER RESPONSE CURVE ACCESSOR (for engine use)
export function hasSpeakerModel(modelName) {
        const key = normaliseModelKey(modelName);
        return MODELS.some(m => m.key === key);
      }
      
      export function getSpeakerPriceGbp(modelName) {
        const key = normaliseModelKey(modelName);
        const model = MODELS.find(m => m.key === key);
        return Number.isFinite(model?.price_gbp_exVat) ? model.price_gbp_exVat : null;
      }
      
      export function getSubResponseCurve(modelKey) {
  const normalized = normaliseModelKey(modelKey);
  const model = MODELS.find(m => m.key === normalized);
  
  if (!model || !model.frequency_response_curve) {
    return null;
  }
  
  // Convert [[hz, db], ...] array to [{frequency, spl}, ...] format
  return model.frequency_response_curve.map(([frequency, spl]) => ({
    frequency,
    spl
  }));
}

// VALIDATION HELPER
export function isValidCurve(curve) {
  if (!Array.isArray(curve)) return false;
  return curve.every(point => 
    Array.isArray(point) && 
    point.length === 2 && 
    typeof point[0] === 'number' && 
    typeof point[1] === 'number'
  );
}

// SUBWOOFER CURVE ACCESSOR (for chart plotting)
export function getSubwooferCurve(modelKey) {
  const normalized = normaliseModelKey(modelKey);
  const model = MODELS.find(m => m.key === normalized);
  
  if (!model || !model.frequency_response_curve) {
    return null;
  }
  
  const rawCurve = model.frequency_response_curve;
  if (!isValidCurve(rawCurve)) {
    return null;
  }
  
  // Convert [[hz, db], ...] to [{hz, db}, ...]
  return rawCurve.map(([hz, db]) => ({ hz, db }));
}

// CATEGORY LISTS IN EXACT UI ORDER
export function getModelsByCategoryOrdered() {
  const byCat = { LCR: [], SURROUNDS: [], ARCHITECT: [], SUBWOOFERS: [] };
  MODELS.forEach(m => { 
    if (byCat[m.category]) { // Ensure category exists before pushing
      byCat[m.category].push(m); 
    }
  });
  const ordered = {};
  CATEGORY_ORDER.forEach(cat => { ordered[cat] = byCat[cat] || []; });
  return ordered;
}

export default { getSpeakerModelMeta, getModelsByCategoryOrdered, normaliseModelKey, getSubResponseCurve, getSubwooferCurve, isValidCurve, getSpeakerPriceGbp, hasSpeakerModel, CATEGORY_ORDER, MODELS };