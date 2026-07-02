// Access level scale per module. Levels are ordered so higher levels imply lower ones.

export const LEVELS = {
  NONE: 0,
  READ: 1,
  EDIT: 2,
  ADMIN: 3,
};

export const LEVEL_NAMES = {
  [LEVELS.NONE]: "none",
  [LEVELS.READ]: "read",
  [LEVELS.EDIT]: "edit",
  [LEVELS.ADMIN]: "admin",
};