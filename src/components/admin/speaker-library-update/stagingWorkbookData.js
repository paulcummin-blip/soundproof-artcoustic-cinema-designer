// stagingWorkbookData.js
// ---------------------------------------------------------------------------
// The staging workbook extracted from the attached RP22 Comparison brands
// update (dea383e52_RP22Comparison-BrandsUpdated.xlsx). 67 unique speaker
// models across 9 manufacturers, each carrying only a manufacturer reference
// URL — no technical specifications, no prices. Plus 21 brands listed without
// models, used to populate manufacturer options only.
//
// This is a frozen snapshot of the workbook the administrator supplied. The
// review page diffs it against the live Speaker Database; nothing here is
// authoritative and nothing here is written until the administrator approves.

export const STAGING_WORKBOOK_FILE = "RP22Comparison-BrandsUpdated.xlsx";

// manufacturer, model, url (manufacturer reference link, or null)
export const STAGING_MODELS = [
  { manufacturer: "M&K Sound", model: "S300", url: "https://www.mksound.com/wp-content/uploads/2018/03/S300-series-White-Paper-May2014_final3.pdf" },
  { manufacturer: "M&K Sound", model: "MP300", url: "https://www.mksound.com/wp-content/uploads/2018/03/S300-series-White-Paper-May2014_final3.pdf" },
  { manufacturer: "M&K Sound", model: "IW5", url: "https://www.mksound.com/wp-content/uploads/2020/04/MK-IW5-85-95-manual_udskudt_rev2.pdf" },
  { manufacturer: "M&K Sound", model: "IW85", url: "https://www.mksound.com/wp-content/uploads/2020/04/MK-IW5-85-95-manual_udskudt_rev2.pdf" },
  { manufacturer: "M&K Sound", model: "IW19", url: "https://www.mksound.com/wp-content/uploads/2020/04/MK-IW5-85-95-manual_udskudt_rev2.pdf" },
  { manufacturer: "M&K Sound", model: "IW500", url: "https://www.mksound.com/wp-content/uploads/2024/02/2024_02_11-IW500-manual_rev-5_web.pdf" },
  { manufacturer: "Ascendo Immersive Audio", model: "THE5 PASSIVE", url: "https://www.aia-cinema.com/downloads/technical-data-the5-p-ow" },
  { manufacturer: "Ascendo Immersive Audio", model: "THE6 PASSIVE", url: "https://www.aia-cinema.com/downloads/technical-data-the6-p-ow" },
  { manufacturer: "Ascendo Immersive Audio", model: "THE6 PRO PASSIVE", url: "https://www.aia-cinema.com/downloads/technical-data-the6-pro-p-ow" },
  { manufacturer: "Ascendo Immersive Audio", model: "THE10 PRO PASSIVE", url: "https://www.aia-cinema.com/downloads/technical-data-the10-p-ow" },
  { manufacturer: "Ascendo Immersive Audio", model: "THE12 PASSIVE", url: "https://www.aia-cinema.com/downloads/technical-data-the12-p-ow-1" },
  { manufacturer: "Ascendo Immersive Audio", model: "THE12 PRO PASSIVE", url: "https://www.aia-cinema.com/downloads/technical-data-the12-pro-p-ow" },
  { manufacturer: "Ascendo Immersive Audio", model: "THE15 PRO PASSIVE", url: "https://www.aia-cinema.com/downloads/technical-data-the15-pro-p-ow" },
  { manufacturer: "Ascendo Immersive Audio", model: "THE12 Be PRO PASSIVE", url: "https://www.aia-cinema.com/downloads/technical-data-the12-be-pro-p-ow" },
  { manufacturer: "KEF", model: "Ci5160REFM-THX", url: null },
  { manufacturer: "Monitor Audio", model: "W1M", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/w1m/#specs" },
  { manufacturer: "Monitor Audio", model: "W1M-E", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/w1m-e/#specs" },
  { manufacturer: "Monitor Audio", model: "W1L", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/w1l/#specs" },
  { manufacturer: "Monitor Audio", model: "W2M", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/w2m/#specs" },
  { manufacturer: "Monitor Audio", model: "W2L", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/w2l/#specs" },
  { manufacturer: "Monitor Audio", model: "W2M-CP", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/w2m-cp/#specs" },
  { manufacturer: "Monitor Audio", model: "W3M", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/w3m/#specs" },
  { manufacturer: "Monitor Audio", model: "W3L", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/w3l/#specs" },
  { manufacturer: "Monitor Audio", model: "WSS130", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/wss130/#specs" },
  { manufacturer: "Monitor Audio", model: "WSS230", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/wss230/#specs" },
  { manufacturer: "Monitor Audio", model: "WSS430", url: "https://www.monitoraudio.com/en/product-ranges/creator-series/wss430/#specs" },
  { manufacturer: "Monitor Audio", model: "Platinum In-Wall 3G", url: "https://www.monitoraudio.com/en/product-ranges/platinum-ci/platinum-in-wall-3g/" },
  { manufacturer: "Monitor Audio", model: "Sinergy 100", url: "https://www.monitoraudio.com/en/product-ranges/cinergy/cinergy-100/" },
  { manufacturer: "Monitor Audio", model: "Sinergy 200", url: "https://www.monitoraudio.com/en/product-ranges/cinergy/cinergy-200/" },
  { manufacturer: "Monitor Audio", model: "Sinergy 300", url: "https://www.monitoraudio.com/en/product-ranges/cinergy/cinergy-300/" },
  { manufacturer: "Sonance", model: "R1", url: "https://images.salsify.com/images/hkhyk3cbt2fmhzfujdoi/R1_R2_Reference_In-Wall_SONANCE_Data_Sheet.pdf" },
  { manufacturer: "Sonance", model: "R2", url: "https://images.salsify.com/images/hkhyk3cbt2fmhzfujdoi/R1_R2_Reference_In-Wall_SONANCE_Data_Sheet.pdf" },
  { manufacturer: "James Loudspeaker", model: "BE806 MKII", url: "https://images.salsify.com/images/sg2ui1zuvue8xxxm0ios/BE806%20MKII_JAMES_Data_Sheet.pdf" },
  { manufacturer: "James Loudspeaker", model: "BE808 MKII", url: "https://images.salsify.com/images/akwlabmjkmmpc0vgxyiq/BE808%20MKII_JAMES_Data_Sheet.pdf" },
  { manufacturer: "James Loudspeaker", model: "BE812 MKII", url: "https://images.salsify.com/images/jle96l5muxx7b2cuocnq/BE812%20MKII_JAMES_Data_Sheet.pdf" },
  { manufacturer: "James Loudspeaker", model: "QX-BE806 MKII", url: "https://images.salsify.com/images/d2biykrvq2o9rmmuggu4/QX-BE806_MKII_JAMES_Data%20Sheet.pdf" },
  { manufacturer: "James Loudspeaker", model: "QX530QT", url: "https://images.salsify.com/images/nitanslymqcilogeec4x/QX530QT_JAMES_Data_Sheet.pdf" },
  { manufacturer: "James Loudspeaker", model: "QX630QT", url: "https://images.salsify.com/images/m4hb3hxhbtslw2q2fy41/QX630QT_JAMES_Data_Sheet.pdf" },
  { manufacturer: "James Loudspeaker", model: "QX830QT", url: "https://images.salsify.com/images/rbu73st9bgqqqqneh28l/QX830QT_JAMES_Data_Sheet.pdf" },
  { manufacturer: "James Loudspeaker", model: "SA63-4", url: "https://images.salsify.com/images/lpv6wokcvadusmx2pzof/SA63-4_JAMES_data_sheet.pdf" },
  { manufacturer: "Wisdom Audio", model: "P2i", url: "https://www.wisdomaudio.com/wp-content/uploads/2024/08/Inisght-Series-In-Wall-and-In-Ceiling-Datasheet-2024.pdf" },
  { manufacturer: "Wisdom Audio", model: "P4i", url: "https://www.wisdomaudio.com/wp-content/uploads/2024/08/Inisght-Series-In-Wall-and-In-Ceiling-Datasheet-2024.pdf" },
  { manufacturer: "Wisdom Audio", model: "P6i", url: "https://www.wisdomaudio.com/wp-content/uploads/2024/08/Inisght-Series-In-Wall-and-In-Ceiling-Datasheet-2024.pdf" },
  { manufacturer: "Wisdom Audio", model: "L8i", url: "https://www.wisdomaudio.com/wp-content/uploads/2024/08/Inisght-Series-In-Wall-and-In-Ceiling-Datasheet-2024.pdf" },
  { manufacturer: "Triad", model: "TS-CREF-IWLCR", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/6a56605883051555b02d089e_074_25_Triad%20Cinema%20Reference-IWLCR.pdf" },
  { manufacturer: "Triad", model: "TS-IRLCR4", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/691cc061f16b28198c28bcd7_742_25_Triad-IRCenter-IR-LCR-OW-Surrounds-DataSheet_v6.pdf" },
  { manufacturer: "Triad", model: "TS-IRLCR5", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/691cc061f16b28198c28bcd7_742_25_Triad-IRCenter-IR-LCR-OW-Surrounds-DataSheet_v6.pdf" },
  { manufacturer: "Triad", model: "TS-IRLCR6", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/691cc061f16b28bcd7_742_25_Triad-IRCenter-IR-LCR-OW-Surrounds-DataSheet_v6.pdf" },
  { manufacturer: "Triad", model: "TS-ICSAT4", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/68a4d4b31b9a9d940044efa1_Data%20Sheet%20-%20Triad%20Wave%203%20In-Wall%20and%20In-Ceiling%20Satellite%20Speakers_v3.pdf" },
  { manufacturer: "Triad", model: "TS-ICSAT5", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/68a4d4b31b9a9d940044efa1_Data%20Sheet%20-%20Triad%20Wave%203%20In-Wall%20and%20In-Ceiling%20Satellite%20Speakers_v3.pdf" },
  { manufacturer: "Triad", model: "TS-ICSAT6", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/68a4d4b31b9a9d940044efa1_Data%20Sheet%20-%20Triad%20Wave%203%20In-Wall%20and%20In-Ceiling%20Satellite%20Speakers_v3.pdf" },
  { manufacturer: "Triad", model: "TS-IWSAT4", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/68a4d4b31b9a9d940044efa1_Data%20Sheet%20-%20Triad%20Wave%203%20In-Wall%20and%20In-Ceiling%20Satellite%20Speakers_v3.pdf" },
  { manufacturer: "Triad", model: "TS-IWSAT5", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/68a4d4b31b9a9d940044efa1_Data%20Sheet%20-%20Triad%20Wave%203%20In-Wall%20and%20In-Ceiling%20Satellite%20Speakers_v3.pdf" },
  { manufacturer: "Triad", model: "TS-IWSAT6", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/68a4d4b31b9a9d940044efa1_Data%20Sheet%20-%20Triad%20Wave%203%20In-Wall%20and%20In-Ceiling%20Satellite%20Speakers_v3.pdf" },
  { manufacturer: "Triad", model: "TS-IWLCR4", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/67e402fd96f434fa29c2a9f6_TS-IWLCR-Datasheet.pdf" },
  { manufacturer: "Triad", model: "TS-IWLCR5", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/67e402fd96f434fa29c2a9f6_TS-IWLCR-Datasheet.pdf" },
  { manufacturer: "Triad", model: "TS-IWLCR6", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/67e402fd96f434fa29c2a9f6_TS-IWLCR-Datasheet.pdf" },
  { manufacturer: "Triad", model: "Silver Monitor InWall 4", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/6581b2c1cec3834791a10fe9_triad-silver-monitors-triad-data-sheet-rev-a.pdf" },
  { manufacturer: "Triad", model: "Silver Monitor InWall 6", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/6581b2c1cec3834791a10fe9_triad-silver-monitors-triad-data-sheet-rev-a.pdf" },
  { manufacturer: "Triad", model: "Series 5 TS-PDX-IW65", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/6581a9830c039a3a1dafa27c_PDX_DataSheet%206.24.pdf" },
  { manufacturer: "Triad", model: "Series 5 TS-PDX-IW85", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/6581a9830c039a3a1dafa27c_PDX_DataSheet%206.24.pdf" },
  { manufacturer: "Triad", model: "Bronze Monitor InWall 4", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/6580ec418ea61819a0ac9903_triad-bronze-sats-triad-data-sheet-rev-a.pdf" },
  { manufacturer: "Triad", model: "Bronze OnWall", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/6580ea0779ce0291453526fb_triad-bronze-lcrs-triad-data-sheet-rev-a.pdf" },
  { manufacturer: "Triad", model: "Gold LCR", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/6581031aac4fe2895770fc92_triad-gold-lcrs-triad-data-sheet-rev-a.pdf" },
  { manufacturer: "Triad", model: "Gold Omni InWall 4", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/65810168e707ad13a177eaef_triad-gold-omnis-triad-data-sheet-rev-a.pdf" },
  { manufacturer: "Triad", model: "Gold Monitor InWall 6", url: "https://cdn.prod.website-files.com/6580194dfc1deea0c0f8ceab/658103ab8164247f73b62ea7_triad-gold-monitors-triad-data-sheet-rev-b.pdf" },
  { manufacturer: "Bowers & Wilkins", model: "CT8 LCR", url: "https://www.bowerswilkins.com/on/demandware.static/-/Library-Sites-bowers_europe_shared/default/dwfae80a6c/PDPDocumentation/BW-CT8-LR-Information-Sheet-2025-update.pdf" },
];

// 21 brands listed without models — used to populate manufacturer options only.
export const STAGING_BRANDS_WITHOUT_MODELS = [
  "JBL", "Origin Acoustics", "Sonos", "DALI", "Episode", "Amina", "Krix",
  "Steinway Lyngdorf", "Focal", "Klipsch", "Leon", "Paradigm", "Loxone",
  "Polk Audio", "Stealth Acoustics", "Meridian", "L-Acoustics", "PMC",
  "Dynaudio", "Totem", "Sonus Faber",
];