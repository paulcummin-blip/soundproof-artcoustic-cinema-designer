# Subwoofer Design — Redesign PRD

## Status: Frozen Specification
**Date:** 2026-09-24
**Scope:** Subwoofer Design page (BassDesignAssistant) information architecture and visual hierarchy only.
**Authority:** This PRD is the product authority. The existing UI is not preserved simply because it exists. Implementation follows this spec.

---

## 1. Philosophy

Sound Proof is a **design environment**, not a simulator, calculator, or optimiser.

Everything on the page helps answer a design question:
- What am I working on?
- What am I targeting?
- What did I measure?
- What should I improve?

Everything that doesn't answer one of those questions disappears into Engineering Detail.

This principle guides the rest of the application. If every future page follows it, Sound Proof feels cohesive rather than like a collection of tools.

---

## 2. Zone Structure

The page is organised into five zones, top to bottom. Zones imply a workspace, not a wizard.

```
┌──────────────────────────────────────────────────┐
│  ZONE 1: CURRENT DESIGN                           │
│  What am I working on?                             │
├──────────────────────────────────────────────────┤
│  ZONE 2: DESIGN OBJECTIVE                          │
│  What am I targeting?                              │
├──────────────────────────────────────────────────┤
│  ZONE 3: PERFORMANCE                              │
│  What did I measure?                               │
├──────────────────────────────────────────────────┤
│  ZONE 4: RECOMMENDED IMPROVEMENT                  │
│  What should I improve?                            │
├──────────────────────────────────────────────────┤
│  ZONE 5: ENGINEERING DETAIL                       │
│  (collapsed — opt-in)                              │
└──────────────────────────────────────────────────┘
```

The designer's eye flows: **Current → Target → Measured → Improve**.

That's how designers think.

### The graph is the primary workspace

The Performance graph is the primary design workspace. It is the visual authority for the engineering result. The RP22 parameters summarise the graph, and ADI explains it. Every published RP22 value must be directly traceable to the graph. Selecting a seat or RP22 result must immediately reveal the corresponding engineering feature on the graph. The graph, RP22 and ADI must always tell the same engineering story.

---

## 3. Zone Specifications

### Zone 1 — Current Design

**Question answered:** What am I working on?

**Contents:**
- Subwoofer model × count (e.g. "2× SUB3-12")
- Layout name (e.g. "Pair Layout")
- Status indicator (Ready to calculate / Recalculating / Performance is current)
- Room + seating thumbnail (compact, left-aligned)
- Two secondary actions: "Change Speakers" (navigates to Speakers panel), "Change Layout" (expands layout cards inline)

**Visual treatment:**
- One card. One row. Compact.
- Always visible. Never collapses.
- Subtle border (`border-[#D9D5CE]`), white background.
- Thumbnail 40×40px. Text 13px.
- Status indicator: subtle text + icon, no coloured pills or banners.

**Merge rule:** Current System Summary + Current Layout Banner become one card. They are both "current state" — one card, one row, one status.

**Change actions:** "Change Speakers" and "Change Layout" are secondary text links, not buttons. They look different from each other only by label — both are understated, right-aligned.

---

### Zone 2 — Design Objective

**Question answered:** What am I targeting?

**Contents:**
- P14 Capability level (L1 / L2 / L3 / L4)
- P18 Extension basis (Minimum / Recommended)

**Visual treatment:**
- Permanently visible. Never collapses. Never hides.
- Tiny. Elegant. Always there.
- Two columns: "Capability" and "Extension".
- Label 10px uppercase tracking-wide. Value 13px semibold.
- No card border. No background fill. Just a thin top rule separating it from Zone 1.
- Editable inline — clicking a value opens a minimal selector. No modal. No expansion.

**Why permanently visible:**
P14 and P18 are not settings. They are the design brief. Every engineering decision on the page refers back to them. They should remain visible at all times so the designer never loses sight of the target.

**Layout:**
```
─────────────────────────────────────
Capability          Extension
L2                  Minimum
─────────────────────────────────────
```

---

### Zone 3 — Performance

**Question answered:** What did I measure?

**This zone is the workspace. The graph is the visual anchor.**

**Structure:**
```
┌──────────────────────────────────────────────────┐
│  Performance                                       │
│  P14  P18  P19  P20                                │  ← graph header (RP22 pills)
│──────────────────────────────────────────────────│
│                                                    │
│                                                    │
│              [ BASS RESPONSE GRAPH ]               │
│              (dominant — 575px height)              │
│                                                    │
│                                                    │
│──────────────────────────────────────────────────│
│  [Seat selector — compact, inline]                 │
└──────────────────────────────────────────────────┘
```

**RP22 pills become the graph header:**
- P14, P18, P19, P20 sit in a compact strip directly above the graph.
- They are the graph's quantitative summary, not a separate competing block.
- Each pill shows the level (L1-L4) or status (PASS/FAIL).
- P19 and P20 are seat-scoped: the pill shows the currently-selected seat's result.
- Clicking a pill does nothing — they are display-only in the header.

**Graph:**
- Definite height: 575px (the proven non-collapsed height).
- Stronger container treatment than surrounding zones: subtle shadow or 2px border.
- White background.
- Default visible curves: Product + Room and Final EQ (unchanged).
- Engineering Detail panel collapsed below the graph (unchanged).

**Seat selector:**
- Compact, inline, directly below the graph.
- RSP / All seats / individual seat pills.
- Hidden when only one seat exists.
- Hidden when no results exist.

**Click-to-highlight interaction (the killer feature):**
- Click a P19/P20 pill in the header (or a seat in the selector) → graph highlights the relevant frequency region → tooltip explains the result.
- Example: Click "Seat 4 · FAIL" → graph highlights 100 Hz region → tooltip shows "FAIL: 100 Hz null at -8.2 dB, below P19 L2 floor of -6.0 dB".
- This interaction unifies the RP22 pills and the graph into one experience.
- Implementation note: This is a UI interaction layer. It does not modify graph logic, series generation, or RP22 calculation. It adds a highlight overlay and tooltip driven by existing RP22 seat-level data.

**What moves OUT of this zone into Engineering Detail:**
- "Displayed smoothing: 1/3-octave" label
- "BASS OPTIMISER VALIDATION ACTIVE" status
- Allen & Berkley attribution
- P14 integration diagnostic
- Metric publication diagnostic
- All footer text currently below the graph

---

### Zone 4 — Recommended Improvement

**Question answered:** What should I improve?

**Heading:** "Recommended Improvement" (not "ADI Recommendation").

**Branding:** "Powered by Artcoustic Design Intelligence" as subtle text beneath the heading, not a dominant label. ADI is the intelligence behind the recommendation, not a heading.

**Contents:**
- What should I do? — specific action (e.g. "Move the subwoofers 250 mm forward")
- Why? — dominant physical cause, one sentence (e.g. "Front-wall cancellation at 45 Hz")
- What improves? — expected RP22 level changes (e.g. "P19 FAIL → L2, P20 L1 → L3")
- Apply — one button, one action

**Visual treatment:**
- Distinct from the graph: different background (`bg-[#F7F4F0]/60`), clear boundary.
- One card. Not bordered like the graph — softer.
- Apply button: primary action, `bg-[#213428]`, white text, 13px semibold.
- When no improvement is available: "No further engineering changes are recommended." No Apply button. No placeholder text.

**States:**
- Before calculation: Zone 4 is not shown. The "Calculate Performance" button lives here, but the recommendation card does not.
- During calculation: Progress display (simplified checklist) lives here.
- After calculation: The recommendation card appears here.
- After apply: "Applied" badge. Recalculate button appears.

**Action flow:**
```
[Calculate Performance] → [Progress...] → [Recommended Improvement card] → [Apply] → [Recalculate]
```

All of this happens in Zone 4. The designer's eye moves down naturally from graph → result → recommendation → apply. No scrolling back up.

---

### Zone 5 — Engineering Detail

**Question answered:** (none — this is opt-in engineering context)

**Contents (collapsed by default):**
- Engineering Detail (existing collapsed panel)
  - Smoothing control
  - Curve visibility toggles
  - BassEngineeringDetails
  - Allen & Berkley attribution
  - P14 integration diagnostic
  - Metric publication diagnostic
- Absorption Coefficients (existing collapsed panel)
- Advanced Tuning (existing collapsed panel)

**Visual treatment:**
- Three collapsed panels, stacked.
- Each panel: `border-[#D9D5CE]`, white background, 13px header.
- No content visible until expanded.
- Diagnostics-gated items remain diagnostics-gated.

---

## 4. Visual Hierarchy

### Typography

| Role | Size | Weight | Usage |
|------|------|--------|-------|
| Page title | 18px | 700 | "Subwoofer Design" |
| Zone label | 13px | 600 uppercase tracking-wide | "CURRENT DESIGN", "PERFORMANCE" |
| Body | 12px | 400 | Descriptions, status |
| Label | 10px | 600 uppercase tracking-wide | "Capability", "Extension", "What should I do?" |
| Value | 13px | 600 | P14 level, P18 basis, action text |
| Button | 13px | 600 | Calculate, Apply, Recalculate |

### Spacing

| Context | Spacing |
|---------|---------|
| Between zones | 28px |
| Within zones | 12px |
| Card padding | 16px (px-4 py-4) |
| Label to value | 4px |

### Container Treatment

| Zone | Border | Background | Shadow |
|------|--------|------------|--------|
| Current Design | 1px `#D9D5CE` | white | none |
| Design Objective | top rule only | transparent | none |
| Performance (graph) | 2px `#D9D5CE` | white | subtle (`shadow-sm`) |
| Recommended Improvement | 1px `#E7E4DF` | `#F7F4F0]/60` | none |
| Engineering Detail | 1px `#D9D5CE` | white | none |

The graph container has the strongest treatment. It is the visual anchor.

---

## 5. Interactions

### Click-to-Highlight (Graph ↔ RP22 Pills)

**Trigger:** Click a P19 or P20 pill in the Performance header, or a seat in the seat selector.

**Response:**
1. Graph highlights the frequency region responsible for the result.
2. Tooltip appears on the graph explaining the result.
3. Tooltip content: parameter name, frequency, measured value, floor/threshold, pass/fail.

**Data source:** Existing RP22 seat-level results (`p19SeatAuthority`, `p20SeatPresentation`). No new calculation.

**Scope:** UI interaction layer only. Does not modify:
- Graph logic
- Series generation
- RP22 calculation
- Optimiser
- Acoustics

### Layout Selection (when no layout chosen)

When no layout is applied, Zone 3 (Performance) shows layout selection cards instead of the graph. Once a layout is applied, the graph appears. This is the existing behavior — preserved.

### Calculate → Recommend → Apply → Recalculate

All four states render in Zone 4. The designer never scrolls to find the primary action.

---

## 6. What Does NOT Change

- Graph rendering logic
- RP22 calculation or presentation
- Optimiser logic
- Acoustic calculations
- Series generation
- Visibility defaults (Product + Room and Final EQ remain default visible)
- Engineering Detail collapsed state
- Absorption Coefficients content
- Advanced Tuning content
- BassResultCards data (moves to graph header, data unchanged)
- AdiRecommendation logic (renamed in UI, logic unchanged)
- CurrentSystemSummary data (merges into Current Design, data unchanged)
- CurrentLayoutBanner data (merges into Current Design, data unchanged)
- ChooseDesignTarget data (becomes Design Objective, data unchanged)

---

## 7. Component Mapping

| Current Component | Redesign Role | Zone |
|-------------------|---------------|------|
| CurrentSystemSummary | Merged into Current Design | 1 |
| CurrentLayoutBanner | Merged into Current Design | 1 |
| StartingLayoutCards | Layout selection (when no layout) | 3 |
| ChooseDesignTarget | Design Objective (always visible) | 2 |
| BassResultCards | RP22 pills → graph header | 3 |
| BassResponse (graph) | Performance workspace | 3 |
| SeatResponseScopeControls | Seat selector (below graph) | 3 |
| BassEngineeringDetails | Engineering Detail (collapsed) | 5 |
| OptimiseAndCalculate | Calculate/Recalculate/Progress | 4 |
| AdiRecommendation | Recommended Improvement (renamed) | 4 |
| Absorption Coefficients panel | Engineering Detail (collapsed) | 5 |
| Advanced Tuning panel | Engineering Detail (collapsed) | 5 |
| Footer diagnostics | Moved into Engineering Detail | 5 |

---

## 8. Implementation Rules

### Rule 1: No duplicated ownership

Every piece of information appears once.
Every control has one owner.
Every engineering decision has one authoritative source.

### Rule 2: Every zone answers one question

| Zone | Question |
|------|----------|
| Current Design | What am I designing with? |
| Choose Layout | Where should the subwoofers go? |
| Design Target | What am I trying to achieve? |
| Performance | How well does this design perform? |
| Recommended Improvement | What should I change? |
| Engineering Detail | Why? |

If a zone starts answering two questions, it should be simplified.

---

## 9. Implementation Order

1. **Zone 1:** Merge CurrentSystemSummary + CurrentLayoutBanner → Current Design card.
2. **Zone 2:** Convert ChooseDesignTarget → Design Objective (always visible, no collapse).
3. **Zone 3:** Move BassResultCards pills into Performance header above graph. Move footer diagnostics into Engineering Detail.
4. **Zone 4:** Rename AdiRecommendation → Recommended Improvement. Add "Powered by ADI" subtle branding. Ensure Calculate/Recalculate/Progress all render here.
5. **Zone 5:** Confirm Engineering Detail, Absorption, Advanced Tuning are collapsed and contain all moved diagnostics.
6. **Click-to-highlight:** Add graph highlight + tooltip interaction driven by existing RP22 seat data.
7. **Visual hierarchy:** Apply typography, spacing, and container treatment per spec.

Each step is independently shippable. No step changes logic, data, or calculation.