/**
 * projectReportIssues
 * -------------------
 * Presentation only.
 *
 * Translates the readiness authorities' own verdicts into the short, plain
 * English list the Project Report status popover shows. It adds no rule,
 * removes no gate, and changes no assessment: every issue here is derived from
 * a failure the canonical authorities already reported.
 *
 * Two rules govern the wording:
 *   - Say what needs attention, never how the software is built. Field paths,
 *     gate keys and publication terminology stay internal.
 *   - A failure that cannot be named in plain English is still shown, stated
 *     generically, so a genuine blocker is never hidden.
 *
 * A parameter that has been assessed and failed is NOT outstanding — it is
 * complete. Its absence from this list is not decided here: the completeness
 * authority already excludes it, and this module reads that verdict.
 */

/** The bass domain: one saved result, so it is named in one line. */
const BASS_PARAMETERS = new Set([14, 18, 19, 20]);

/** Short, user-facing names. Presentation only — never a scoring authority. */
const PARAMETER_LABELS = Object.freeze({
  1: 'Wall Clearance',
  2: 'Speaker Layout & Decoding',
  3: 'Screen Speaker Placement',
  4: 'Screen Speaker Level Match',
  5: 'Surround Speaker Spacing',
  6: 'Surround Speaker Level Match',
  7: 'Wide Speaker Alignment',
  8: 'Upfiring Speakers',
  9: 'Overhead Speaker Spacing',
  10: 'Overhead Speaker Level Match',
  11: 'Surround & Overhead Placement',
  12: 'Screen Speaker SPL',
  13: 'Surround Speaker SPL',
  14: 'Bass SPL Capability',
  15: 'Background Noise Floor',
  16: 'Screen Speaker Consistency',
  17: 'Surround Speaker Consistency',
  18: 'Bass Extension',
  19: 'Bass Response',
  20: 'Seat-to-Seat Bass Consistency',
  21: 'Early Reflections',
});

/**
 * The publication contract's own field paths, said in plain English.
 * Ordered: the first match wins.
 */
const CONFLICT_TRANSLATIONS = Object.freeze([
  {
    key: 'speaker_configuration',
    match: /dolby_config/i,
    label: 'Speaker Configuration',
    reason: "Selected format doesn't match the speaker layout.",
  },
  {
    key: 'speaker_layout',
    match: /selected_speakers|placedSpeakers/i,
    label: 'Speaker Layout',
    reason: "The placed speakers don't match the saved layout.",
  },
  {
    key: 'seating_layout',
    match: /seating_positions|seating_rows|seats_per_row_by_row/i,
    label: 'Seating Layout',
    reason: "The seating doesn't match the saved layout.",
  },
  {
    key: 'room_dimensions',
    match: /report_project\.(room_width|room_length|room_height)|roomDims/i,
    label: 'Room Dimensions',
    reason: "The room dimensions don't match the saved layout.",
  },
  {
    key: 'screen_size',
    match: /screen_width_m|screen_size/i,
    label: 'Screen Size',
    reason: "The screen doesn't match the saved configuration.",
  },
  {
    key: 'subwoofer_layout',
    match: /subwooferInstances/i,
    label: 'Subwoofer Layout',
    reason: 'The subwoofer configuration is incomplete.',
  },
  {
    key: 'acoustic_treatment',
    match: /acoustic_treatment/i,
    label: 'Acoustic Treatment',
    reason: 'The acoustic treatment selection is incomplete.',
  },
  {
    key: 'project_details',
    match: /report_project\.(project_id|version_id|version_name|name)\b/i,
    label: 'Project Details',
    reason: 'The saved report belongs to a different project or version.',
  },
  {
    key: 'rp23_viewing',
    match: /rp23/i,
    label: 'RP23 Viewing',
    reason: 'Assessment required.',
  },
]);

/** The coarse required-data checklist, said in one line each. */
const CHECKLIST_LABELS = Object.freeze({
  room: { label: 'Room Layout', reason: 'Room dimensions are incomplete.' },
  speakers: { label: 'Speaker Layout', reason: 'No speakers have been placed.' },
  bass: { label: 'Bass Assessment', reason: 'Not calculated.' },
  images: { label: 'Project Images', reason: 'No images have been uploaded.' },
});

/** The parameter number a completeness key names, or null. */
function parameterNumber(key) {
  const match = String(key || '').toLowerCase().match(/^p(\d{1,2})$/);
  return match ? Number(match[1]) : null;
}

function parameterIssue(number) {
  return {
    key: `p${number}`,
    label: `P${number} · ${PARAMETER_LABELS[number] || 'Report Parameter'}`,
    reason: 'Assessment required.',
  };
}

/**
 * The bass domain is one saved result, so it is stated once — naming the
 * parameter the designer would go and look at, never four near-identical lines.
 */
function bassIssue(numbers) {
  const number = numbers.includes(19) ? 19 : numbers[0];
  return {
    key: 'bass',
    label: `P${number} · ${PARAMETER_LABELS[number]}`,
    reason: 'Calculation not saved.',
  };
}

/**
 * @param {object} input
 * @param {object} input.readiness          deriveReportReadiness() result
 * @param {object} input.reportCompleteness the version's own completeness audit
 * @returns {Array<{key:string, label:string, reason:string}>}
 */
export function resolveProjectReportIssues({ readiness = null, reportCompleteness = null } = {}) {
  if (readiness && readiness.state === 'ready') return [];

  const issues = [];
  const seen = new Set();
  const push = (issue) => {
    if (!issue || seen.has(issue.key)) return;
    seen.add(issue.key);
    issues.push(issue);
  };

  // ── Parameters the completeness authority reported as not yet assessed ──
  const missingKeys = [
    ...(reportCompleteness?.missingParameterKeys || []),
    ...(reportCompleteness?.incompleteSeatParameterKeys || []),
  ];
  const numbers = [...new Set(missingKeys.map(parameterNumber).filter(Boolean))].sort((a, b) => a - b);

  if (numbers.length > 8) {
    // Nothing saved yet: one line, never a long list and never a bare count.
    push({ key: 'assessment', label: 'RP22 Assessment', reason: 'Not yet complete.' });
  } else {
    const bassNumbers = numbers.filter((number) => BASS_PARAMETERS.has(number));
    if (bassNumbers.length > 0) push(bassIssue(bassNumbers));
    for (const number of numbers) {
      if (!BASS_PARAMETERS.has(number)) push(parameterIssue(number));
    }
  }

  // ── Genuine configuration conflicts, in plain English ──
  const reasonText = [
    readiness?.reason,
    ...(Array.isArray(readiness?.missing) ? readiness.missing.map((item) => item?.action) : []),
  ].filter(Boolean).join(' | ');

  for (const translation of CONFLICT_TRANSLATIONS) {
    if (!translation.match.test(reasonText)) continue;
    push({ key: translation.key, label: translation.label, reason: translation.reason });
  }

  // ── Required data the readiness checklist reported ──
  for (const item of Array.isArray(readiness?.missing) ? readiness.missing : []) {
    const mapped = CHECKLIST_LABELS[item?.key];
    if (mapped) push({ key: item.key, ...mapped });
  }

  // Never an empty explanation: an untranslated blocker is still stated.
  if (issues.length === 0) {
    push({ key: 'assessment', label: 'RP22 Assessment', reason: 'Not yet complete.' });
  }

  return issues;
}

export default resolveProjectReportIssues;