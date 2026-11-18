import { test } from 'vitest';
import assert from 'node:assert/strict';
import { briefCoverageGate } from '../base44/shared/proposalWriter/proposalBriefCoverageGate.js';
import { briefItems, briefItemSubjects } from '../base44/shared/proposalWriter/writerClientBriefCoverage.js';

// ── The exact original Holborn brief from gen_8f4663d2 ──────────────────────
const HOLBORN_BRIEF =
  'This project is designed with a 75" or 83" TV to be used day to day, with the drop down 110" projector screen for movie nights. '
  + 'The suggestion here is to use a fabric wall construction for the screen wall so the subwoofers can be hidden. '
  + 'The need to be on the front and rear walls, and the system will look too busy if on show at the front. '
  + 'The use of a fabric wall allows these to be hidden and for the drop down screen to be partly lost into the same recessed space. '
  + 'For a showroom demo, the system design is ideal for spatial resolution and helps to create a consultative approach to discussing a clients room, '
  + 'with the final specification being based on the financial decisions the Level 1, 2, 3 or 4 will lead to. '
  + 'This is solidly based around level 1-2, making it an accessible option, but easy to take a client through the choices available for their own project.';

// A meaning-equivalent copy that addresses every material instruction. The
// Holborn brief asks for reasoning (it contains "decisions"), so the copy must
// state WHY the system suits the showroom, not just that it does.
const COMPLETE_COPY = [
  {
    section: 'system_design_summary',
    text: 'This cinema is designed around a 75-inch or 83-inch TV for daily viewing, with a drop-down 110-inch projector screen for film nights. The subwoofers need to be on the front and rear walls, and the system would look too busy if on show at the front, so a fabric screen wall construction is used to conceal them. This allows the front and rear subwoofers to be hidden and gives the drop-down screen a recessed space to sit in.',
  },
  {
    section: 'overall_design',
    text: 'The system is an ideal showroom demonstration because its spatial resolution makes it a consultative tool for discussing a client\'s room. The specification is built around Level 1 to 2 performance to make it an accessible option. The final specification follows from the financial decisions the RP22 Level 1, 2, 3 or 4 discussion leads to, so that the design makes it easy to take a client through the choices available for their own project.',
  },
];

// Helper: build a proposal with the Holborn brief and brief_coverage_required.
const holbornProposal = (brief = HOLBORN_BRIEF) => ({
  client_brief: brief,
  metadata: { brief_coverage_required: true },
});

// Helper: gate with hard_enforcement off (review only), matching the live setting.
const reviewGate = (proposal, sections) => briefCoverageGate(proposal, sections, { hard_enforcement: false });

test('the full Holborn brief with meaning-equivalent copy passes the coverage check', () => {
  const gate = reviewGate(holbornProposal(), COMPLETE_COPY);
  assert.equal(gate.applies, true, 'gate applies to a brief_coverage_required proposal');
  assert.equal(gate.blocked, false, 'gate does not block (hard enforcement is off)');
  assert.equal(gate.outstanding.length, 0, `no outstanding items for complete copy, got: ${gate.outstanding.map((o) => o.item).join('; ')}`);
  assert.equal(gate.coverage?.complete, true, 'coverage is complete');
});

test('removing the 75, 83, 110 display options is caught', () => {
  const copyWithoutDisplays = COMPLETE_COPY.map((s) => {
    if (s.section === 'system_design_summary') {
      return {
        ...s,
        text: 'This cinema is designed for daily viewing with a drop-down projector screen for film nights. A fabric screen wall construction allows the front and rear subwoofers to be concealed, keeping the front wall clean.',
      };
    }
    return s;
  });
  const gate = reviewGate(holbornProposal(), copyWithoutDisplays);
  assert.ok(gate.outstanding.length > 0, 'removing display options is caught');
  // The display-options item should be outstanding
  const displayOutstanding = gate.outstanding.find((o) =>
    /75|83|110|TV|projector/i.test(o.item));
  assert.ok(displayOutstanding, 'a display-options item is outstanding');
});

test('removing the showroom / B2B demo instruction is caught', () => {
  const copyWithoutShowroom = COMPLETE_COPY.map((s) => {
    if (s.section === 'overall_design') {
      return {
        ...s,
        text: 'The specification is built around Level 1 to 2 performance, making it an accessible option. The final specification follows from the financial decisions the RP22 Level 1, 2, 3 or 4 discussion leads to.',
      };
    }
    return s;
  });
  const gate = reviewGate(holbornProposal(), copyWithoutShowroom);
  assert.ok(gate.outstanding.length > 0, 'removing showroom is caught');
  const showroomOutstanding = gate.outstanding.find((o) => /showroom|demo|consultative/i.test(o.item));
  assert.ok(showroomOutstanding, 'the showroom/demo item is outstanding');
});

test('removing the fabric wall / concealment instruction is caught', () => {
  // Remove ALL fabric, concealment, hidden and subwoofer mentions so the
  // fabric/concealment subjects are not reached by any sentence.
  const copyWithoutFabric = COMPLETE_COPY.map((s) => {
    if (s.section === 'system_design_summary') {
      return {
        ...s,
        text: 'This cinema is designed around a 75-inch or 83-inch TV for daily viewing, with a drop-down 110-inch projector screen for film nights. The loudspeakers are arranged around the seating for clear dialogue and immersive sound.',
      };
    }
    return s;
  });
  const gate = reviewGate(holbornProposal(), copyWithoutFabric);
  assert.ok(gate.outstanding.length > 0, 'removing fabric/concealment is caught');
  // At least one outstanding item should be about fabric, concealment, or
  // hidden subwoofers — the brief instructions those subjects belong to.
  const fabricOutstanding = gate.outstanding.find((o) =>
    /fabric|conceal|hidden|subwoofer|front.*rear/i.test(o.item));
  assert.ok(fabricOutstanding, 'a fabric/concealment/subwoofer item is outstanding');
});

test('removing the accessible Level 1-2 instruction is caught', () => {
  const copyWithoutAccessible = COMPLETE_COPY.map((s) => {
    if (s.section === 'overall_design') {
      return {
        ...s,
        text: 'The system is an ideal showroom demonstration: its spatial resolution makes it a consultative tool for discussing a client\'s room. The final specification follows from the financial decisions the RP22 Level 1, 2, 3 or 4 discussion leads to.',
      };
    }
    return s;
  });
  const gate = reviewGate(holbornProposal(), copyWithoutAccessible);
  assert.ok(gate.outstanding.length > 0, 'removing accessible Level 1-2 is caught');
  const accessibleOutstanding = gate.outstanding.find((o) => /accessible|level\s*1/i.test(o.item));
  assert.ok(accessibleOutstanding, 'the accessible Level 1-2 item is outstanding');
});

test('removing the Levels 1-4 financial consultation instruction is caught', () => {
  const copyWithoutFinancial = COMPLETE_COPY.map((s) => {
    if (s.section === 'overall_design') {
      return {
        ...s,
        text: 'The system is an ideal showroom demonstration: its spatial resolution makes it a consultative tool for discussing a client\'s room, and the specification is built around Level 1 to 2 performance, making it an accessible option.',
      };
    }
    return s;
  });
  const gate = reviewGate(holbornProposal(), copyWithoutFinancial);
  assert.ok(gate.outstanding.length > 0, 'removing Levels 1-4 financial consultation is caught');
  const financialOutstanding = gate.outstanding.find((o) => /financial|Level.*1.*2.*3.*4/i.test(o.item));
  assert.ok(financialOutstanding, 'the financial/Levels 1-4 item is outstanding');
});

test('a superficial keyword salad is rejected — not accepted as coverage', () => {
  // Copy that mentions the keywords but does not explain the matter.
  const keywordSalad = [
    {
      section: 'system_design_summary',
      text: 'This cinema has a TV, a screen, subwoofers, a fabric wall, and a showroom. Level 1, 2, 3, 4 financial decisions.',
    },
    {
      section: 'overall_design',
      text: 'The system is accessible and consultative with spatial resolution.',
    },
  ];
  const gate = reviewGate(holbornProposal(), keywordSalad);
  // Keyword salad should NOT pass — the items are not meaningfully addressed.
  assert.ok(gate.outstanding.length > 0,
    `keyword salad should not pass, got ${gate.outstanding.length} outstanding items`);
  assert.equal(gate.coverage?.complete, false, 'keyword salad does not complete coverage');
});

test('a generic "nice cinema with excellent sound" brief produces no material objectives', () => {
  const genericBrief = 'A nice cinema with excellent sound, lovely pictures and comfortable seating.';
  const items = briefItems({ client_brief: genericBrief });
  assert.equal(items.length, 0, 'generic filler brief produces no material items');
  // The gate with an empty brief should not block (nothing to address).
  const gate = reviewGate({
    client_brief: genericBrief,
    metadata: { brief_coverage_required: true },
  }, [{ section: 'overall_design', text: 'Some copy.' }]);
  assert.equal(gate.outstanding.length, 0, 'empty material brief has no outstanding items');
  assert.equal(gate.coverage?.complete, true, 'empty material brief is complete (nothing to address)');
});

test('the gate uses plain dealer-facing section labels, not underscore keys', () => {
  const incompleteCopy = [{ section: 'overall_design', text: 'The design is good.' }];
  const gate = reviewGate(holbornProposal(), incompleteCopy);
  assert.ok(gate.outstanding.length > 0, 'incomplete copy has outstanding items');
  // The reason should contain plain labels like "Design Summary" or "Dynamic Range",
  // NOT underscore keys like "system_design_summary" or reason codes.
  if (gate.reason) {
    assert.ok(!/system_design_summary|spatial_resolution|dynamic_range|overall_design/.test(gate.reason),
      'reason should not contain underscore section keys');
    assert.ok(/Design Summary|Dynamic Range|Spatial Resolution|Overall Design|Timbre Matching/.test(gate.reason),
      'reason should contain plain dealer-facing section labels');
  }
});

test('a proposal without brief_coverage_required is never affected', () => {
  const gate = reviewGate(
    { client_brief: HOLBORN_BRIEF, metadata: {} },
    [{ section: 'overall_design', text: 'Nothing relevant.' }],
  );
  assert.equal(gate.applies, false, 'gate does not apply without brief_coverage_required');
  assert.equal(gate.blocked, false, 'gate does not block');
  assert.equal(gate.outstanding.length, 0, 'no outstanding items');
});

test('hard enforcement is off by default and on only when explicitly requested', () => {
  const incompleteCopy = [{ section: 'overall_design', text: 'The design is good.' }];
  // Default: review only, never blocks.
  const reviewOnly = briefCoverageGate(holbornProposal(), incompleteCopy);
  assert.equal(reviewOnly.blocked, false, 'default is review only (not blocked)');
  assert.ok(reviewOnly.outstanding.length > 0, 'outstanding items are still reported');
  // Explicit hard enforcement: blocks.
  const hard = briefCoverageGate(holbornProposal(), incompleteCopy, { hard_enforcement: true });
  assert.equal(hard.blocked, true, 'hard enforcement blocks');
  assert.ok(hard.reason, 'hard enforcement provides a reason');
});