import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

// Temporary cold-open read inventory. Kept deliberately at the SDK boundary so
// every caller is counted; removed after the before/after measurement.
if (typeof window !== 'undefined' && !window.__SP_READ_DIAGNOSTICS_INSTALLED__) {
  window.__SP_READ_DIAGNOSTICS_INSTALLED__ = true;
  const counts = window.__SP_READ_DIAGNOSTICS__ = {
    Project: 0,
    ProjectVersion: 0,
    ProjectAnalysisCache: 0,
    readPublishedEngineering: 0,
  };
  const publishCounts = () => {
    document.documentElement.dataset.spReadDiagnostics = JSON.stringify(counts);
  };
  publishCounts();
  const instrumentFilter = (entityName) => {
    const entity = base44.entities?.[entityName];
    if (!entity || typeof entity.filter !== 'function') return;
    const original = entity.filter.bind(entity);
    entity.filter = (...args) => {
      counts[entityName] += 1;
      publishCounts();
      console.info('[restore-read]', entityName, counts[entityName]);
      return original(...args);
    };
  };
  ['Project', 'ProjectVersion', 'ProjectAnalysisCache'].forEach(instrumentFilter);
  const originalInvoke = base44.functions.invoke.bind(base44.functions);
  base44.functions.invoke = (name, ...args) => {
    if (name === 'readPublishedEngineering') {
      counts.readPublishedEngineering += 1;
      publishCounts();
      console.info('[restore-read]', name, counts.readPublishedEngineering);
    }
    return originalInvoke(name, ...args);
  };
}
