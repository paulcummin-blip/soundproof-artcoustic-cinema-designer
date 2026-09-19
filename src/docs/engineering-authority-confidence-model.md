# Engineering Authority — Confidence & Source Provenance Model

**Version:** 1.0
**Date:** 2026-09-19
**Status:** Design Document — for review before implementation across platform features.

---

## 1. Purpose

Confidence is becoming a platform feature. It will not just affect the Proposal Centre — it will also influence AI recommendations, the Comparison Engine, Product Selection, and the Dealer Assistant.

This document defines the confidence model that Engineering Authority uses, and recommends how it should evolve to serve the entire platform.

---

## 2. Current Model (Implemented)

### 2.1 Fixed Confidence Constants

Every engineering fact in the authority carries a confidence value from 0.0 to 1.0. The value is currently selected from a fixed set of constants based on the fact's source type:

| Constant | Value | Used For |
|----------|-------|----------|
| `MEASURED` | 0.99 | Directly measured / user-entered (room dimensions, screen, seating) |
| `PUBLISHED_SPEC_A` | 0.95 | Published manufacturer spec — all key fields present |
| `PUBLISHED_SPEC_B` | 0.85 | Published manufacturer spec — most fields present |
| `PUBLISHED_SPEC_C` | 0.70 | Published manufacturer spec — partial data |
| `PUBLISHED_SPEC_D` | 0.50 | Published manufacturer spec — minimal data |
| `COMPUTED_GEOMETRIC` | 0.95 | Computed from verified geometry (P1, P5, P9) |
| `COMPUTED_SPL` | 0.85 | Computed from product specs + propagation model (P12, P13) |
| `MODEL_DEPENDENT` | 0.80 | Model-dependent analysis (bass P14, P18, P19, P20) |
| `ASSUMED` | 0.60 | Designer assumption (P15, P21) |
| `ESTIMATE` | 0.50 | Engineering estimate |
| `NOT_CALCULATED` | 0.0 | Not yet calculated |

### 2.2 Source Provenance (Implemented)

Every `withConfidence` call now accepts an optional `source` parameter. The authority exposes both `confidence` (numeric) and `source` (string label) on every interpreted fact:

```json
{
  "confidence": 0.95,
  "source": "Published Manufacturer Specification"
}
```

### 2.3 Source Labels

| Constant | Label | Used For |
|----------|-------|----------|
| `USER_INPUT` | "User Input" | Room dimensions, screen, seating, acoustic treatment |
| `MEASURED` | "Measured" | Directly measured values (future use) |
| `PUBLISHED_SPEC` | "Published Manufacturer Specification" | Speaker specs from the registry |
| `RP22_CALCULATION` | "RP22 Calculation" | RP22 parameter results from the analysis engine |
| `BASS_SIMULATION` | "Bass Modal Simulation" | Bass P14/P18/P19/P20 from the modal engine |
| `GEOMETRIC_CALCULATION` | "Geometric Calculation" | Viewing angles, room ratios |
| `DESIGNER_ASSUMPTION` | "Designer Assumption" | P15 noise floor, P21 early reflections |
| `ENGINEERING_ESTIMATE` | "Engineering Estimate" | Engineering estimates |
| `NOT_CALCULATED` | "Not Calculated" | Missing data |

### 2.4 How GPT Uses Source Provenance

GPT can use the `source` field to naturally phrase statements without inventing anything:

| Source | GPT Phrasing Example |
|--------|---------------------|
| Published Manufacturer Specification | "Based on the published loudspeaker specification, the Q4-3 achieves 114 dB SPL..." |
| RP22 Calculation | "RP22 analysis confirms that all screen wall speakers are matched to within 2 dB..." |
| Bass Modal Simulation | "Bass simulation predicts a ±3 dB deviation from the target curve at the reference position..." |
| User Input | "The room measures 5.6m × 5.2m × 2.7m..." |
| Designer Assumption | "The designer has assumed a background noise floor of NCB 22..." |
| Geometric Calculation | "Geometric analysis shows a horizontal viewing angle of 45°..." |

This means GPT never needs to guess where a fact came from — the source is explicit.

---

## 3. Recommended Model (Future)

### 3.1 Problem with Fixed Constants

The current model assigns the same confidence to every fact of the same type. But two published specs can have very different evidence quality:
- A spec from an official manufacturer PDF with full measurement details → high confidence
- A spec extracted from a marketing product page with no measurement conditions → lower confidence

Similarly, two bass simulations can have different confidence:
- A simulation validated against REW measurements → high confidence
- A simulation with unvalidated model parameters → lower confidence

### 3.2 Recommended: Evidence-Derived Confidence

Confidence should be derived from the evidence type, not the parameter type. Each fact should carry:

```json
{
  "confidence": 0.92,
  "source": "Published Manufacturer Specification",
  "evidence_type": "official_pdf",
  "evidence_detail": "Extracted from official datasheet, all key fields present"
}
```

### 3.3 Evidence Type → Confidence Mapping

| Evidence Type | Recommended Confidence | Source Label | Example |
|--------------|----------------------|-------------|---------|
| Official manufacturer PDF, all fields | 0.95 | Published Manufacturer Specification | Sensitivity from Artcoustic datasheet |
| Official manufacturer PDF, partial | 0.85 | Published Manufacturer Specification | Max SPL from datasheet, no measurement conditions |
| Official product page | 0.75 | Published Manufacturer Specification | Specs from product page HTML |
| Engineering document | 0.80 | Published Manufacturer Specification | Specs from engineering white paper |
| User-entered room dimensions | 0.99 | User Input | Room 5.6 × 5.2 × 2.7m |
| User-entered screen size | 0.99 | User Input | 120" 16:9 screen |
| RP22 geometric calculation | 0.95 | RP22 Calculation | P5 surround spacing = 45° |
| RP22 SPL calculation (from specs) | 0.85 | RP22 Calculation | P12 screen SPL = 108 dB |
| Bass modal simulation (validated) | 0.85 | Bass Modal Simulation | P19 = ±3 dB, validated against REW |
| Bass modal simulation (unvalidated) | 0.70 | Bass Modal Simulation | P19 = ±3 dB, model only |
| Designer assumption (validated) | 0.70 | Designer Assumption | P15 = NCB 22, confirmed by measurement |
| Designer assumption (unvalidated) | 0.50 | Designer Assumption | P15 = NCB 22, assumed |
| Engineering estimate | 0.40-0.60 | Engineering Estimate | Estimated cabinet volume |

### 3.4 Implementation Path

The `SpeakerSpecification` entity already has:
- `confidence` (A/B/C/D) — data quality grade
- `evidence_quality` — "Manufacturer Published", "Manufacturer Calculated", "Engineering Estimate", "Unknown"
- `field_authority` — per-field source tracking

The existing `confidenceFromSpecConfidence()` function already maps A→0.95, B→0.85, C→0.70, D→0.50. This should be used by `buildProductAuthority.js` instead of the completeness-based calculation currently in place.

For bass simulation, the `completedBassAuthority` object has `publicationVerified` and `authoritative` flags. Confidence should be:
- 0.85 when `publicationVerified = true` and `authoritative = true`
- 0.50 when not verified
- 0.0 when not calculated

For designer assumptions, confidence should be:
- 0.70 when the assumption is validated (future: measurement uploaded)
- 0.50 when unvalidated
- Currently 0.60 as a reasonable default

### 3.5 Platform-Wide Impact

When confidence becomes a platform feature:

| Feature | How It Uses Confidence |
|---------|----------------------|
| Proposal Intelligence | GPT modulates language certainty based on confidence (high → confident, low → cautious) |
| Comparison Engine | Highlights differences where confidence is high; flags uncertainty where low |
| Product Selection | Ranks products by spec confidence; prefers fully-published specs over partial |
| Dealer Assistant | Explains trade-offs using source provenance ("based on the published spec...") |
| AI Recommendations | Weights recommendations by engineering confidence |
| Technical Reports | Shows confidence indicators next to each engineering fact |
| API Integrations | Exposes confidence to third-party consumers for their own decision-making |
| Future Mobile App | Uses confidence to determine which facts to show vs hide |
| Future Website | Uses confidence to decide which specs to publish vs mark as estimated |

---

## 4. Architecture Rules

1. **Confidence is engineering confidence, not GPT confidence.** It reflects the evidence quality of the underlying source data, not the AI's certainty about its own output.

2. **Source provenance is mandatory.** Every interpreted fact must carry both `confidence` and `source`. GPT should never have to guess where a fact came from.

3. **Confidence never exaggerates.** A fact with 0.70 confidence should not be presented as if it were 0.95. GPT must modulate language accordingly.

4. **Confidence never understates.** A published manufacturer spec should not carry 0.50 confidence. The confidence must reflect the actual evidence quality.

5. **Source labels are controlled vocabulary.** Only the labels defined in `SOURCE` are valid. No free-text source labels.

6. **Confidence is transparent.** The consumer of the authority (GPT, Comparison Engine, etc.) can see both the confidence and the source, and make its own decisions about how to use the fact.

---

## 5. Future Enhancements (Not Implemented)

### 5.1 Confidence Rollup

Category summaries (dynamic_range, spatial_resolution, timbre) currently use `Math.min()` of their parameter confidences. A weighted average might be more representative:

```json
{
  "dynamic_range": {
    "confidence": 0.85,
    "confidence_method": "weighted_average",
    "parameters": [
      { "parameter_id": 12, "confidence": 0.85, "weight": 8 },
      { "parameter_id": 13, "confidence": 0.85, "weight": 7 }
    ]
  }
}
```

### 5.2 Confidence History

For versioned projects, confidence could track how it changed over time:

```json
{
  "confidence": 0.85,
  "confidence_history": [
    { "version": 1, "confidence": 0.70, "reason": "partial spec data" },
    { "version": 2, "confidence": 0.85, "reason": "full spec data extracted from PDF" }
  ]
}
```

### 5.3 Confidence Inheritance

Some facts inherit confidence from their source. A P12 SPL capability result depends on the product spec confidence. If the spec confidence drops, the P12 confidence should drop too:

```json
{
  "p12": {
    "confidence": 0.80,
    "confidence_basis": "inherited_from_product_spec",
    "product_confidence": 0.85,
    "calculation_confidence": 0.95,
    "combined": 0.80
  }
}
```

### 5.4 User-Overrideable Confidence

In rare cases, a dealer may know that a published spec is wrong (e.g., the manufacturer overstates sensitivity). The authority should allow a confidence override:

```json
{
  "confidence": 0.50,
  "confidence_override": true,
  "override_reason": "Manufacturer spec known to be optimistic based on in-room measurement"
}
```

---

## 6. Certification

This document defines the confidence model for Engineering Authority v1.0.

The current implementation (fixed constants + source provenance) is sufficient for Proposal Intelligence. The recommended model (evidence-derived confidence) should be implemented before confidence becomes a platform-wide feature.

Once the recommended model is implemented, this document should be updated to reflect the implemented state, and the confidence model should be versioned alongside the Engineering Authority schema.