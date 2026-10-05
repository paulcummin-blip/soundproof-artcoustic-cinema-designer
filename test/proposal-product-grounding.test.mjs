/**
 * Product-grounding acceptance tests.
 *
 * The rule: a proposal may name only the products selected in the design version
 * it is about — and when a sentence names one it may not, the WHOLE sentence is
 * rewritten in clean role-based wording, never patched token by token.
 *
 * Run: node test/proposal-product-grounding.test.mjs
 */

import { buildProductGrounding, buildProductVocabularyRule, groundProductMentions } from '../base44/shared/proposalProductGrounding.js';

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, pass: false, error: error.message });
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
};
const assert = {
  ok: (value, message) => { if (!value) throw new Error(message); },
  equal: (actual, expected, message) => {
    if (actual !== expected) throw new Error(`${message}\n      got      ${actual}\n      expected ${expected}`);
  },
  deep: (actual, expected, message) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message} (got ${JSON.stringify(actual)})`);
  },
  match: (text, pattern, message) => { if (!pattern.test(text)) throw new Error(message); },
  notMatch: (text, pattern, message) => { if (pattern.test(text)) throw new Error(message); },
};
const readOut = (html, label) => {
  const text = html.replace(/<[^>]*>/g, '');
  console.log(`      ${label}: ${text}`);
  return text;
};

/* ---------------------------------------------------------------- *
 * The frozen authority the grounding is built from                  *
 * ---------------------------------------------------------------- */

const snapshot = (roles, subs) => ({
  available: true,
  version: { id: 'v-level-1', name: 'Level 1 version' },
  room: { acoustic_treatment: { enabled: false, quantity: 0 } },
  system: {
    product_roles: roles.map(([role, model]) => ({ role, role_description: role, model_label: model })),
    subwoofer_strategy: { count: subs.length, models: subs, strategy_text: `${subs.length} × ${subs.join(', ')}` },
  },
});

const singleGrounding = buildProductGrounding({
  snapshot: snapshot([['lcr', 'Q6-3'], ['surround', 'Evolve 2-1'], ['overhead', 'Architect 2-1']], ['sub4-12']),
  resolvedType: 'system_summary',
});
/* Same version, but no single overhead model: the guard must not pick one. */
const ambiguousOverheadGrounding = buildProductGrounding({
  snapshot: snapshot([['lcr', 'Q6-3'], ['overhead', 'Architect 2-1'], ['overhead', 'Architect 4-2']], ['sub4-12']),
  resolvedType: 'system_summary',
});
const comparisonGrounding = buildProductGrounding({
  resolvedType: 'comparison',
  versionEvidence: [
    { version_id: 'v1', version_name: 'Level 1 version', label: 'Option A',
      speaker_package: [{ role: 'lcr', model: 'Q6-3' }, { role: 'surround', model: 'Evolve 2-1' }, { role: 'overhead', model: 'Architect 2-1' }],
      subwoofer_package: { strategy: '2 × SUB4-12' } },
    { version_id: 'v4', version_name: 'Level 4 version', label: 'Option B',
      speaker_package: [{ role: 'lcr', model: 'Q8-5' }, { role: 'surround', model: 'Evolve 6-3' }, { role: 'overhead', model: 'Spitfire Cloud' }],
      subwoofer_package: { strategy: '4 × SUB3-12' } },
  ],
  comparisonTable: { rows: [
    { key: 'lcr', area: 'LCR', values: ['Q6-3', 'Q8-5'] },
    { key: 'surrounds', area: 'Surrounds / wides', values: ['Evolve 2-1', 'Evolve 6-3'] },
    { key: 'overheads', area: 'Overheads', values: ['Architect 2-1', 'Spitfire Cloud'] },
    { key: 'subwoofers', area: 'Subwoofers', values: ['2 × SUB4-12', '4 × SUB3-12'] },
  ] },
});

const rule = buildProductVocabularyRule(singleGrounding);
const clean = (html, grounding = singleGrounding) => {
  const out = groundProductMentions(html, grounding);
  assert.ok(out.grounded, `not grounded: ${JSON.stringify(out.unresolved)}`);
  assert.notMatch(html.replace(/<[^>]*>/g, ''), /spitfire|cloud|mikro|diablo/i, `an unselected name survived: ${out.html}`);
  readOut(out.html, 'AFTER ');
  return out.html;
};

/* A — the allowed list is the version's own system table, nothing else */
check('A  allowedProducts come from the version system table', () => {
  assert.deep(singleGrounding.versions[0].allowedNames, ['Q6-3', 'Evolve 2-1', 'Architect 2-1', 'SUB4-12'], 'Level 1 products');
  assert.ok(!singleGrounding.versions[0].allowedNames.includes('Spitfire Cloud'), 'Cloud must not be allowed');
  assert.match(rule, /Q6-3/, 'rule names Q6-3');
  assert.match(rule, /Evolve 2-1/, 'rule names Evolve 2-1');
  assert.match(rule, /Architect 2-1/, 'rule names Architect 2-1');
  assert.match(rule, /SUB4-12/, 'rule names SUB4-12');
  assert.match(rule, /Never name a product from another version/, 'rule forbids other sources');
  assert.match(rule, /Never join a selected product with a product that is not on the list/, 'rule forbids joined phrases');
  assert.match(rule, /the selected Artcoustic overhead loudspeakers/, 'rule offers role wording');
});

/* Acceptance 1 — the bad "combines X and Y" sentence is replaced, not patched */
check('A  the unselected product sentence is rewritten whole', () => {
  const before = '<p>The overhead layer combines an Architect and Spitfire Cloud overhead array, so effects travel convincingly above the seats.</p>';
  console.log(`      BEFORE: ${before}`);
  const after = clean(before);
  assert.equal(after, '<p>The overhead layer uses Architect 2-1 loudspeakers to provide coverage above the seating area.</p>', 'clean single-role sentence');
  const text = readOut(after, 'AFTER ');
  assert.notMatch(text, /\bselected\b[^.]*\barray\b/i, 'no generic wording left glued to "array"');
  assert.notMatch(text, /an Architect and/i, 'no stitched product phrase');
});

/* Acceptance 1b — with no single selected overhead model, role wording is used */
check('A  ambiguous overhead model falls back to role wording', () => {
  const before = '<p>The overhead layer combines an Architect and Spitfire Cloud overhead array, so effects travel convincingly above the seats.</p>';
  const after = clean(before, ambiguousOverheadGrounding);
  assert.equal(after, '<p>The overhead layer uses the selected Artcoustic overhead loudspeakers to provide coverage above the seating area.</p>', 'role wording');
});

/* Acceptance 1c (user example B) — only the layer that was misnamed goes generic */
check('B  timbre sentence keeps its valid product and rewrites the rest', () => {
  const before = '<p>Timbre consistency comes from the Spitfire Cloud overhead array and the Q6-3 screen stage.</p>';
  console.log(`      BEFORE: ${before}`);
  const after = clean(before);
  assert.equal(after, '<p>Timbre consistency comes from the Q6-3 screen stage and the selected Artcoustic overhead loudspeakers.</p>', 'clean timbre sentence');
});

/* Acceptance 4 — a version-scoped sentence states its layers, not its models */
check('C  version-scoped sentence uses clean role wording', () => {
  const before = '<p>The Level 4 version keeps the Q6-3 screen stage but adds Spitfire Cloud overheads.</p>';
  console.log(`      BEFORE: ${before}`);
  const out = groundProductMentions(before, comparisonGrounding);
  assert.ok(out.grounded, 'grounded');
  assert.equal(out.html, '<p>The Level 4 version uses its selected screen and overhead loudspeakers to support the required coverage.</p>', 'clean version sentence');
  assert.equal(out.violations[0].name, 'Q6-3', 'Q6-3 reported against the Level 4 version');
  readOut(out.html, 'AFTER ');
});

/* Acceptance 4 — each version keeps its own products */
check('C  each version keeps its own valid products', () => {
  assert.deep(comparisonGrounding.versions[0].allowedNames, ['Q6-3', 'Evolve 2-1', 'Architect 2-1', 'SUB4-12'], 'Level 1');
  assert.deep(comparisonGrounding.versions[1].allowedNames, ['Q8-5', 'Evolve 6-3', 'Spitfire Cloud', 'SUB3-12'], 'Level 4');
  const level4 = '<p>The Level 4 version uses Spitfire Cloud overheads with Q8-5 across the screen.</p>';
  assert.equal(groundProductMentions(level4, comparisonGrounding).html, level4, 'Level 4 copy is untouched');
});

/* Acceptance 2 — "pairs X with Y and Z" is rewritten whole */
check('D  joined product phrase is rewritten whole', () => {
  const before = '<p>The design pairs Q6-3 across the screen with Spitfire Cloud overheads and SUB4-12 subwoofers.</p>';
  console.log(`      BEFORE: ${before}`);
  const after = clean(before);
  assert.equal(after, '<p>This design uses the Q6-3 screen stage, the selected Artcoustic overhead loudspeakers and the SUB4-12 subwoofer system to support the required performance.</p>', 'clean joined-phrase sentence');
});

/* Acceptance 3 — no awkward possessives */
check('D  possessive never reaches the client', () => {
  const before = "<p>Spitfire Cloud's overhead array sits above the seats.</p>";
  console.log(`      BEFORE: ${before}`);
  const after = clean(before);
  assert.equal(after, '<p>The overhead layer uses Architect 2-1 loudspeakers to provide coverage above the seating area.</p>', 'clean sentence');
  assert.notMatch(after, /''s|'s\s+s\b/, 'no broken possessive');
});

/* Subwoofer role wording, and a layer name that is not a loudspeaker */
check('D  subwoofer layer wording is clean', () => {
  const before = '<p>The system combines Spitfire Cloud overheads with Mikro height channels and two SUB3-12 subwoofers.</p>';
  console.log(`      BEFORE: ${before}`);
  const after = clean(before);
  assert.equal(after, '<p>This design uses its selected overhead loudspeakers and the selected subwoofer system to support the required performance.</p>', 'clean role wording');
});

/* Acceptance 4 — every name left is in the version's system table */
check('E  every remaining name is in the version system table', () => {
  const before = '<p>The system uses Q6-3 across the screen, Evolve 2-1 around the seats, Architect 2-1 overhead and two SUB4-12 subwoofers, with Spitfire Cloud overheads added later.</p>';
  console.log(`      BEFORE: ${before}`);
  const after = clean(before);
  const allowed = singleGrounding.versions[0].allowedNames;
  for (const name of ['Q6-3', 'Q8-5', 'Evolve 2-1', 'Evolve 6-3', 'Architect 2-1', 'Spitfire Cloud', 'SUB3-12', 'SUB4-12', 'Mikro', 'Diablo', 'Spitfire A6']) {
    const pattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (pattern.test(after)) assert.ok(allowed.includes(name), `${name} appears but is not in the system table`);
  }
  assert.notMatch(after, /Spitfire Cloud/, 'Cloud removed');
});

/* Version scoping: a short reference at the start scopes the sentence */
check('F  a sentence opening "Level 4 ..." is scoped to that version', () => {
  const before = '<p>Level 4 relies on Q6-3 across the screen for the front stage.</p>';
  console.log(`      BEFORE: ${before}`);
  const out = groundProductMentions(before, comparisonGrounding);
  assert.equal(out.html, '<p>Level 4 uses its selected screen loudspeakers to support the required coverage.</p>', 'clean scoped sentence');
  assert.equal(out.violations[0].name, 'Q6-3', 'Q6-3 reported');
});

/* Version scoping must not be over-eager: an RP22 level is not a version */
check('F  an RP22 level mentioned in passing does not scope the sentence', () => {
  const sentence = '<p>The design reaches Level 1 with Q8-5 across the screen.</p>';
  const out = groundProductMentions(sentence, comparisonGrounding);
  assert.equal(out.html, sentence, 'Q8-5 is valid in the comparison, so nothing changes');
  assert.equal(out.violations.length, 0, 'nothing reported');
});

/* Valid copy is never touched */
check('G  a sentence naming only selected products is untouched', () => {
  const sentence = '<p>Timbre consistency comes from the Evolve 2-1 surrounds and the Q6-3 screen stage.</p>';
  assert.equal(groundProductMentions(sentence, singleGrounding).html, sentence, 'untouched');
});

/* No authority, no rule, no change */
check('H  without a version authority nothing is rewritten', () => {
  const empty = buildProductGrounding({ snapshot: null, resolvedType: 'single' });
  assert.ok(!empty.available, 'not available');
  assert.equal(buildProductVocabularyRule(empty), '', 'no rule');
  const sentence = '<p>Anything at all with a Spitfire Cloud in it.</p>';
  assert.equal(groundProductMentions(sentence, empty).html, sentence, 'untouched');
});

const passed = results.filter((result) => result.pass).length;
console.log(`\n${passed}/${results.length} product-grounding checks passed`);
if (passed !== results.length) {
  console.log('\nAcceptance: PRODUCT GROUNDING FAILURES ABOVE');
  process.exitCode = 1;
} else {
  console.log('Acceptance: product grounding PASS');
}