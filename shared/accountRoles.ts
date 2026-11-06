export type UserRole = "admin" | "client" | "bbro";
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
  bbro: "BBRO",
};
export function isAdministrator(role: UserRole | undefined): boolean {
  return role === "admin";
}

export function canValidateCRM(role: UserRole | undefined): boolean {
  return role === "admin" || role === "bbro";
}

export function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "client" || value === "bbro";
}

export function normalizeUserRole(value: unknown): UserRole {
  return isUserRole(value) ? value : "client";
}
