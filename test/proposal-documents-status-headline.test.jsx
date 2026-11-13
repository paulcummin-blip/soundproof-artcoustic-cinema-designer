import { test, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectDocumentsStatus, {
  DOCUMENTS_HEADLINE,
} from '@/components/proposal/sourceAuthority/ProjectDocumentsStatus';
import { READINESS_STATE } from '@/components/proposal/sourceAuthority/proposalReadinessAuthority';

const makeCell = (state, current = false) => ({ state, current, checking: false });
const currentCell = () => makeCell(READINESS_STATE.CURRENT, true);
const missingCell = () => makeCell(READINESS_STATE.MISSING, false);
const staleCell = () => makeCell(READINESS_STATE.STALE, false);

const makeRow = (project, speakerDesign) => ({
  versionId: 'v1',
  versionName: 'Current Design',
  project,
  speakerDesign,
});

const renderStatus = (rows, preparingVersionIds = new Set()) => {
  const gate = {
    rows,
    checking: false,
    ready: rows.every((r) => r.project?.current && r.speakerDesign?.current),
  };
  return renderToStaticMarkup(
    React.createElement(ProjectDocumentsStatus, {
      gate,
      projectId: 'p1',
      generatingVersionIds: new Set(),
      preparingVersionIds,
      speakerDesignErrors: {},
    })
  );
};

const headlineText = (markup) => {
  const m = markup.match(
    /(Documents current|Documents not generated|Update required|Preparing documents|Updating project documents)/,
  );
  return m ? m[0] : null;
};

const statusAttr = (markup) => {
  const m = markup.match(/data-project-documents-status="([^"]+)"/);
  return m ? m[1] : null;
};

test('both documents missing — summary is not Current', () => {
  const markup = renderStatus([makeRow(missingCell(), missingCell())]);
  expect(headlineText(markup)).toBe(DOCUMENTS_HEADLINE.NOT_GENERATED);
  expect(statusAttr(markup)).toBe('not_generated');
});

test('one document missing — summary is not Current', () => {
  const markup = renderStatus([makeRow(currentCell(), missingCell())]);
  expect(headlineText(markup)).toBe(DOCUMENTS_HEADLINE.NOT_GENERATED);
  expect(statusAttr(markup)).toBe('not_generated');
});

test('both documents current — summary is Current', () => {
  const markup = renderStatus([makeRow(currentCell(), currentCell())]);
  expect(headlineText(markup)).toBe(DOCUMENTS_HEADLINE.CURRENT);
  expect(statusAttr(markup)).toBe('current');
});

test('a stale document reads Update required, never Current', () => {
  const markup = renderStatus([makeRow(staleCell(), currentCell())]);
  expect(headlineText(markup)).toBe(DOCUMENTS_HEADLINE.UPDATE_REQUIRED);
  expect(statusAttr(markup)).toBe('update_required');
});