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
    label: "MIKRO Ci",
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
    hiddenFromSelector: true,
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
    hiddenFromSelector: true,
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

  {
    key: "spitfire-cloud",
    label: "SPITFIRE CLOUD",
    category: "ARCHITECT",
    diameterMm: 300,
    depthMm: 300,
    heightMm: 83,
    round: true,
    sensitivity_dB_1w1m: 98,
    sensitivity_dB_2p83: 98,
    nominalOhms: 4,
    max_power: 120,
    max_spl_cont_db_1m_halfspace: 114,
    max_spl_peak_db_cf6_1m_halfspace: 120,
    frequency_response_low: 100,
    usable_lf_hz_minus6db: 97,
    price_gbp_exVat: null,
    builtInTiltDeg: 22,
    // RP22 P17 MEASURED ENGINE — enabled for this model only (Stage 2C).
    polarModel: {
      type: "measured",
      axisTiltDeg: 22,
      dataset: "SpitfireCloud"
    }
  },

  {
    key: "architect-4-2-mk2",
    label: "ARCHITECT 4-2 mk II",
    category: "ARCHITECT",
    diameterMm: 300,
    depthMm: 300,
    heightMm: 83,
    round: true,
    sensitivity_dB_1w1m: 98,
    sensitivity_dB_2p83: 98,
    nominalOhms: 4,
    max_power: 120,
    max_spl_cont_db_1m_halfspace: 114,
    max_spl_peak_db_cf6_1m_halfspace: 120,
    frequency_response_low: 100,
    usable_lf_hz_minus6db: 97,
    price_gbp_exVat: null,
    builtInTiltDeg: 22,
    // Architect 4-2 Mk2 shares the measured polar dataset with Spitfire Cloud.
    polarModel: {
      type: "measured",
      axisTiltDeg: 22,
      dataset: "SpitfireCloud"
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
    graphDerivedDesignEstimate: true,
    notes: "Dolby DART approved continuous SPL data",
    dolbyDartApproved: true,
    approvedContinuousSplAt1mDb: 120,
    approvedContinuousSplAt30HzDb: 118,
    approvedPeakSplDb: 126,
    approvedFrequencyRangeHz: [25, 170],
    approvedUsableLfHzMinus6dB: 22,
    frequency_response_curve: [[20.00,109.83],[20.67,110.27],[21.36,110.70],[22.07,111.13],[22.81,111.54],[23.57,112.39],[24.36,113.21],[25.17,114.01],[26.01,114.79],[26.88,115.54],[27.78,116.22],[28.70,116.83],[29.66,117.38],[30.65,117.85],[31.68,118.26],[32.73,118.61],[33.83,118.88],[34.96,119.08],[36.12,119.22],[37.33,119.33],[38.58,119.42],[39.86,119.48],[41.20,119.53],[42.57,119.56],[43.99,119.56],[45.46,119.55],[46.98,119.51],[48.55,119.47],[50.17,119.41],[51.84,119.34],[53.58,119.24],[55.37,119.14],[57.21,119.01],[59.12,118.87],[61.10,118.71],[63.14,118.54],[65.25,118.35],[67.43,118.14],[69.68,117.90],[72.00,117.65],[74.41,117.37],[76.89,117.06],[79.46,116.73],[82.11,116.36],[84.85,115.97],[87.69,115.53],[90.62,115.33],[93.64,115.11],[96.77,114.89],[100.00,114.65],[125,116.5],[160,115.5],[200,114.5]]
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
    graphDerivedDesignEstimate: true,
    notes: "Dolby DART approved continuous SPL data",
    dolbyDartApproved: true,
    approvedContinuousSplAt1mDb: 125,
    approvedContinuousSplAt30HzDb: 122,
    approvedPeakSplDb: 131,
    approvedFrequencyRangeHz: [25, 170],
    approvedUsableLfHzMinus6dB: 22,
    frequency_response_curve: [[20.00,114.88],[20.96,115.45],[21.97,116.02],[23.03,116.59],[24.14,117.74],[25.30,118.86],[26.51,119.88],[27.79,120.80],[29.13,121.62],[30.53,122.32],[32.00,122.90],[33.54,123.35],[35.15,123.69],[36.84,123.98],[38.61,124.22],[40.47,124.42],[42.42,124.58],[44.46,124.71],[46.60,124.80],[48.84,124.87],[51.19,124.92],[53.65,124.95],[56.24,124.97],[58.94,124.99],[61.78,125.01],[64.75,125.02],[67.86,125.05],[71.13,125.07],[74.55,125.11],[78.14,125.16],[81.90,125.22],[85.84,125.30],[89.97,125.39],[94.30,125.50],[98.83,125.63],[103.59,125.76],[108.57,125.91],[113.80,126.06],[119.27,126.17],[125.01,126.23],[131.03,126.18],[137.33,125.96],[143.94,125.53],[150.86,124.83],[158.12,123.84],[165.73,122.54],[173.70,120.96],[182.06,120.20],[190.82,119.33],[200.00,118.36]]
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
    graphDerivedDesignEstimate: true,
    notes: "Dolby DART approved continuous SPL data",
    dolbyDartApproved: true,
    approvedContinuousSplAt1mDb: 126,
    approvedContinuousSplAt30HzDb: 126,
    approvedPeakSplDb: 132,
    approvedFrequencyRangeHz: [15, 170],
    approvedUsableLfHzMinus6dB: 12,
    frequency_response_curve: [[20.00,122.84],[20.96,123.03],[21.97,123.21],[23.03,123.36],[24.14,123.70],[25.30,123.99],[26.51,124.23],[27.79,124.43],[29.13,124.59],[30.53,124.72],[32.00,124.82],[33.54,124.89],[35.15,124.93],[36.84,124.96],[38.61,124.96],[40.47,124.95],[42.42,124.93],[44.46,124.91],[46.60,124.87],[48.84,124.84],[51.19,124.81],[53.65,124.78],[56.24,124.76],[58.94,124.74],[61.78,124.73],[64.75,124.72],[67.86,124.73],[71.13,124.75],[74.55,124.77],[78.14,124.81],[81.90,124.86],[85.84,124.93],[89.97,125.01],[94.30,125.10],[98.83,125.20],[103.59,125.30],[108.57,125.40],[113.80,125.48],[119.27,125.53],[125.01,125.50],[131.03,125.37],[137.33,125.08],[143.94,124.59],[150.86,123.87],[158.12,122.89],[165.73,121.65],[173.70,120.14],[182.06,119.42],[190.82,118.60],[200.00,117.69]]
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

// GRAPH-DERIVED DESIGN ESTIMATE ACCESSORS (subwoofer product data)
// continuousSplOffsetDb is an adjustable, isolated safety derating applied ONLY to
// RP22 Parameter 14 (long-term continuous SPL). It must NOT be treated as fact until
// Artcoustic confirms whether the source graph represents peak, continuous, or design-max
// output. Defaults to 0 for any model without the flag (legacy/generic curves unaffected).
export function isGraphDerivedEstimate(modelKey) {
  const key = normaliseModelKey(modelKey);
  const model = MODELS.find(m => m.key === key);
  return !!model?.graphDerivedDesignEstimate;
}

// Approved Dolby DART continuous SPL data — used directly for RP22 Parameter 14.
// Returns null if the model has no approved DART data (P14 falls back to graph-derived value).
export function getApprovedContinuousSplDb(modelKey) {
  const key = normaliseModelKey(modelKey);
  const model = MODELS.find(m => m.key === key);
  return model?.dolbyDartApproved && Number.isFinite(model.approvedContinuousSplAt1mDb)
    ? model.approvedContinuousSplAt1mDb
    : null;
}

export function getApprovedContinuousSplAt30HzDb(modelKey) {
  const key = normaliseModelKey(modelKey);
  const model = MODELS.find(m => m.key === key);
  return model?.dolbyDartApproved && Number.isFinite(model.approvedContinuousSplAt30HzDb)
    ? model.approvedContinuousSplAt30HzDb
    : null;
}

export function getApprovedPeakSplDb(modelKey) {
  const key = normaliseModelKey(modelKey);
  const model = MODELS.find(m => m.key === key);
  return model?.dolbyDartApproved && Number.isFinite(model.approvedPeakSplDb)
    ? model.approvedPeakSplDb
    : null;
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
    if (m.hiddenFromSelector) return; // Legacy models: excluded from selectors, still resolvable via getSpeakerModelMeta
    if (byCat[m.category]) { // Ensure category exists before pushing
      byCat[m.category].push(m); 
    }
  });
  const ordered = {};
  CATEGORY_ORDER.forEach(cat => { ordered[cat] = byCat[cat] || []; });
  return ordered;
}

export default { getSpeakerModelMeta, getModelsByCategoryOrdered, normaliseModelKey, getSubResponseCurve, getSubwooferCurve, isValidCurve, getSpeakerPriceGbp, hasSpeakerModel, isGraphDerivedEstimate, getApprovedContinuousSplDb, getApprovedContinuousSplAt30HzDb, getApprovedPeakSplDb, CATEGORY_ORDER, MODELS };