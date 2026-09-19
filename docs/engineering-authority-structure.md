# Engineering Authority — Object Structure Documentation

**Version:** 1.0
**Date:** 2026-09-19
**Authority:** This document describes the structure of the Engineering Authority object, the permanent engineering interface between Sound Proof and Proposal Intelligence.

---

## Overview

The Engineering Authority object is a structured JSON object containing all interpreted engineering facts for a project version. It is the sole input to all future proposal intelligence layers.

**Rules:**
- No GPT involvement in construction.
- No proposal wording.
- No marketing language.
- Always deterministic, testable, reproducible.
- Every statement traceable to a source fact.

---

## Top-Level Structure

```
{
  schema_version: "1.0",
  generated_at: "2026-09-19T...",

  project: { ... },        // Project identity
  room: { ... },           // Room engineering
  system: { ... },         // Loudspeaker system
  rp22: { ... },           // RP22 interpreted engineering
  bass: { ... },           // Bass interpreted engineering
  products: { ... },       // Product facts
  images: { ... },          // Image metadata
  dealer: { ... },         // Dealer/brand
  metadata: { ... },       // Proposal metadata
}
```

---

## 1. Project

```
{
  project_name: "Smith Cinema Room",
  client_name: "John Smith",
  dealer_company: "Premium Audio Ltd",
  version_id: "uuid",
  version_name: "Current Design",
  version_number: 1,
  date: "2026-09-19"
}
```

## 2. Room

```
{
  dimensions: { width_m: 4.5, length_m: 6.0, height_m: 2.4 },
  dimensions_text: "6.0m × 4.5m × 2.4m (L × W × H)",
  volume_m3: 64.8,
  classification: { statement: "golden ratio room", confidence: 0.99 },
  ratio: { statement: "Approximately 2:1.5:1...", confidence: 0.99 },
  acoustic_implication: { statement: "Favourable modal distribution...", confidence: 0.95 },
  screen_wall: {
    construction_type: "baffle wall",
    detail: "Baffle wall construction...",
    engineering_purpose: "The baffle wall provides...",
    confidence: 0.99
  },
  seating: {
    row_count: 2,
    seats_per_row: [3, 5],
    total_seats: 8,
    row_spacing_m: 1.8,
    mlp_basis: "middle",
    interpretation: "2 rows: 3 seats in row 1, 5 seats in row 2...",
    confidence: 0.99
  },
  acoustic_treatment: {
    enabled: true,
    product: "Artcoustic Abfuser",
    quantity: 12,
    source: "auto-calculated recommended quantity",
    interpretation: "12 Artcoustic Abfuser panels...",
    confidence: 0.99
  }
}
```

## 3. System

```
{
  configuration: {
    dolby_config: "7.1.4",
    text: "7.1.4 Dolby Atmos configuration (7 bed channels, 1 subwoofer, 4 overhead channels)",
    bed_channels: 7,
    overhead_channels: 4,
    total_discrete_channels: 11,
    confidence: 0.99
  },
  channel_layout: { bed_channels: 7, subwoofer_count: 1, overhead_channels: 4, ... },
  product_roles: [{ role: "lcr", role_description: "...", model_key: "q4-3", ... }],
  subwoofer_strategy: {
    count: 4,
    models: ["sub3-12"],
    instances: [{ id: "...", model: "sub3-12", position: {x, y}, ... }],
    strategy_text: "Four subwoofers...",
    confidence: 0.99
  },
  amplification: { specified: true, power_w: 500, text: "...", confidence: 0.99 },
  topology: { ... }
}
```

## 4. RP22

```
{
  overall_design_rating: { statement: "Artcoustic System Design Rating: Gold (78%)...", confidence: 0.95 },
  dynamic_range: {
    category: "dynamic_range",
    parameters: [12, 13],
    min_level: "L3",
    max_level: "L4",
    summary: "dynamic range: L3–L4 across 2 parameters.",
    confidence: 0.85
  },
  spatial_resolution: { ... },
  timbre: { ... },
  bass_interpretation: { statement: "Bass performance analysis is available...", confidence: 0.80 },
  assumed_parameters: {
    p15_noise_floor: { statement: "Assumed background noise floor at NCB 22...", confidence: 0.60 },
    p21_early_reflections: { statement: "Assumed early reflections at -10 dB...", confidence: 0.60 }
  },
  strengths: [{ parameter_id: 5, title: "Surround angular spacing", achieved_level: "L4", ... }],
  weaknesses: [{ parameter_id: 20, title: "Seat-to-seat LF consistency", achieved_level: "L2", ... }],
  all_parameters: [{ parameter_id: 1, parameter_key: "p1", title: "...", ... }],
  confidence: 0.85
}
```

## 5. Bass

```
{
  available: true,
  p14: {
    parameter_id: 14,
    title: "LFE / bass SPL capability at RSP",
    achieved_level: "L3",
    achieved_capability_db: 120,
    requested_target_db: 120,
    headroom_or_shortfall_db: 0,
    pass: true,
    engineering_meaning: "Bass system achieves 120 dB SPL...",
    confidence: 0.80
  },
  p18: { parameter_id: 18, title: "In-room bass extension (-3 dB)", achieved_level: "L3", design_hz: 20, ... },
  p19: { parameter_id: 19, title: "LF response vs target at RSP", achieved_level: "L3", raw_value: -3, per_seat: [...], ... },
  p20: { parameter_id: 20, title: "Seat-to-seat LF consistency", achieved_level: "L2", raw_value: -4, per_seat: [...], ... },
  subwoofer_strategy_summary: "Bass analysis is authoritative based on 4 subwoofers...",
  confidence: 0.80
}
```

## 6. Products

```
{
  products: [{
    model_key: "q4-3",
    label: "Q4-3",
    category: "LCR",
    role: "lcr",
    role_description: "Left/Centre/Right (screen wall)",
    engineering_purpose: "Left, Centre, and Right screen-wall speakers...",
    specifications: {
      sensitivity_db_1w_1m: 98,
      max_continuous_spl_db_halfspace: 114,
      frequency_response_low_hz: 100,
      coverage_horizontal_deg: 90,
      cabinet_width_mm: 280,
      ...
    },
    confidence: 0.95
  }],
  product_count: 5,
  system_coherence: {
    is_matched_family: true,
    families: ["SPITFIRE_Q"],
    text: "The system uses a matched speaker family...",
    confidence: 0.95
  }
}
```

## 7. Images

```
{
  images: [{
    asset_type: "front_view",
    file_url: "https://...",
    caption: "Front elevation render",
    category: "Interior",
    proposal_importance: "Essential",
    order_index: 0,
    suggested_placement: "Room Images section"
  }],
  has_images: true,
  cover_image: { ... } | null,
  gallery_images: [...],
  fixed_assets: [...]
}
```

## 8. Dealer

```
{
  company_name: "Premium Audio Ltd",
  contact: { address: "...", telephone: "...", email: "...", website: "...", ... },
  about_us: "Rich text HTML...",
  why_choose_us: "Rich text HTML...",
  warranty: "Rich text HTML...",
  terms_conditions: "Rich text HTML...",
  branding: { dealer_logo_url: "...", primary_colour: "#213428", ... },
  proposal_defaults: { include_about_us: true, ... },
  proposal_tone: "luxury_residential"
}
```

## 9. Metadata

```
{
  narrative_goal: "luxury_cinema",
  narrative_goal_label: "Luxury Cinema",
  audience: "homeowner",
  language: "en-GB",
  word_count: "standard",
  tone: "professional"
}
```

---

## Confidence Values

Every interpreted statement carries a confidence value (0.0–1.0):

| Source | Confidence |
|--------|-----------|
| Measured (room dimensions) | 0.99 |
| Computed from verified geometry (P1, P5, P9) | 0.95 |
| Computed from product specs (P12, P13) | 0.85 |
| Model-dependent analysis (bass P14, P18, P19, P20) | 0.80 |
| Assumed values (P15, P21) | 0.60 |
| Engineering estimate | 0.50 |
| Not calculated | 0.00 |

GPT uses confidence values to modulate writing certainty (Architecture Rule 4):
- High confidence → confident language
- Lower confidence → more cautious wording
- Never fabricate certainty

---

## Future Compatibility

The Engineering Authority object is designed to be consumed by:
- Design Intelligence (Layer 2)
- Proposal Writing (Layer 4)
- Proposal Comparison
- Product Intelligence
- Technical Reports
- API integrations

without structural changes.