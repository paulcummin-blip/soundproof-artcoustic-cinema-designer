// rp22HeadroomPolicy.js
// ---------------------------------------------------------------------------
// Central Sound Proof RP22 headroom policy.
//
// Sound Proof grades P12/P13 from the DESIGN SPL — the capability that remains
// after the amplifier/EQ headroom the design reserves — not from the raw 1 m
// capability. The same reserve is applied to every graded row on the RP22
// Speaker Capability page, Artcoustic and competitor alike, so both columns are
// stated in the same units and neither side is marked down — or up — by policy.
//
// The reserve is the positive number of dB that centralSplEngine's
// `eqHeadroom_dB` subtracts.
// ---------------------------------------------------------------------------

import { RP22_CALIBRATION_HEADROOM_DB } from "@/components/constants/calibration";

// The reserve IS the app's existing central post-calibration headroom value — the
// same one applyCalibrationHeadroom() and the Room Designer's System Performance
// view use. One policy, one number, no private copy.
export const RP22_EQ_HEADROOM_RESERVE_DB = RP22_CALIBRATION_HEADROOM_DB; // −6 dB design headroom
export const RP22_EQ_HEADROOM_LABEL = `−${RP22_CALIBRATION_HEADROOM_DB} dB`; // display form