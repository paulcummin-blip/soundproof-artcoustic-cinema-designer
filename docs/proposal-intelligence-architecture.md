# Proposal Intelligence — Architecture

> **Truth → Understanding → Communication → Publishing**

Proposal Intelligence is the decision-making layer that sits between
engineering knowledge and proposal writing. It does not write proposals.
It decides what the proposal should communicate and why.

---

## Position in the architecture

```
Engineering Authority      ← project-specific facts (Layer 1)
        ↓
Product Intelligence       ← manufacturer knowledge (Layer 2)
        ↓
Proposal Intelligence      ← editorial decisions (THIS — Layer 3)
        ↓
Narrative Spine            ← (future, Stage 4)
        ↓
Proposal Writing           ← (future, Stage 5)
        ↓
Editorial Review           ← (future, Stage 6)
        ↓
Proposal Editor            ← publishing (existing)
```

### What Proposal Intelligence is NOT

- It is **not** a proposal writer — it produces no paragraphs, no HTML, no
  marketing copy.
- It is **not** an engineering calculator — it never calculates RP22, bass,
  or any acoustic metric.
- It is **not** a product catalogue — that is Product Intelligence.
- It is **not** a room interpreter — that is Engineering Authority.

### What Proposal Intelligence IS

A pure, deterministic interpreter that reads two authority objects and
returns one structured object of editorial decisions. Every decision is
traceable to a field in Engineering Authority or Product Intelligence.

---

## Inputs

| Input | Source | Owns |
|-------|--------|------|
| `engineeringAuthority` | `buildEngineeringAuthority()` | Project-specific facts: room, system, RP22, bass, viewing, products, images, dealer, metadata |
| `productIntelligence` | `buildProductIntelligence()` (array) | Manufacturer knowledge: purpose, applications, strengths, compromises, upgrade path, story |

---

## Output — the 11 decision areas

### 1. Proposal Strategy
The overall story. Derived from the dealer-selected narrative goal,
validated against engineering evidence. If the evidence does not support
the intended narrative, the strategy notes the gap.

### 2. Primary Messages
The three most important messages for this project. Ranked by relevance to
the narrative goal. Each carries confidence and traceable evidence.

### 3. Secondary Messages
Supporting messages that not every project needs. Derived from the
remaining candidate messages after the top 3.

### 4. Project Strengths
What the proposal should celebrate. Engineering evidence only — RP22
achievements, system architecture, bass performance, acoustic treatment,
room proportions, product strengths.

### 5. Honest Limitations
Compromises to acknowledge professionally. Never hidden, never exaggerated.
Each includes a professional framing — how to acknowledge it without
undermining the proposal.

### 6. Upgrade Opportunities
Where additional budget would create the greatest engineering benefit.
Based on product upgrade paths and RP22 parameters that are one level
below the next tier.

### 7. Product Highlights
Which products deserve explanation. Not every product requires equal
coverage — products enabling key capabilities or carrying notable
engineering stories receive more attention.

### 8. Image Story
Editorial intent for where project images should support the proposal.
No layout, no positioning — only why an image belongs in each section.

### 9. Proposal Flow
The editorial order of emphasis. Not page order — editorial priority.
Independent of the document template. Different narratives lead with
different emphases.

### 10. Audience Awareness
How emphasis shifts depending on the audience (homeowner, architect,
interior designer, commercial). The engineering remains identical; only
the emphasis changes.

### 11. Confidence
Every decision carries confidence. Engineering Authority confidence
naturally influences Proposal Intelligence confidence. Low engineering
confidence produces cautious recommendations.

---

## Confidence model

Proposal Intelligence uses the same numeric confidence scale as
Engineering Authority (0.0–0.99). Product Intelligence letter grades
(A/B/C/D) are normalised to this scale:

| Letter | Numeric | Meaning |
|--------|---------|---------|
| A | 0.95 | Published / verified |
| B | 0.85 | Calculated from published data |
| C | 0.70 | Estimated from partial data |
| D | 0.50 | Engineering estimate |

### Propagation rule

A decision's confidence = the **floor** of the evidence it cites.

- If a decision cites an RP22 strength with confidence 0.85, the decision
  confidence is 0.85.
- If a decision combines engineering (0.85) and product intelligence (B =
  0.85), the decision confidence is 0.85.
- The overall Proposal Intelligence confidence is the floor of the
  engineering floor and the product average.

This ensures that low engineering confidence always produces cautious
recommendations — a decision can never be more confident than the
evidence behind it.

---

## Rules

Proposal Intelligence must never:

- Calculate RP22 parameters
- Calculate bass response
- Invent specifications
- Invent engineering facts
- Generate proposal text
- Generate HTML or markdown
- Generate marketing language

Proposal Intelligence only interprets existing knowledge from the two
authority layers.

---

## Module structure

```
src/components/proposal/proposalIntelligence/
├── buildProposalIntelligence.js   — main orchestrator + confidence aggregation
├── confidence.js                  — confidence helpers (letter↔numeric, floor, average)
├── deriveStrategy.js              — proposal strategy + editorial flow
├── deriveMessages.js              — primary + secondary messages
├── deriveEvidence.js              — project strengths + honest limitations
├── deriveProducts.js              — product highlights + upgrade opportunities
├── derivePresentation.js          — image story + audience awareness
├── proposalIntelligenceSchema.js  — output schema documentation
└── index.js                        — exports
```

---

## Future consumers

This object will later feed — without modification:

- Narrative Spine (Stage 4)
- Proposal Writing (Stage 5)
- Proposal Comparison
- Executive Summary generation
- Technical Summary generation
- Dealer Assistant
- Product Selector

---

## Usage

```js
import { buildProposalIntelligence } from '@/components/proposal/proposalIntelligence';
import { buildEngineeringAuthority } from '@/components/proposal/engineeringAuthority';
import { buildProductIntelligence } from '@/components/productIntelligence';

// Layer 1: Engineering Authority (existing)
const engineeringAuthority = buildEngineeringAuthority({ project, ... });

// Layer 2: Product Intelligence (existing)
const productIntelligence = products.map((p) =>
  buildProductIntelligence({ product: p, specification: p.spec, intelligence: p.knowledge })
);

// Layer 3: Proposal Intelligence (this module)
const proposalIntelligence = buildProposalIntelligence({
  engineeringAuthority,
  productIntelligence,
});

// proposalIntelligence is a structured object of editorial decisions.
// No HTML. No paragraphs. No GPT prompts. Only decisions.
``