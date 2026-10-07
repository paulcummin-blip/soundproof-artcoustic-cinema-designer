/**
 * Loads the real report snapshot store in-process, with its two outward
 * dependencies (the SDK client and the in-session announcement) supplied by the
 * harness. Nothing else about the store is changed: the module under test is the
 * app's own file, so the atomicity asserted here is the atomicity that ships.
 *
 * The canonical rule is imported by absolute file URL because a data: URL module
 * cannot resolve a bare '@/' specifier.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STORE_PATH = 'src/components/report/reportSnapshotStore.js';
const CANONICAL_PATH = 'src/components/report/reportSnapshotCanonical.js';

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * A stand-in ReportSnapshot client. It records every call, so a test can prove a
 * refused write performed NO database mutation at all — not an update, not a
 * create — and it keeps rows so "the saved report is untouched" can be compared
 * byte for byte.
 */
export function createSnapshotClient(rows = [], { failUpdate = false } = {}) {
  const calls = [];
  const store = new Map(rows.map((row) => [row.id, copy(row)]));

  return {
    calls,
    store,
    read: (id) => copy(store.get(id)),
    client: {
      entities: {
        ReportSnapshot: {
          async filter(query = {}, options = {}) {
            calls.push({ op: 'filter', query, options });
            const items = [...store.values()].filter((row) => (
              (!query.project_id || row.project_id === query.project_id)
              && (!query.version_id || row.version_id === query.version_id)
              && (!query.report_type || row.report_type === query.report_type)
            ));
            return { items: copy(items), has_more: false, next_cursor: null };
          },
          async get(id) {
            calls.push({ op: 'get', id });
            return copy(store.get(id) ?? null);
          },
          async update(id, record) {
            calls.push({ op: 'update', id });
            if (failUpdate) throw new Error('the write was interrupted');
            const next = { ...copy(record), id };
            store.set(id, next);
            return copy(next);
          },
          async create(record) {
            calls.push({ op: 'create' });
            const id = `new-${store.size + 1}`;
            const next = { ...copy(record), id };
            store.set(id, next);
            return copy(next);
          },
        },
      },
    },
  };
}

/** Import the store with a given client. Each call yields its own module instance. */
export async function loadSnapshotStore(client, notify = () => {}) {
  const source = fs.readFileSync(STORE_PATH, 'utf8');
  const canonicalUrl = pathToFileURL(path.join(process.cwd(), CANONICAL_PATH)).href;

  const replacements = [
    ["import { base44 } from '@/api/base44Client';", 'const base44 = globalThis.__snapshotStoreClient;'],
    ["import { notifyReportSourceStored } from '@/components/proposal/sourceAuthority/reportSourceSignal';", 'const notifyReportSourceStored = globalThis.__snapshotStoreNotify;'],
    [
      "import { resolveEvidenceWrite, selectCanonicalReportSnapshot } from '@/components/report/reportSnapshotCanonical';",
      `import { resolveEvidenceWrite, selectCanonicalReportSnapshot } from '${canonicalUrl}';`,
    ],
  ];

  let patched = source;
  replacements.forEach(([find, replace]) => {
    if (!patched.includes(find)) {
      throw new Error(`The store harness no longer matches reportSnapshotStore.js: ${find}`);
    }
    patched = patched.replace(find, replace);
  });

  globalThis.__snapshotStoreClient = client;
  globalThis.__snapshotStoreNotify = notify;
  const module = await import(`data:text/javascript;base64,${Buffer.from(patched).toString('base64')}`);
  return module;
}