// Mock for @/entities/Project. useProjectLoader calls Project.update for
// manual saves and autosaves. Recorded so the test can assert the last
// written seating positions.

const projectUpdates = [];

export const Project = {
  update: async (id, data) => {
    projectUpdates.push({ id, data });
    return { id, ...data };
  },
  filter: async () => [],
  list: async () => [],
  create: async () => ({}),
};

export { projectUpdates };