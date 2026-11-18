// Client intentions are supplied by the brief, not inferred engineering results.
// A whole requirement must be explained in a passage; isolated words do not pass.
export function clientIntentCoverage(item, sections) {
  const passages = sections.flatMap(s => String(s.text || s.body || '')
    .replace(/<\/p>|<br\s*\/?\s*>/gi, '\n\n').replace(/<[^>]*>/g, ' ')
    .split(/\n\s*\n/).map(text => ({ section: s.section || s.section_type, passage: text.trim() })))
    .filter(p => p.passage);
  const has = (text, pattern) => pattern.test(text);
  const rules = [];
  const add = (applies, label, test) => { if (applies) rules.push({label, test}); };
  add(/\b(?:TV|television)\b/i.test(item) && /75|83|110/.test(item), 'Explain the specified TV options and movie-night projection.',
    t => [...item.matchAll(/\b(75|83|110)\b/g)].every(m => new RegExp('\\b'+m[1]+'(?:\\s*[-]?\\s*(?:inch|inches)|["″])','i').test(t))
      && /TV|television/i.test(t) && /project|screen/i.test(t) && /daily|day.to.day|everyday/i.test(t) && /film|movie/i.test(t));
  add(/fabric/i.test(item) && /hidden|conceal/i.test(item), 'Explain how the fabric screen wall conceals equipment.',
    t => /fabric|textile|cloth/i.test(t) && /wall/i.test(t) && /conceal|hid(?:e|den|ing)/i.test(t) && /subwoofer|front units|equipment/i.test(t));
  add(/recessed|recess/i.test(item), 'Explain that the retractable screen shares the wall recess.',
    t => /screen/i.test(t) && /recess|set back|tuck|partly.*wall/i.test(t) && /fabric|same|wall/i.test(t));
  add(/front and rear walls/i.test(item) && /busy/i.test(item), 'Explain front/rear bass placement and why front equipment is concealed.',
    t => /front/i.test(t) && /rear|back/i.test(t) && /subwoofer|bass|units/i.test(t) && /conceal|hid(?:e|den|ing)/i.test(t) && /busy|clutter|calm|clean|restrain/i.test(t));
  add(/showroom|consultative/i.test(item), 'Explain the showroom demonstration as a consultation tool for clients\' own rooms.',
    t => /showroom|demonstration (?:room|space)|trade clients|dealer demo/i.test(t)
      && /demonstrat|experience|hear|listen/i.test(t) && /client|visitor|customer/i.test(t)
      && /own (?:home|room|space|project)|their.*(?:room|priorities)|consult/i.test(t));
  add(/level\s*1\s*[-–—]\s*2/i.test(item) && /accessible/i.test(item), 'State the accessible Level 1–2 design positioning.',
    t => /levels?\s*1\s*(?:[-–—]|to|and|&)\s*2/i.test(t) && /accessible|entry.level|starting point|approachable|attainable/i.test(t)
      && /specification|design|system|performance|cinema/i.test(t));
  add(/financial/i.test(item) && /level/i.test(item), 'Explain RP22 Levels 1–4 as performance and financial choices for the client.',
    t => /(?:levels?\s*1\s*(?:[-–—]|to|through)\s*4|levels?\s*1\s*,\s*2\s*,\s*3\s*(?:,?\s*(?:or|and))?\s*4|levels?\s*1\s*and\s*2[\s\S]*levels?\s*3\s*(?:and|or)\s*4)/i.test(t)
      && /financial|cost|budget|invest|expenditure/i.test(t)
      && /client|customer|visitor/i.test(t) && /discuss|choice|choos|consider|consult|explain/i.test(t));
  if (!rules.length) return null;
  const matched = rules.map(rule => ({rule, evidence: passages.find(p => /\b(?:is|are|allows?|supports?|serves?|provides?|conceals?|hides?|keeps?|gives?|uses?|offers?|helps?|makes?|follows?|can|will|would|lets?|creates?|forms?|combines?|explains?)\b/i.test(p.passage) && rule.test(p.passage))}));
  return { complete: matched.every(m => m.evidence), missing: matched.filter(m => !m.evidence).map(m => m.rule.label),
    evidence: matched.filter(m => m.evidence).map(m => m.evidence) };
}
