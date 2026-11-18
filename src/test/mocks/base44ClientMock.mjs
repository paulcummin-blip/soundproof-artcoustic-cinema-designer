// Mock for @/api/base44Client. useProjectLoader calls:
//   base44.functions.invoke('migrateProjectVersions', {...})
//   base44.entities.ProjectVersion.update(versionId, {...})
//   base44.entities.ProjectVersion.list(...)
// All are recorded so the test can assert on them; all resolve immediately.

const functionInvocations = [];
const versionUpdates = [];
const versionListCalls = [];

const base44 = {
  functions: {
    invoke: async (name, payload) => {
      functionInvocations.push({ name, payload });
      // migrateProjectVersions returns the version records it touched.
      if (name === 'migrateProjectVersions') {
        return { data: payload?.versionIds?.map((id) => ({ id, version_number: 1 })) || [] };
      }
      return { data: {} };
    },
  },
  entities: {
    ProjectVersion: {
      update: async (versionId, data) => {
        versionUpdates.push({ versionId, data });
        return { id: versionId, ...data };
      },
      list: async (opts) => {
        versionListCalls.push(opts);
        return [];
      },
    },
    Project: {
      update: async (id, data) => {
        return { id, ...data };
      },
    },
  },
  auth: {
    me: async () => ({ id: 'test-user', email: 'test@test', role: 'admin' }),
  },
};

export { base44, functionInvocations, versionUpdates, versionListCalls };