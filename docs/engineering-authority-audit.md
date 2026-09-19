# Engineering Authority Audit

**Date:** 2026-09-19
**Auditor:** Base44 Engineering
**Subject:** Engineering Authority v1.0 — Validation & Certification
**Method:** Field-by-field comparison of every Engineering Authority builder against the existing application's canonical engineering sources.

---

## Executive Summary

| Authority | Verdict | Critical Issues |
|-----------|---------|----------------|
| Project | **PASS** | None |
| Room | **WARNING** | Room classification is an interpretation with no existing application counterpart to verify against. Acoustic treatment description contains mild marketing language. |
| System | **PASS** | Minor redundancy between `configuration`, `channel_layout`, and `topology`. |
| RP22 | **WARNING** | Parameters P3, P7, P8, P11 are missing. Design Rating field names are unverified. |
| Bass | **PASS** | Correctly reads from `completedBassPresentation`. P14 achieved-vs-selected level distinction is correct. |
| Product | **FAIL** | `CONFIDENCE.PUBLISHED_SPEC_A/B/C/D` constants referenced in code do not exist in `confidence.js` — all product confidence values resolve to `undefined` (treated as 0.0). |
| Image | **PASS** | Placement suggestions are static interpretations (no existing counterpart), but field mapping is correct. |
| Dealer | **PASS** | All fields match BrandAsset entity. |
| Metadata | **PASS** | Narrative goals match `proposalSections.js`. |
| Confidence | **WARNING** | Constants are fixed; should be calculated from source evidence. See § Confidence Audit. |

**Overall:** Engineering Authority is structurally sound and faithful to the application's engineering in 8 of 10 authorities. One blocking bug (Product Authority confidence) must be fixed before certification. Two warnings (missing RP22 parameters, room classification interpretation) should be addressed before Proposal Intelligence consumes the object.

---

## 1. Project Authority — PASS

### Fields Verified

| EA Field | Source | Application Source | Match |
|----------|--------|-------------------|-------|
| `project_name` | `project.name` | Project entity `name` | ✅ |
| `client_name` | `project.client_name` | Project entity `client_name` | ✅ |
| `dealer_company` | Backfilled from `buildDealerAuthority` | BrandAsset `company_name` | ✅ |
| `version_id` | `version.id` | ProjectVersion entity `id` | ✅ |
| `version_name` | `version.version_name` | ProjectVersion entity `version_name` (default "Current Design") | ✅ |
| `version_number` | `version.version_number` | ProjectVersion entity `version_number` | ✅ |
| `date` | `new Date().toISOString()` | N/A (generation date) | ✅ |

### Notes
- `date` is the authority generation date, not the project creation date or proposal date. This is correct for the authority's purpose but should be documented as `generated_date` to avoid confusion with `proposal_date`.

---

## 2. Room Authority — WARNING

### Fields Verified

| EA Field | Source | Application Source | Match |
|----------|--------|-------------------|-------|
| `dimensions` | `parseRoomDims(project)` | Project `roomDims` JSON / legacy `room_width/length/height` | ✅ |
| `dimensions_text` | Formatted from dimensions | N/A (new formatting) | ✅ |
| `volume_m3` | `widthM × lengthM × heightM` | Computed | ✅ |
| `classification` | `classifyRoom(w, l, h)` | **No existing counterpart** | ⚠️ |
| `ratio` | `classifyRoom` ratio_description | **No existing counterpart** | ⚠️ |
| `acoustic_implication` | `classifyRoom` acoustic_implication | **No existing counterpart** | ⚠️ |
| `screen_wall.construction_type` | `project.screen_mount_mode` | Project `screen_mount_mode` (baffle/floating) | ✅ |
| `screen_wall.detail` | Formatted from mode + `float_depth_m` | Project `float_depth_m` | ✅ |
| `screen_wall.engineering_purpose` | Static interpretation | **No existing counterpart** | ⚠️ |
| `seating.row_count` | `seats_per_row_by_row.length` | Project `seats_per_row_by_row` | ✅ |
| `seating.total_seats` | Sum of `seats_per_row_by_row` | Project `seats_per_row_by_row` | ✅ |
| `seating.row_spacing_m` | `project.row_spacing_m` | Project `row_spacing_m` (default 1.8) | ✅ |
| `seating.mlp_basis` | `project.mlp_basis` | Project `mlp_basis` (default "middle") | ✅ |
| `acoustic_treatment.enabled` | `project.acoustic_treatment_enabled` | Project `acoustic_treatment_enabled` | ✅ |
| `acoustic_treatment.quantity` | `project.selected_abfuser_qty` | Project `selected_abfuser_qty` | ✅ |
| `acoustic_treatment.source` | `project.abfuser_qty_source` | Project `abfuser_qty_source` | ✅ |

### Issues

**WARNING 2a — Room classification is unverifiable.**
The `classifyRoom` function introduces three classifications ("golden ratio room", "long tunnel room", "near-cubic room") and acoustic implications that do not exist anywhere else in the application. There is no canonical room classification in the Room Designer, Technical Report, or Compliance Report to verify against. The golden ratio check (L ≈ 2h, W ≈ 1.5h, 15% tolerance) is a reasonable acoustic heuristic but is an interpretation, not a verified application fact.

**WARNING 2b — Acoustic treatment description contains mild marketing language.**
The interpretation string reads: "The Abfuser provides broad-band absorption and diffusion to control early reflections and room reverberation." The phrase "broad-band absorption and diffusion" is a product claim, not a verified engineering measurement. Engineering Authority should state the engineering function (absorption + diffusion) without promotional adjectives.

**WARNING 2c — Screen wall engineering purpose is a static string.**
The `engineering_purpose` text is a hardcoded string, not derived from the project's actual construction. For example, a project with `show_cavity = true` but no floating depth will get the "cavity construction" interpretation, which may not match the actual construction intent.

### Missing Room Engineering
- **Screen dimensions** — `screen_size`, `aspect_ratio`, `screen_height_from_floor`, `manual_dimensions`, `manual_width_m`, `manual_height_m` are not exposed.
- **Screen front plane** — `screen_front_plane_m` is not exposed.
- **Room orientation** — `room_orientation` (length_front / width_front) is not exposed.
- **Screen wall** — `screen_wall` (front/back/left/right) is not exposed.
- **RSP mode** — `rsp_mode`, `manual_rsp_y_m`, `manual_rsp_x_m`, `designated_rsp_seat_id` are not exposed.

---

## 3. System Authority — PASS

### Fields Verified

| EA Field | Source | Application Source | Match |
|----------|--------|-------------------|-------|
| `configuration.dolby_config` | `project.dolby_config` | Project `dolby_config` | ✅ |
| `configuration.bed_channels` | Parsed from dolby_config | `parseInt(parts[0])` | ✅ |
| `configuration.overhead_channels` | Parsed from dolby_config | `parseInt(parts[2])` | ✅ |
| `configuration.total_discrete_channels` | bed + overhead | Computed | ✅ |
| `channel_layout` | Same as configuration | Computed | ✅ (redundant) |
| `product_roles` | `selected_speakers_by_role` | Project `selected_speakers_by_role` | ✅ |
| `subwoofer_strategy.count` | `subwooferInstances.filter(enabled)` | Project `subwooferInstances` | ✅ |
| `subwoofer_strategy.instances` | Mapped from `subwooferInstances` | Project `subwooferInstances` | ✅ |
| `subwoofer_strategy.models` | Unique models from instances | Computed | ✅ |
| `amplification.power_w` | `project.amplifier_power` | Project `amplifier_power` | ✅ |
| `topology.overhead` | `overhead_global_model` + overrides | Project `overhead_global_model`, `use_front/mid/rear_global`, `overhead_front/mid/rear_override` | ✅ |

### Issues

**Minor redundancy 3a** — `configuration`, `channel_layout`, and `topology.channel_layout` all contain the same Dolby config breakdown. Proposal Intelligence should consume `configuration` only; `channel_layout` and `topology.channel_layout` are duplicates.

**Minor redundancy 3b** — `product_roles` in System Authority overlaps with `products` in Product Authority. System has role + model_key + label + category; Product has full specs. This is acceptable (summary vs detail) but should be documented.

**WARNING 3c — Subwoofer strategy text is interpretive.**
The `strategy_text` for 1 subwoofer says "Bass response will be position-dependent with significant seat-to-seat variation." This is an engineering prediction, not a measured fact. It is reasonable but should carry a confidence value reflecting that it's a general acoustic principle, not a project-specific calculation.

### Missing System Engineering
- **Seven-bed layout type** — `seven_bed_layout_type` (rears/wides) is not exposed.
- **Front wides enabled** — `enable_front_wides` is not exposed.
- **LCR aim mode** — `lcr_aim_mode` (flat/angled) is not exposed.
- **Speaker clearance** — `speaker_clearance_m` is not exposed.

---

## 4. RP22 Authority — WARNING

### Parameter Coverage

| Parameter | In EA? | Scope | Application Source | Verdict |
|-----------|--------|-------|-------------------|---------|
| P1 (seat-to-wall) | ✅ | Seat | `analysisResult.gradedParameters.primary[1]` | PASS |
| P2 (channel count) | ✅ | Room | `analysisResult.gradedParameters.primary[2]` | PASS |
| P3 (screen outside zones) | ❌ | Room | `analysisResult.gradedParameters.primary[3]` | **MISSING** |
| P4 (screen SPL delta) | ✅ | Seat | `analysisResult.gradedParameters.primary[4]` | PASS |
| P5 (surround spacing) | ✅ | Seat | `analysisResult.gradedParameters.primary[5]` | PASS |
| P6 (surround SPL delta) | ✅ | Seat | `analysisResult.gradedParameters.primary[6]` | PASS |
| P7 (wide deviation) | ❌ | Room | `analysisResult.gradedParameters.primary[7]` | **MISSING** |
| P8 (upfiring allowed) | ❌ | Room | `analysisResult.gradedParameters.primary[8]` | **MISSING** |
| P9 (overhead spacing) | ✅ | Seat | `analysisResult.gradedParameters.primary[9]` | PASS |
| P10 (overhead SPL delta) | ✅ | Seat | `analysisResult.gradedParameters.primary[10]` | PASS |
| P11 (surround outside zones) | ❌ | Room | `analysisResult.gradedParameters.primary[11]` | **MISSING** |
| P12 (screen SPL capability) | ✅ | Room | `analysisResult.gradedParameters.primary[12]` | PASS |
| P13 (non-screen SPL) | ✅ | Room | `analysisResult.gradedParameters.primary[13]` | PASS |
| P14 (LFE SPL) | Bass Authority | Room | `completedBassPresentation.parameters.p14` | PASS |
| P15 (noise floor) | ✅ (assumed) | — | `project.assumed_p15_level` | PASS |
| P16 (screen FR variance) | ✅ | Seat | `analysisResult.gradedParameters.primary[16]` | PASS |
| P17 (surround FR variance) | ✅ | Seat | `analysisResult.gradedParameters.primary[17]` | PASS |
| P18 (bass extension) | Bass Authority | Room | `completedBassPresentation.parameters.p18` | PASS |
| P19 (LF response) | Bass Authority | Room | `completedBassPresentation.parameters.p19` | PASS |
| P20 (LF consistency) | Bass Authority | Seat | `completedBassPresentation.parameters.p20` | PASS |
| P21 (early reflections) | ✅ (assumed) | — | `project.assumed_p21_level` | PASS |

### Interpretation Verification

Each interpretation function in `rp22ParameterInterpretations.js` was verified against the official RP22 parameter definitions in `rp22Parameters.jsx`:

| Param | Official RP22 Name | EA Interpretation | Correct? |
|-------|--------------------|-------------------|---------|
| P1 | Minimum distance to walls | "All seating positions maintain {val} separation from the nearest wall" | ✅ |
| P2 | Discrete speaker configuration | "{count} discrete channels provide full spatial resolution" | ✅ |
| P4 | Max SPL difference (screen) | "Screen wall speakers are matched to within {val}" | ✅ |
| P5 | Max angle between surrounds | "Adjacent surround speakers are spaced at most {val} apart" | ✅ |
| P6 | Max SPL difference (surround) | "Surround speakers are matched to within {val}" | ✅ |
| P9 | Max vertical angle (upper) | "Adjacent overhead speakers are spaced at most {val} apart" | ✅ |
| P10 | Max SPL difference (upper) | "Overhead speakers are matched to within {val}" | ✅ |
| P12 | Screen SPL capability | "Screen wall speakers achieve {val} long-term SPL capability" | ✅ |
| P13 | Non-screen SPL capability | "Surround and overhead speakers achieve {val} long-term SPL capability" | ✅ |
| P16 | Screen FR variance | "Screen wall speaker frequency response varies by no more than {val}" | ✅ |
| P17 | Surround FR variance | "Surround and overhead speaker frequency response varies by no more than {val}" | ✅ |
| P15 | Background noise floor | "Assumed background noise floor at NCB {val}" | ✅ |
| P21 | Early reflections | "Assumed early reflections at {val} dB relative to direct sound" | ✅ |

**No engineering meaning has been invented.** All interpretations are faithful to the RP22 definitions. No exaggeration or understatement detected.

### Issues

**WARNING 4a — Parameters P3, P7, P8, P11 are missing.**
These are Room-scope parameters that the application calculates:
- P3 (screen speakers outside zones) — always L4 when 0 speakers are outside zones
- P7 (wide speaker deviation) — applicable when front wides are enabled
- P8 (upfiring/elevation allowed) — Yes/No design choice
- P11 (surround/wide/upper outside zones) — always L4 when 0 speakers are outside zones

P3 and P11 are typically always L4 (0 speakers outside zones) and may seem trivial, but their absence means the authority cannot claim "all speakers are within recommended zonal locations" — a fact the application already verifies.

**WARNING 4b — Design Rating field names are unverified.**
`buildDesignRatingEntry` reads `designRating.percentage`, `designRating.label`, and `designRating.level`. The actual return shape of `useAppDesignRating` was not fully verified in this audit. If the field names differ (e.g., `score` instead of `percentage`, `ratingLabel` instead of `label`), the design rating statement will fall back to defaults.

**WARNING 4c — P12/P13 assessment mode is not exposed.**
The application has P12/P13 mode (minimum/recommended) which affects the level threshold. `roomParameterLevelAuthority.js` re-grades P12/P13 based on the selected mode. The EA does not expose which mode was used, so the achieved level cannot be interpreted without this context.

**WARNING 4d — P18 basis is not exposed.**
The application has P18 basis (minimum/recommended) which affects the threshold. `roomParameterLevelAuthority.js` uses `p18ThresholdsForBasis(basis)`. The EA does not expose which basis was used.

---

## 5. Bass Authority — PASS

### Fields Verified

| EA Field | Source | Application Source | Match |
|----------|--------|-------------------|-------|
| `p14.achieved_capability_db` | `p14.achievedCapabilityDb` | `buildP14Fields` in `bassCompliancePresentation.js` | ✅ |
| `p14.requested_target_db` | `p14.requestedTargetDb` | `buildP14Fields` | ✅ |
| `p14.headroom_or_shortfall_db` | `p14.headroomOrShortfallDb` | `buildP14Fields` | ✅ |
| `p14.achieved_level` | `p14.achievedLevel` | `buildP14Fields` | ✅ |
| `p14.selected_level` | `p14.selectedLevel` | `buildP14Fields` | ✅ |
| `p14.pass` | `p14.pass` | `buildP14Fields` | ✅ |
| `p18.design_hz` | `p18.designHz` | `buildP18Fields` | ✅ |
| `p18.qualified_at_selected_p14` | `p18.qualifiedAtSelectedP14Output` | `buildP18Fields` | ✅ |
| `p19.raw_value` | `p19.rawValue` | `formatAuthoritativeBassParameter` | ✅ |
| `p19.per_seat` | `contract.selectedCandidate.perSeatP19Results` | `bassCompliancePresentation.js` | ✅ |
| `p20.raw_value` | `p20.rawValue` | `formatAuthoritativeBassParameter` | ✅ |
| `p20.per_seat` | `presentation.perSeatP20Results` | `bassCompliancePresentation.js` | ✅ |
| `available` | `contract && authoritative && publicationVerified` | `resolvePublicationState` | ✅ |

### Key Verification

**P14 achieved-vs-selected level distinction** — The application's `bassCompliancePresentation.js` sets `p14.level` to the SELECTED level (user's target), not the achieved level. The EA correctly reads `p14.achievedLevel` (from `buildP14Fields`) for the `achieved_level` field, not `p14.level`. This is correct and important — it means the EA reports what the system actually achieved, not what was targeted.

**Per-seat result structure** — Each per-seat result has `seatId`, `variationDbRaw`, and `level`. The EA correctly maps these to `seat_id`, `variation_db_raw`, and `level`.

### Issues

No issues found. The Bass Authority faithfully reads from the existing `completedBassPresentation` and `completedBassAuthority` objects.

---

## 6. Product Authority — FAIL

### Fields Verified

| EA Field | Source | Application Source | Match |
|----------|--------|-------------------|-------|
| `model_key` | `meta.key` | `getSpeakerModelMeta` return | ✅ |
| `label` | `meta.label` | `getSpeakerModelMeta` return | ✅ |
| `category` | `meta.category` | `getSpeakerModelMeta` return | ✅ |
| `specifications.sensitivity_db_1w_1m` | `meta.sensitivity_dB_1w1m` | Registry field | ✅ |
| `specifications.sensitivity_db_2p83v` | `meta.sensitivity_dB_2p83` | Registry field | ✅ |
| `specifications.nominal_impedance_ohm` | `meta.nominalOhms` | Registry field | ✅ |
| `specifications.max_power_w` | `meta.max_power` | Registry field | ✅ |
| `specifications.max_continuous_spl_db_halfspace` | `meta.max_spl_cont_db_1m_halfspace` | Registry field | ✅ |
| `specifications.max_peak_spl_db_halfspace` | `meta.max_spl_peak_db_cf6_1m_halfspace` | Registry field | ✅ |
| `specifications.max_continuous_spl_db_anechoic` | `meta.max_spl_cont_db_1m_anechoic` | Registry field | ✅ |
| `specifications.frequency_response_low_hz` | `meta.frequency_response_low` | Registry field | ✅ |
| `specifications.frequency_response_high_hz` | `meta.frequency_response_high` | Registry field | ✅ |
| `specifications.usable_lf_hz_minus6db` | `meta.usable_lf_hz_minus6db` | Registry field | ✅ |
| `specifications.coverage_horizontal_deg` | `meta.coverage_deg?.horizontal` | Registry field | ✅ |
| `specifications.coverage_vertical_deg` | `meta.coverage_deg?.vertical` | Registry field | ✅ |
| `specifications.cabinet_width_mm` | `meta.widthM * 1000` | Registry field (converted) | ✅ |
| `specifications.cabinet_height_mm` | `meta.heightM * 1000` | Registry field (converted) | ✅ |
| `specifications.cabinet_depth_mm` | `meta.depthM * 1000` | Registry field (converted) | ✅ |
| `specifications.round` | `meta.round` | Registry field | ✅ |
| `specifications.front_stage_type` | `meta.frontStageType` | Registry field | ✅ |

All field names match the `getSpeakerModelMeta` return shape. ✅

### Blocking Issue

**FAIL 6a — `CONFIDENCE.PUBLISHED_SPEC_A/B/C/D` do not exist.**

`buildProductAuthority.js` lines 50-53 reference:
```js
const confidence = completeness === 3 ? CONFIDENCE.PUBLISHED_SPEC_A
  : completeness === 2 ? CONFIDENCE.PUBLISHED_SPEC_B
  : completeness === 1 ? CONFIDENCE.PUBLISHED_SPEC_C
  : CONFIDENCE.PUBLISHED_SPEC_D;
```

But `confidence.js` defines only:
```js
MEASURED, COMPUTED_GEOMETRIC, COMPUTED_SPL, MODEL_DEPENDENT, ASSUMED, ESTIMATE, NOT_CALCULATED
```

`CONFIDENCE.PUBLISHED_SPEC_A` through `D` are `undefined`. The resulting `confidence` field on every product will be `undefined`, which `withConfidence` treats as `0.0` (NOT_CALCULATED). This means every product in the authority will appear to have zero engineering confidence — directly contradicting the fact that these are published manufacturer specifications (which should have the highest confidence).

**Fix:** Add `PUBLISHED_SPEC_A` (0.95), `PUBLISHED_SPEC_B` (0.85), `PUBLISHED_SPEC_C` (0.70), `PUBLISHED_SPEC_D` (0.50) to `confidence.js`, or replace with existing constants (`COMPUTED_GEOMETRIC` for complete specs, `COMPUTED_SPL` for partial, `ESTIMATE` for minimal).

### Other Issues

**WARNING 6b — System coherence family classification is unverifiable.**
The `uniqueFamilies` classification uses regex patterns (`evolve`, `q\d+-\d+`, `architect`, `c-/multi/hspl`) that don't exist elsewhere in the application. There is no canonical "speaker family" concept in the registry to verify against.

**WARNING 6c — Engineering purpose strings are static.**
The `describeEngineeringPurpose` function returns hardcoded strings per role. These are reasonable engineering descriptions but are not derived from the actual product data. For example, a subwoofer's purpose says "Responsible for low-frequency effects and bass-managed content below the room transition frequency" — this is always the same regardless of the specific subwoofer model.

---

## 7. Image Authority — PASS

### Fields Verified

| EA Field | Source | Application Source | Match |
|----------|--------|-------------------|-------|
| `asset_type` | `asset.asset_type` | ProposalAsset `asset_type` enum | ✅ |
| `file_url` | `asset.file_url` | ProposalAsset `file_url` | ✅ |
| `caption` | `asset.caption` | ProposalAsset `caption` | ✅ |
| `category` | `asset.category` | ProposalAsset `category` enum | ✅ |
| `proposal_importance` | `asset.proposal_importance` | ProposalAsset `proposal_importance` enum | ✅ |
| `order_index` | `asset.order_index` | ProposalAsset `order_index` | ✅ |
| `suggested_placement` | Static lookup | **No existing counterpart** | ⚠️ |

### Issues

**WARNING 7a — Placement suggestions are static.**
The `PLACEMENT_SUGGESTIONS` map is a hardcoded lookup from asset type to proposal section. This is a new interpretation that doesn't exist in the application. It is reasonable but cannot be verified against existing application behaviour.

**Importance sorting** — The `IMPORTANCE_ORDER` (Essential > Preferred > Optional > Do Not Use) matches the ProposalAsset entity's `proposal_importance` enum. ✅

---

## 8. Dealer Authority — PASS

### Fields Verified

All 25+ fields were verified against the BrandAsset entity schema. Every field matches:

| Field Group | Fields | Match |
|-------------|--------|-------|
| Identity | `company_name` | ✅ |
| Contact | `address`, `telephone`, `email`, `website`, `linkedin`, `instagram`, `facebook`, `youtube` | ✅ |
| Marketing copy | `about_us`, `why_choose_us`, `warranty`, `terms_conditions` | ✅ |
| Branding | `dealer_logo_url`, `white_logo_url`, `primary_colour`, `secondary_colour`, `accent_colour` | ✅ |
| Proposal defaults | `include_about_us`, `include_warranty`, `include_product_gallery`, `include_rp22_overview`, `include_technical_appendix` | ✅ |
| Tone | `proposal_tone` | ✅ |

### Issues

No issues found. All fields and defaults match the BrandAsset entity schema exactly.

---

## 9. Proposal Metadata — PASS

### Fields Verified

| EA Field | Source | Application Source | Match |
|----------|--------|-------------------|-------|
| `narrative_goal` | `metadata.narrative_goal` | Proposal `narrative_goal` enum | ✅ |
| `narrative_goal_label` | `GOAL_LABELS` lookup | `NARRATIVE_GOALS` in `proposalSections.js` | ✅ |
| `audience` | `metadata.audience` | Proposal `metadata.audience` | ✅ |
| `language` | `metadata.language` | Proposal `metadata.language` (default "en-GB") | ✅ |
| `word_count` | `metadata.word_count` | Proposal `metadata.word_count` (default "standard") | ✅ |
| `tone` | `metadata.tone` | Proposal `metadata.tone` (default "professional") | ✅ |

### Narrative Goal Labels Cross-Check

| EA Label | proposalSections.js Label | Match |
|----------|--------------------------|-------|
| Luxury Cinema | Luxury Cinema | ✅ |
| Family Media Room | Family Media Room | ✅ |
| Reference Performance | Reference Performance | ✅ |
| Best Value | Best Value | ✅ |
| Future Proof | Future Proof | ✅ |

No issues found.

---

## 10. Confidence Audit

### Current Confidence Values

| Constant | Value | Used For | Appropriate? |
|----------|-------|----------|-------------|
| `MEASURED` | 0.99 | Room dimensions, screen wall, seating, acoustic treatment | ✅ Directly entered by user |
| `COMPUTED_GEOMETRIC` | 0.95 | P1, P5, P9, room classification, system coherence | ✅ Computed from verified geometry |
| `COMPUTED_SPL` | 0.85 | P4, P6, P10, P12, P13, P16, P17 | ✅ Computed from product specs + propagation |
| `MODEL_DEPENDENT` | 0.80 | Bass P14, P18, P19, P20 | ✅ Modal simulation model |
| `ASSUMED` | 0.60 | P15, P21 | ✅ Designer assumption, not measured |
| `ESTIMATE` | 0.50 | Not currently used | N/A |
| `NOT_CALCULATED` | 0.0 | Missing data | ✅ |

### Assessment

The confidence values are **fixed constants** — every parameter of the same type gets the same confidence regardless of the actual evidence quality. This is a reasonable starting point but should evolve:

**Recommended: Calculate confidence from source evidence.**

| Source Type | Current | Recommended | Rationale |
|------------|---------|-------------|-----------|
| Measured (room dims) | 0.99 | 0.99 | ✅ Keep — user-entered, verified |
| Published spec (complete) | N/A (bug: undefined) | 0.95 | Manufacturer-published, verified |
| Published spec (partial) | N/A (bug: undefined) | 0.80 | Some fields missing |
| Computed from geometry | 0.95 | 0.95 | ✅ Keep — deterministic |
| Computed from SPL model | 0.85 | 0.80-0.90 | Should vary by model accuracy |
| Modal simulation | 0.80 | 0.70-0.85 | Should vary by model validation status |
| Designer assumption | 0.60 | 0.50-0.70 | Should vary by assumption type |
| Engineering estimate | 0.50 | 0.40-0.60 | Should vary by estimation method |

**Specific recommendations:**

1. **P12/P13 confidence should reflect whether the SPL was measured or calculated.** The `SpeakerSpecification` entity already has a `confidence` field (A/B/C/D) and `evidence_quality` field. The EA should read these and map them to numeric confidence via the existing `confidenceFromSpecConfidence()` function (which already exists in `confidence.js` but is unused).

2. **Bass confidence should reflect publication verification.** Currently fixed at 0.80. Should be 0.85 when `publicationVerified = true` and the contract is authoritative, 0.50 when not verified, and 0.0 when not calculated.

3. **P15/P21 confidence should reflect whether the assumption is validated.** Currently fixed at 0.60. Should be higher (0.70) if the designer has validated the assumption (e.g., measured the noise floor) and lower (0.50) if it's a pure guess.

4. **Room classification confidence should be lower than measured.** Currently `CONFIDENCE.MEASURED` (0.99) for the classification label, but the classification is an interpretation, not a measurement. Should be `CONFIDENCE.COMPUTED_GEOMETRIC` (0.95) or lower.

---

## 11. Missing Engineering

The following engineering facts are known to Sound Proof but NOT exposed in Engineering Authority:

### High Priority (should be added before Proposal Intelligence)

| Missing Item | Application Source | Impact |
|-------------|-------------------|--------|
| **P3** (screen speakers outside zones) | `analysisResult.gradedParameters.primary[3]` | Cannot claim zonal compliance |
| **P7** (wide speaker deviation) | `analysisResult.gradedParameters.primary[7]` | Cannot describe front wide accuracy |
| **P8** (upfiring allowed) | `analysisResult.gradedParameters.primary[8]` | Cannot describe height channel solution |
| **P11** (surround outside zones) | `analysisResult.gradedParameters.primary[11]` | Cannot claim zonal compliance |
| **P12/P13 assessment mode** | P12/P13 mode (minimum/recommended) | Achieved level is meaningless without mode context |
| **P18 basis** | P18 basis (minimum/recommended) | Extension level is meaningless without basis context |
| **Screen dimensions** | `screen_size`, `aspect_ratio`, `screen_height_from_floor` | Proposal cannot describe the screen |
| **RSP position** | `rsp_mode`, `manual_rsp_y_m`, `designated_rsp_seat_id` | Proposal cannot describe reference seat |
| **Viewing geometry / RP23** | `viewingAngleUtils`, `rp23Viewing` | Proposal cannot describe viewing angles |

### Medium Priority (should be added before technical reports)

| Missing Item | Application Source | Impact |
|-------------|-------------------|--------|
| **Sightlines** | `SightlineGraphic`, screen geometry | Proposal cannot describe sightline quality |
| **Off-axis response** | `rp22HfOffAxis`, `OffAxisAnalysis` | Proposal cannot describe off-axis performance |
| **SPL headroom margins** | P12/P13/P14 headroom calculations | Proposal cannot describe dynamic range headroom |
| **Calibration assumptions** | P14 target selection, P12/P13 mode | Proposal cannot describe calibration basis |
| **Design recommendations** | `DesignRecommendationEngine` | Proposal cannot reference active recommendations |
| **Viewing priority** | `viewing_priority` (balanced/row_N) | Proposal cannot describe multi-row intent |

### Lower Priority (future enhancement)

| Missing Item | Application Source | Impact |
|-------------|-------------------|--------|
| **Room orientation** | `room_orientation` | Minor — affects plan view interpretation |
| **Seven-bed layout type** | `seven_bed_layout_type` | Minor — affects surround description |
| **LCR aim mode** | `lcr_aim_mode` | Minor — affects front stage description |
| **Speaker clearance** | `speaker_clearance_m` | Minor — construction detail |

---

## 12. Redundancy Audit

### Identified Redundancies

| Redundancy | Location | Recommendation |
|-----------|----------|----------------|
| Dolby config breakdown | `system.configuration` + `system.channel_layout` + `system.topology.channel_layout` | **Remove** `channel_layout` and `topology.channel_layout`; keep `configuration` as the sole source |
| Product roles | `system.product_roles` (summary) + `products.products` (detail) | **Keep** — serves different purposes (system overview vs product detail) |
| Overhead model | `system.topology.overhead` + `products.products[overhead]` | **Keep** — topology has override structure; products has specs |
| Subwoofer instances | `system.subwoofer_strategy.instances` + `bass` (implicit) | **Keep** — system has physical config; bass has analysis results |

### Non-Redundant (verified)

- **RP22 vs Bass** — RP22 authority has P1-P13, P15-P17, P21; Bass authority has P14, P18-P20. No overlap. ✅
- **Room vs System** — Room has geometry; System has speakers. No overlap. ✅
- **Dealer vs Metadata** — Dealer has brand; Metadata has proposal config. No overlap. ✅

---

## 13. Unused Parameters

The `buildEngineeringAuthority` function accepts `primarySeatingPosition` and `seats` parameters that are destructured but never forwarded to any sub-builder:

- `primarySeatingPosition` — not used by any builder
- `seats` — passed to `buildRp22Authority` as `_seats` (unused parameter)

These should either be forwarded to the relevant builders or removed from the interface.

---

## Summary of Required Actions

### Blocking (must fix before certification)

1. **Fix `CONFIDENCE.PUBLISHED_SPEC_A/B/C/D`** — Add these constants to `confidence.js` or replace with existing constants in `buildProductAuthority.js`.

### High Priority (should fix before Proposal Intelligence)

2. **Add P3, P7, P8, P11** to `PARAM_INTERPRETERS` in `rp22ParameterInterpretations.js`.
3. **Add P12/P13 assessment mode** and **P18 basis** to the RP22 and Bass authorities.
4. **Add screen dimensions** to Room Authority.
5. **Add RSP position** to Room or System Authority.
6. **Add viewing geometry / RP23** as a new sub-authority or Room Authority extension.

### Medium Priority (should fix before technical reports)

7. **Add sightlines, off-axis response, SPL headroom margins**.
8. **Add design recommendations**.
9. **Verify Design Rating field names** against `useAppDesignRating` return shape.

### Lower Priority (future enhancement)

10. **Calculate confidence from source evidence** instead of fixed constants.
11. **Remove redundant `channel_layout` and `topology.channel_layout`** from System Authority.
12. **Remove unused `primarySeatingPosition` and `seats` parameters** or forward them to builders.
13. **Soften acoustic treatment description** to remove mild marketing language.
14. **Rename `date` to `generated_date`** in Project Authority for clarity.

---

## Certification

**Engineering Authority v1.0 is NOT YET CERTIFIED.**

One blocking issue (Product Authority confidence bug) must be fixed before the authority can be trusted as the permanent foundation for proposal generation.

After fixing the blocking issue and the high-priority missing parameters, the authority should be re-audited and certified.

Once certified, every future feature can trust Engineering Authority as the single source of truth — Proposal Intelligence, Comparison Engine, Product Intelligence, Technical Reports, API integrations, and future mobile/web platforms — without ever going back to the original project entities.