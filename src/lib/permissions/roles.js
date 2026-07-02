// Central definition of all Roles in the system.
// Every User has exactly one Role (stored on User.app_role).

export const ROLES = {
  SUPER_ADMIN: "Super Admin",
  ADMINISTRATOR: "Administrator",
  DESIGNER_PRO: "Designer Pro",
  DESIGNER_LITE: "Designer Lite",
  VIEWER: "Viewer",
};

export const ALL_ROLES = Object.values(ROLES);

export const DEFAULT_ROLE = ROLES.DESIGNER_LITE;