export type UserRole = "admin" | "client" | "client_admin" | "bbro";

export type PublicAccount = {
  id: number;
  username: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string | null;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  client: "Cliente",
  client_admin: "ADM - Cliente",
  bbro: "BBRO",
};

export type DashboardLocale = "pt-BR" | "en";

const ENGLISH_DASHBOARD_USERNAMES = new Set(["thiago"]);

export function normalizeUsernameForLocale(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("en-US")
    : "";
}

/** Resolves presentation language without changing the account's permissions. */
export function resolveDashboardLocale(
  role: unknown,
  username: unknown
): DashboardLocale {
  return isClientProfile(role) ||
    ENGLISH_DASHBOARD_USERNAMES.has(normalizeUsernameForLocale(username))
    ? "en"
    : "pt-BR";
}

/**
 * Unknown values are deliberately normalized to the least-privileged profile.
 * This keeps old rows and malformed session data on the overview-only path.
 */
export function normalizeUserRole(value: unknown): UserRole {
  return isUserRole(value) ? value : "client";
}

export function isAdministrator(role: unknown): boolean {
  return normalizeUserRole(role) === "admin";
}

/** Both client profiles are read-only client identities. */
export function isClientProfile(role: unknown): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === "client" || normalized === "client_admin";
}

/** Only newly-created/restricted clients are overview-only. */
export function isOverviewOnlyClient(role: unknown): boolean {
  return normalizeUserRole(role) === "client";
}

/** All authenticated profiles may read the aggregate Overview. */
export function canAccessOverview(role: unknown): boolean {
  return (
    isClientProfile(role) ||
    isAdministrator(role) ||
    normalizeUserRole(role) === "bbro"
  );
}

/** ADM - Cliente preserves the former client's read-only areas. */
export function canAccessRegions(role: unknown): boolean {
  return !isOverviewOnlyClient(role);
}

export function canAccessCRM(role: unknown): boolean {
  return !isOverviewOnlyClient(role);
}

export function canAccessLeads(role: unknown): boolean {
  return !isOverviewOnlyClient(role);
}

export function canAccessMediaPlan(role: unknown): boolean {
  return !isOverviewOnlyClient(role);
}

export function canAccessDispatch(role: unknown): boolean {
  return !isOverviewOnlyClient(role);
}

export function canExportLeads(role: unknown): boolean {
  return !isOverviewOnlyClient(role);
}

/** CRM validation remains a write-like capability for Admin and BBRO only. */
export function canValidateCRM(role: unknown): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === "admin" || normalized === "bbro";
}

export function isUserRole(value: unknown): value is UserRole {
  return (
    value === "admin" ||
    value === "client" ||
    value === "client_admin" ||
    value === "bbro"
  );
}
