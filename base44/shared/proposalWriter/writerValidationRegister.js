/** Internal claim-defence and testing commentary, not practical design qualifications. */
export function validationRegisterPhrase(text) {
  const rules = [
    ['claim_defence', /\b(?:(?:this|it|that)\s+is\s+not\s+(?:a\s+)?claim\s+about|(?:no\s+claim\s+(?:is|has\s+been)\s+made|not\s+a\s+claim\s+about))\b/i],
    ['parameter_defence', /\b(?:this|the)\s+(?:parameter|metric|score|result)\s+(?:does\s+not|cannot|can\s+not)\s+(?:prove|establish|demonstrate|confirm|validate)\b/i],
    ['validation_evidence', /\b(?:validation|validator|testing|test)\s+(?:evidence|results?|output|checks?|scores?)\s+(?:indicates?|shows?|confirms?|proves?|suggests?|demonstrates?)\b/i],
    ['internal_scoring', /\b(?:passed?|failed?|passes|fails)\s+(?:the\s+)?(?:validator|validation|fixture|regression|acceptance\s+test)\b|\b(?:internal\s+(?:testing|scoring|validation)|validator\s+(?:status|gate)|claim\s+(?:validation|admissibility)|validation\s+(?:register|pipeline|gate))\b/i],
  ];
  for (const [rule, pattern] of rules) {
    const match = String(text || '').match(pattern);
    if (match) return { rule, match: match[0] };
  }
  return null;
}
export default validationRegisterPhrase;