/** Only server-selected, validated copy. Never accepts image notes or fallbacks. */
export function validatedOptionsCopy(layer) {
  return typeof layer?.document_validation?.options_text === 'string'
    ? layer.document_validation.options_text : '';
}