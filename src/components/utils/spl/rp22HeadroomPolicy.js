// rp22HeadroomPolicy.js
// ---------------------------------------------------------------------------
// Central Sound Proof RP22 headroom policy.
//
// Sound Proof grades P12/P13 from the DESIGN SPL — the capability that remains
// after the amplifier/EQ headroom the design reserves — not from the raw 1 m
// capability. Artcoustic rows are graded from their published (headroom
// inclusive) authority; competitor rows are graded by subtracting the same
// reserve in the SPL engine.
//
// The reserve is expressed here as the positive number of dB that
// centralSplEngine's `eqHeadroom_dB` subtracts. This is the single place to
// change the policy — every competitor grade and every hover figure reads it.
// ---------------------------------------------------------------------------

export const RP22_EQ_HEADROOM_RESERVE_DB = 6; // −6 dB Sound Proof design headroom
export const RP22_EQ_HEADROOM_LABEL = '−6 dB'; // display form