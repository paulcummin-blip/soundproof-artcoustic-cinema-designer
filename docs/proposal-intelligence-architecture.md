# Proposal Intelligence Architecture v1.0

**Status:** Canonical specification
**Date:** 2026-09-19
**Authority:** This document is the authoritative reference for all future Proposal Centre development. Every proposal feature should conform to this architecture unless explicitly instructed otherwise.

---

## Purpose

The Proposal Engine is not an AI writer. It is a layered system where each layer has one responsibility only. This separation allows proposal quality to improve over time without affecting engineering calculations, and allows engineering calculations to evolve without affecting proposal writing.

The architecture separates engineering, interpretation, writing, and editing into independent layers. Each layer can be improved, audited, and replaced independently.

---

## Core Principle

Every statement in a generated proposal must be traceable back through the layers to a fact in the Engineering Authority. No layer may invent information. No layer may bypass the layer below it.

---

## The Six Layers

```
Layer 1  Engineering Authority      (Sound Proof — facts only)
   │
   ▼
Layer 2  Design Intelligence        (GPT — thinking, not writing)
   │
   ▼
Layer 3  Narrative Spine            (GPT — editorial plan)
   │
   ▼
Layer 4  Proposal Writing           (GPT — parallel sections)
   │
   ▼
Layer 5  Editorial Review           (GPT — polish, never invent)
   │
   ▼
Layer 6  Proposal Editor            (Dealer — owns the final document)
```

---

## Layer 1 — Engineering Authority

**Owner:** Sound Proof
**GPT involvement:** None
**Output:** Structured facts with confidence values. Never prose. Never interpretation.

### Contents

#### Project
- Project name
- Client name
- Dealer company name

#### Room
- Dimensions (width, length, height)
- Room ratio classification (golden, cuboid, tunnel, etc.)
- Acoustic implication of the ratio
- Screen wall construction type (baffle, floating, cavity)
- Seating interpretation (rows, counts, MLP position, viewing priority)
- Acoustic treatment interpretation (enabled, product, quantity, design intent)

#### Loudspeaker System
- Configuration (Dolby layout, channel count, bed layer, overhead layer)
- Product list with roles
- System topology
- Subwoofer strategy (count, model, placement philosophy, calibration approach)
- Amplification (if specified)

#### RP22
Engineering Authority must **not** provide raw parameter tables. It must provide interpreted engineering. For every important parameter:

- Achieved level (L1/L2/L3/L4/FAIL)
- Engineering meaning (plain-English sentence)
- Confidence (0.0–1.0)

Important parameters include:
- Dynamic Range (P12/P13/P14)
- Spatial Resolution (P9/P10/P11)
- Timbre (P4/P5/P6/P16/P17)
- Bass Performance (P18/P19/P20)
- Overall Design Rating
- Strongest parameters (with reasons)
- Weakest parameters (with reasons)

#### Product Facts
Factual information only. No marketing.
- Sensitivity
- Maximum SPL capability
- Driver complement
- Frequency extension
- Coverage pattern
- Cabinet type
- Role within the design
- Confidence

#### Project Images
Metadata only. Never attempt image interpretation.
- Image type (cover, front view, plan, elevation, gallery, etc.)
- Caption (dealer-supplied free text)
- Category (Seating, Lighting, Cabinetry, Equipment, etc.)
- Proposal importance (Essential / Preferred / Optional / Do Not Use)
- Suggested placement (which section this image suits)

#### Dealer
- Dealer company information
- Brand information (colours, logo URLs)
- About Us (rich text)
- Warranty (rich text)
- Terms & Conditions (rich text)
- Contact details

#### Proposal Metadata
- Narrative Goal (luxury_cinema, family_media_room, reference_performance, best_value, future_proof)
- Audience (homeowner, architect, developer)
- Word Count (concise, standard, detailed)
- Language (en-GB)
- Tone (professional, etc.)

### Confidence

Every interpreted fact in Engineering Authority carries a confidence value (0.0–1.0). Confidence is determined by Sound Proof based on the evidence quality of the underlying source:

- Published, verified data → high confidence (0.90+)
- Computed from verified inputs → high confidence (0.85+)
- Computed from model-dependent analysis → medium confidence (0.70–0.85)
- Assumed values (e.g. P15 noise floor) → lower confidence (0.50–0.70)
- Engineering estimates → lower confidence (0.50–0.70)

Confidence flows downstream. GPT must adjust writing certainty based on confidence (see Proposal Rules, Rule 4).

---

## Layer 2 — Design Intelligence

**Owner:** GPT
**GPT involvement:** Thinking only. No proposal writing. No paragraphs.
**Input:** Engineering Authority
**Output:** Design Intelligence JSON

This is the proposal thinking stage. GPT receives the complete Engineering Authority and produces editorial judgements — not prose.

### Output Structure

```json
{
  "proposal_strategy": "Short summary of the overall approach.",
  "key_messages": ["..."],
  "primary_messages": ["..."],
  "secondary_messages": ["..."],
  "main_strengths": [
    { "strength": "...", "confidence": 0.95 }
  ],
  "main_limitations": [
    { "limitation": "...", "confidence": 0.64 }
  ],
  "upgrade_opportunities": ["..."],
  "client_concerns": ["..."],
  "image_story": ["..."],
  "product_highlights": ["..."],
  "proposal_flow": ["..."]
}
```

### Rules

- No prose beyond short summary fields.
- All outputs should contain confidence values where appropriate.
- This JSON becomes inspectable and editable in future versions.
- GPT does not write proposal text at this stage. It thinks.

---

## Layer 3 — Narrative Spine

**Owner:** GPT
**Input:** Engineering Authority + Design Intelligence
**Output:** Editorial plan (not proposal text)

### Output Structure

- Document Thesis (1 paragraph — the single argument the proposal makes)
- Section Intent (what each of the 10 sections should accomplish)
- Section Relationships (how sections reference each other)
- Cross References (specific points one section should make that another expands)
- Purpose of each section

The Narrative Spine ensures sections are not islands. Every section in Layer 4 receives the spine and therefore shares the same understanding of the project.

---

## Layer 4 — Proposal Writing

**Owner:** GPT
**Input per section:** Engineering Authority + Design Intelligence + Narrative Spine + Proposal Rules + Dealer Notes

Sections may still be generated in parallel for speed. Because every section receives the same Narrative Spine, sections can reference each other even when generated in parallel.

Each section shares the same understanding of the project. No section is an island.

---

## Layer 5 — Editorial Review

**Owner:** GPT
**Input:** The complete assembled proposal
**Purpose:** Editing only. Never invent information.

### Tasks

- Remove repetition between sections.
- Improve transitions between sections.
- Strengthen cross references.
- Ensure consistent tone throughout.
- Check all Proposal Rules.
- Replace generic wording with project-specific wording.
- Verify every paragraph is unrelocatable (Rule 1).
- Verify every page answers "so what?" (Rule 2).
- Verify every paragraph explains rather than describes (Rule 3).
- Verify no overselling (Rule 4).
- Confirm no claims appear that are not traceable to Engineering Authority.

---

## Layer 6 — Proposal Editor

**Owner:** Dealer
**Authority:** The dealer owns the final document.

### Rules

- Manual edits always override GPT.
- Dealer Notes remain invisible to clients.
- Regeneration always requests confirmation before replacing edited sections.
- The dealer has final approval before export.

---

## Proposal Rules

Every proposal generation and editorial pass must obey these rules. These are the constitution of the writing layer.

### Rule 1 — Unrelocatable Paragraphs

Paragraphs must be unrelocatable. If a paragraph could be copied into another project without modification, it must be rewritten.

Every paragraph must contain project-specific engineering or design information. If a paragraph is generic, it has failed.

**Test:** Swap the project name and room dimensions. If the paragraph still reads correctly, it failed.

### Rule 2 — Every Page Answers "So What?"

Never state a fact without explaining its benefit. Engineering exists to support a client decision. Always explain why the information matters.

**Bad:** "This achieves Level 3."
**Good:** "This achieves Level 3, ensuring all seating positions experience stable surround imaging during object-based soundtracks."

### Rule 3 — Never Describe. Always Explain.

**Bad:** "The room uses four subwoofers."
**Good:** "Four subwoofers have been distributed throughout the room to minimise seat-to-seat bass variation while extending low-frequency performance to reference cinema levels."

The reader should always understand *why*, not just *what*.

### Rule 4 — Never Oversell.

Professional consultancy documents acknowledge genuine limitations. Limitations should be explained honestly and constructively. Engineering credibility is more important than marketing language.

Confidence values should naturally influence writing certainty:
- High confidence → confident language
- Lower confidence → more cautious wording
- Never fabricate certainty

---

## Ownership Summary

| Layer | Owner | Responsibility |
|------|-------|---------------|
| 1. Engineering Authority | Sound Proof | Facts, calculations, RP22, bass, design rating, confidence |
| 2. Design Intelligence | GPT | Interpretation, proposal strategy, key messages |
| 3. Narrative Spine | GPT | Editorial plan, section intent, cross references |
| 4. Proposal Writing | GPT | Section prose, parallel generation |
| 5. Editorial Review | GPT | Polish, consistency, rule enforcement |
| 6. Proposal Editor | Dealer | Final edits, approval, export |

**Sound Proof owns:** Engineering, calculations, RP22, bass, design rating, interpretation inputs, confidence.
**GPT owns:** Interpretation, proposal strategy, writing, editorial review.
**Dealer owns:** Final edits, approval, export.

---

## Future Compatibility

This architecture must remain compatible with:

- **Product Intelligence** — richer per-product narratives (design intent, room suitability, upgrade path) that read like internal sales training notes rather than spec sheets.
- **Proposal Comparison** — comparing multiple proposal versions or competing designs.
- **Multiple proposal templates** — different section structures for different audiences.
- **Image intelligence** — future vision-capable GPT models that can interpret image content.
- **Different GPT models** — the writing layer must not be tightly coupled to a single LLM provider.
- **Additional manufacturers** — no implementation should tightly couple the writing layer to Artcoustic products.

No implementation should tightly couple the writing layer to Artcoustic products or to a single LLM provider. The layers are the contract; the providers are interchangeable.

---

## Implementation Guidance

Implement the architecture incrementally. Do not attempt to complete every layer in one development cycle.

However, every future proposal feature should align with this architecture rather than introducing direct shortcuts between Engineering Authority and proposal text. No layer may bypass the layer below it.

This specification is the authoritative reference for all future Proposal Centre development.