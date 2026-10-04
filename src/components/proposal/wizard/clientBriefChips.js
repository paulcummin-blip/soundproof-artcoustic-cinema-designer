/**
 * Client Brief prompt chips — selection and insertion rules.
 *
 * Selecting a chip is local UI state: nothing is written to the Client Brief
 * until the user confirms with "Add selected to brief". This module holds the
 * pure rules behind that — toggling a chip's selected state, and inserting the
 * selected prompts as bullets without ever adding a prompt the brief already
 * contains.
 *
 * Pure: no React, no database, no browser.
 */

const BULLET_PREFIX = /^[\s\u2022\u00b7\-*]+/;

/** Comparison key for a prompt: no bullet marker, single spaces, lowercase. */
export function normalisePrompt(value) {
  return String(value ?? '')
    .replace(BULLET_PREFIX, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The prompts the brief already contains, as normalised keys. */
export function briefPromptKeys(brief) {
  const keys = new Set();
  for (const line of String(brief ?? '').split('\n')) {
    const key = normalisePrompt(line);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Selected chip labels in click order. Clicking a selected chip deselects it,
 * clicking an unselected chip selects it. Never mutates the incoming list.
 */
export function toggleChipSelection(selected = [], label) {
  const key = normalisePrompt(label);
  if (!key) return selected;
  const index = selected.findIndex((item) => normalisePrompt(item) === key);
  if (index === -1) return [...selected, label];
  return selected.filter((_, position) => position !== index);
}

/**
 * Insert every selected prompt into the brief as a bullet, skipping any prompt
 * the brief already contains. Returns the next brief together with what was
 * added and what was already there, so the caller can say "Already in the
 * brief" instead of writing a duplicate.
 */
export function appendSelectedPrompts(brief, labels = []) {
  const current = String(brief ?? '');
  const keys = briefPromptKeys(current);
  const added = [];
  const duplicates = [];

  for (const label of labels) {
    const key = normalisePrompt(label);
    if (!key) continue;
    if (keys.has(key)) {
      duplicates.push(label);
      continue;
    }
    keys.add(key);
    added.push(String(label).trim());
  }

  if (added.length === 0) return { next: current, added, duplicates };

  let next = current.replace(/\s+$/, '');
  for (const prompt of added) {
    const prefix = next && !next.endsWith('\n') ? '\n' : '';
    next = next ? `${next}${prefix}• ${prompt}` : `• ${prompt}`;
  }
  return { next, added, duplicates };
}