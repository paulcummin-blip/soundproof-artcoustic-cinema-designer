// TEMPORARY diagnostic — replays the Project Library pipeline on the real
// Marquee Home records fetched from the database (RLS-bypassing read).
import { test } from 'vitest';
import {
  markSuperseded,
  selectLatestExports,
} from '../components/library/librarySourceStatus.js';
import { REPORT_DOCUMENT_TYPES } from '../components/library/issuedDocument/issuedDocumentTypes.js';

const L4 = '6abbca6e199f13dc4d74ec4a';
const L1 = '6ac22230d40d8bb0a925ecab';

// verbatim from the database
const rows = [
  { id: 'e1', document_type: 'technical', version_id: L4, selected_version_ids: [L4], source_record_id: 's1', exported_at: '2026-10-04T17:11:41.936Z' },
  { id: 'e2', document_type: 'visual', version_id: L4, selected_version_ids: [L4], source_record_id: 's2', exported_at: '2026-10-04T17:11:29.962Z' },
  { id: 'e3', document_type: 'technical', version_id: L1, selected_version_ids: [L1], source_record_id: 's3', exported_at: '2026-10-04T15:29:09.821Z' },
  { id: 'e4', document_type: 'visual', version_id: L1, selected_version_ids: [L1], source_record_id: 's4', exported_at: '2026-10-04T15:28:57.086Z' },
  { id: 'e5', document_type: 'technical', version_id: L1, selected_version_ids: [L1], source_record_id: 's5', exported_at: '2026-10-04T15:12:20.558Z' },
  { id: 'e6', document_type: 'visual', version_id: L1, selected_version_ids: [L1], source_record_id: 's6', exported_at: '2026-10-04T15:12:09.247Z' },
];

test('DIAG — which records reach each version section', () => {
  const marked = markSuperseded(rows);
  const reportExports = selectLatestExports(
    marked.filter(({ record }) => REPORT_DOCUMENT_TYPES.includes(record.document_type)),
  );

  const sectionFor = (versionId) => selectLatestExports(
    reportExports.filter(({ record }) => (record.version_id || null) === versionId),
  );

  console.log('hook reportExports      :', reportExports.map((e) => e.record.id).join(','));
  console.log('Level 4 section exports :', sectionFor(L4).map((e) => `${e.record.id}:${e.record.document_type}`).join(',') || 'NONE');
  console.log('Level 1 section exports :', sectionFor(L1).map((e) => `${e.record.id}:${e.record.document_type}`).join(',') || 'NONE');
});