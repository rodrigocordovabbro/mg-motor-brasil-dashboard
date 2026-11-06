export type UserRole = "admin" | "client";
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
};
export function isAdministrator(role: UserRole | undefined): boolean {
  return role === "admin";
}
