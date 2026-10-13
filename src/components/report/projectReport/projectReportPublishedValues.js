/**
 * projectReportPublishedValues.js
 * -------------------------------
 * HOW THE PROJECT REPORT'S OWN PAGES STATE A PUBLISHED VALUE.
 *
 * A publication carries the raw calculated figure beside the text it states for
 * that same result. The report's pages state the value the way the rest of the
 * report states it — the publication's own text — so a client never reads a
 * machine's calculated figure: bass extension prints as the RP22 whole-Hz result
 * (24 Hz, never 24.38521520063696) and a bass-response deviation as its own ± dB
 * result. The whole-Hz figure is the existing RP22 convention
 * (p18ExtensionAuthority floors the measured result).
 *
 * DISPLAY ONLY: nothing is calculated, re-graded or re-scaled here, and the value
 * a page states is always read from the SAME row as the level beside it, selected
 * by the same rule the published-parameter reader uses (P18 has one authority —
 * the canonical room result). A figure that already prints as a whole stated
 * value is left exactly as the publication states it.
 *
 * Pure: no React, no side effects.
 */

import { resolveP18DesignHz } from '@/components/utils/p18ExtensionAuthority';

const UNSTATED = new Set(['—', 'N/A', 'NOT CALCULATED']);

/** The raw calculated figure a published row carries. */
const rawValue = (row) => row?.value ?? row?.rawValue ?? null;

/** The publication's own text for a result, when it states one. */
function statedText(row) {
  for (const field of ['valueText', 'formatted', 'valueFormatted']) {
    const text = String(row?.[field] ?? '').trim();
    if (text && !UNSTATED.has(text.toUpperCase())) return text;
  }
  return null;
}

/**
 * The published row for one parameter, selected exactly as the published
 * parameter reader selects it — P18 reads its canonical room result, every other
 * parameter reads its stored row first.
 */
export function publishedParameterRow(summary, id) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) return null;
  const saved = summary?.parameter_index?.[`P${numeric}`] || null;
  const room = summary?.roomResultsByParameter?.[numeric]
    ?? summary?.roomResultsByParameter?.[String(numeric)]
    ?? null;
  return numeric === 18 && room ? room : (saved || room);
}

/**
 * One published value as the report states it. Bass extension is ALWAYS the RP22
 * whole-Hz result; any other figure is restated as the publication's own text
 * where the raw number would otherwise print as a fraction. A whole stated figure
 * is left exactly as the publication prints it today.
 */
export function statedParameterValue(row, id) {
  if (!row) return null;
  const raw = rawValue(row);

  if (Number(id) === 18) {
    const hz = resolveP18DesignHz(raw ?? row?.designHz);
    if (hz != null) return `${hz} Hz`;
  }

  const text = statedText(row);
  const value = Number(raw);
  const fractional = Number.isFinite(value) && !Number.isInteger(value);
  if (text && fractional) return text;
  if (raw == null || raw === '') return text;
  return String(raw);
}

/** The stated value of one parameter of a published summary. */
export function statedSummaryValue(summary, id) {
  return statedParameterValue(publishedParameterRow(summary, id), id);
}

/** The parameter ids a story rests on ('P18' → 18; an 'RP23' source has none). */
function storyParameterIds(highlight) {
  return (Array.isArray(highlight?.sources) ? highlight.sources : [])
    .map((source) => Number(String(source).replace(/^P/i, '')))
    .filter((id) => Number.isFinite(id));
}

/** One printed raw figure, and the value the report states for it. */
function restatementsFor(summary, ids) {
  return ids.map((id) => {
    const row = publishedParameterRow(summary, id);
    const printed = rawValue(row);
    if (printed == null || printed === '') return null;
    const asPrinted = String(printed);
    const stated = statedParameterValue(row, id);
    return stated && stated !== asPrinted ? { asPrinted, stated } : null;
  }).filter(Boolean);
}

/**
 * Replace one printed raw figure wherever the copy states it. Whole tokens only,
 * and never where the figure already carries a unit of its own, so a stated value
 * is never written twice.
 */
function restated(text, { asPrinted, stated }) {
  const escaped = asPrinted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\d.])${escaped}(?![\\d.]|[A-Za-z°])`, 'g');
  return String(text ?? '').replace(pattern, stated);
}

/**
 * One highlight with its published figures stated the way the report states them:
 * the evidence and the copy read "Extension to 16 Hz" and "±0 dB" rather than a
 * calculated float. The story, its evidence levels and its ranking are untouched
 * — only the number a client would have read is restated.
 */
export function statePublishedValues(highlight, summary) {
  if (!highlight || !summary) return highlight;
  const restatements = restatementsFor(summary, storyParameterIds(highlight));
  if (restatements.length === 0) return highlight;

  const state = (text) => restatements.reduce((out, entry) => restated(out, entry), String(text ?? ''));

  return {
    ...highlight,
    evidence: (Array.isArray(highlight.evidence) ? highlight.evidence : []).map((item) => (
      item?.value == null ? item : { ...item, value: state(item.value) }
    )),
    explanation: state(highlight.explanation),
  };
}

export default statedSummaryValue;